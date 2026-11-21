package com.joyong.smsblocker

import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import android.provider.Telephony
import android.telephony.SmsManager
import androidx.core.content.FileProvider
import java.io.ByteArrayOutputStream
import java.io.File

/** A file picked for sending, already copied/compressed into our cache. */
class Attachment(val file: File, val mime: String, val name: String) {
    val isImage get() = mime.startsWith("image/")
}

/**
 * MMS transport. The phone's own MMS service talks to the carrier, so this
 * app still needs no internet permission. PDUs are handed over as files
 * through our FileProvider.
 */
object MmsSender {
    private const val EXTRA_FILE = "pdu_file"
    private const val EXTRA_FROM = "from"
    private const val EXTRA_TR_ID = "tr_id"
    private const val FALLBACK_MAX_SIZE = 300 * 1024
    private const val PDU_OVERHEAD = 8 * 1024

    enum class Result { OK, TOO_LARGE, FAILED }

    private fun smsManager(ctx: Context): SmsManager =
        if (Build.VERSION.SDK_INT >= 31) {
            ctx.getSystemService(SmsManager::class.java) ?: @Suppress("DEPRECATION") SmsManager.getDefault()
        } else {
            @Suppress("DEPRECATION") SmsManager.getDefault()
        }

    /** Carrier's MMS size limit in bytes. */
    fun maxMessageSize(ctx: Context): Int = runCatching {
        smsManager(ctx).carrierConfigValues.getInt(SmsManager.MMS_CONFIG_MAX_MESSAGE_SIZE)
    }.getOrNull()?.takeIf { it > 0 } ?: FALLBACK_MAX_SIZE

    // ---------------------------------------------------------------- files

    private fun dir(ctx: Context, name: String) = File(ctx.cacheDir, name).apply { mkdirs() }

    /** Delete our temporary files older than a day. */
    fun cleanup(ctx: Context) {
        val cutoff = System.currentTimeMillis() - 24 * 3600 * 1000L
        for (d in listOf("mms", "attach", "shared")) {
            File(ctx.cacheDir, d).listFiles()?.forEach { if (it.lastModified() < cutoff) it.delete() }
        }
    }

    fun shareUri(ctx: Context, file: File): Uri =
        FileProvider.getUriForFile(ctx, "${ctx.packageName}.files", file)

    // ---------------------------------------------------------------- attachments

    /**
     * Copy a picked file into our cache. Photos are resized/re-compressed to
     * fit the carrier limit; other files must already be small enough.
     */
    fun prepareAttachment(ctx: Context, uri: Uri): Pair<Result, Attachment?> {
        cleanup(ctx)
        val cr = ctx.contentResolver
        val mime = cr.getType(uri) ?: "application/octet-stream"
        var name = runCatching {
            cr.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
                ?.use { c -> if (c.moveToFirst()) c.getString(0) else null }
        }.getOrNull() ?: "file"
        name = name.replace(Regex("[\\\\/:\"*?<>|\\u0000]"), "_").take(60)
        val budget = maxMessageSize(ctx) - PDU_OVERHEAD

        val out = File(dir(ctx, "attach"), "${System.currentTimeMillis()}_$name")
        if (mime.startsWith("image/") && !mime.contains("gif")) {
            val jpeg = compressImage(ctx, uri, budget) ?: return Result.FAILED to null
            if (jpeg.size > budget) return Result.TOO_LARGE to null
            out.writeBytes(jpeg)
            val jpgName = name.substringBeforeLast('.', name) + ".jpg"
            return Result.OK to Attachment(out, "image/jpeg", jpgName)
        }
        val copied = runCatching {
            cr.openInputStream(uri)?.use { input -> out.outputStream().use { input.copyTo(it) } }
        }.getOrNull() ?: return Result.FAILED to null
        if (copied > budget) {
            out.delete()
            return Result.TOO_LARGE to null
        }
        return Result.OK to Attachment(out, mime, name)
    }

    private fun compressImage(ctx: Context, uri: Uri, maxBytes: Int): ByteArray? = runCatching {
        val cr = ctx.contentResolver
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        cr.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        val maxDim = 1280
        var sample = 1
        while (bounds.outWidth / (sample * 2) >= maxDim || bounds.outHeight / (sample * 2) >= maxDim) sample *= 2
        var bmp = cr.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample })
        } ?: return@runCatching null

        // Respect camera rotation.
        val rotation = runCatching {
            cr.openInputStream(uri)?.use {
                when (ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
                    ExifInterface.ORIENTATION_ROTATE_90 -> 90f
                    ExifInterface.ORIENTATION_ROTATE_180 -> 180f
                    ExifInterface.ORIENTATION_ROTATE_270 -> 270f
                    else -> 0f
                }
            } ?: 0f
        }.getOrDefault(0f)

        fun scaled(src: Bitmap, factor: Float, rot: Float): Bitmap {
            val m = Matrix().apply { postScale(factor, factor); postRotate(rot) }
            return Bitmap.createBitmap(src, 0, 0, src.width, src.height, m, true)
        }
        val first = minOf(1f, maxDim.toFloat() / maxOf(bmp.width, bmp.height))
        bmp = scaled(bmp, first, rotation)

        var quality = 85
        var result: ByteArray? = null
        while (result == null) {
            val bos = ByteArrayOutputStream()
            bmp.compress(Bitmap.CompressFormat.JPEG, quality, bos)
            when {
                bos.size() <= maxBytes -> result = bos.toByteArray()
                quality > 45 -> quality -= 10
                maxOf(bmp.width, bmp.height) < 320 -> result = bos.toByteArray() // caller rejects if still too big
                else -> {
                    bmp = scaled(bmp, 0.75f, 0f)
                    quality = 80
                }
            }
        }
        result
    }.getOrNull()

    // ---------------------------------------------------------------- send

    /** Send text and/or attachments as one MMS (also used for long texts = LMS). */
    fun send(ctx: Context, address: String, text: String, attachments: List<Attachment>): Result {
        cleanup(ctx)
        val parts = mutableListOf<MmsPdu.Part>()
        if (text.isNotBlank()) parts.add(MmsPdu.Part.text(text))
        attachments.forEachIndexed { i, a ->
            val bytes = runCatching { a.file.readBytes() }.getOrNull() ?: return Result.FAILED
            parts.add(MmsPdu.Part(a.mime, a.name.ifBlank { "file_$i" }, bytes))
        }
        if (parts.isEmpty()) return Result.FAILED

        val trId = "T" + java.lang.Long.toHexString(System.currentTimeMillis())
        val pdu = MmsPdu.encodeSendReq(address, parts, trId)
        if (pdu.size > maxMessageSize(ctx)) return Result.TOO_LARGE

        val msgUri = MmsStore.persist(
            ctx, MmsStore.BOX_OUTBOX, address, System.currentTimeMillis(), null, parts,
            transactionId = trId
        ) ?: return Result.FAILED

        val file = File(dir(ctx, "mms"), "send_$trId.pdu").apply { writeBytes(pdu) }
        val sent = PendingIntent.getBroadcast(
            ctx, (msgUri.lastPathSegment?.toLongOrNull() ?: 0L).toInt(),
            Intent(ctx, MmsSentReceiver::class.java).setData(msgUri).putExtra(EXTRA_FILE, file.path),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        return runCatching {
            smsManager(ctx).sendMultimediaMessage(ctx, shareUri(ctx, file), null, null, sent)
            Result.OK
        }.getOrElse {
            MmsStore.setBox(ctx, msgUri, MmsStore.BOX_FAILED)
            Result.FAILED
        }
    }

    // ---------------------------------------------------------------- receive

    /** Ask the phone's MMS service to fetch a notified message into our cache. */
    fun download(ctx: Context, location: String, transactionId: String?, from: String) {
        cleanup(ctx)
        val file = File(dir(ctx, "mms"), "dl_${System.nanoTime()}.pdu").apply { createNewFile() }
        val done = PendingIntent.getBroadcast(
            ctx, file.name.hashCode(),
            Intent(ctx, MmsDownloadedReceiver::class.java)
                .putExtra(EXTRA_FILE, file.path)
                .putExtra(EXTRA_FROM, from)
                .putExtra(EXTRA_TR_ID, transactionId),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        runCatching {
            smsManager(ctx).downloadMultimediaMessage(ctx, location, shareUri(ctx, file), null, done)
        }
    }

    /** Tell the carrier we got the message, so it is not delivered again. Best effort. */
    fun acknowledge(ctx: Context, retrieveTrId: String?, notificationTrId: String?) {
        val pdu = when {
            retrieveTrId != null -> MmsPdu.encodeAcknowledgeInd(retrieveTrId)
            notificationTrId != null -> MmsPdu.encodeNotifyRespInd(notificationTrId)
            else -> return
        }
        runCatching {
            val file = File(dir(ctx, "mms"), "ack_${System.nanoTime()}.pdu").apply { writeBytes(pdu) }
            smsManager(ctx).sendMultimediaMessage(ctx, shareUri(ctx, file), null, null, null)
        }
    }

    internal fun fileFrom(intent: Intent): File? = intent.getStringExtra(EXTRA_FILE)?.let { File(it) }
    internal fun fromOf(intent: Intent): String = intent.getStringExtra(EXTRA_FROM).orEmpty()
    internal fun trIdOf(intent: Intent): String? = intent.getStringExtra(EXTRA_TR_ID)
}

/** Result of sendMultimediaMessage: mark the stored MMS as sent or failed. */
class MmsSentReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val uri = intent.data ?: return
        val ok = resultCode == Activity.RESULT_OK
        val app = context.applicationContext
        val pending = goAsync()
        Thread {
            try {
                MmsStore.setBox(app, uri, if (ok) MmsStore.BOX_SENT else MmsStore.BOX_FAILED)
                MmsSender.fileFrom(intent)?.delete()
            } finally {
                pending.finish()
            }
        }.start()
    }
}

/**
 * MMS arrives as a WAP push "notification" first. Blocked senders are never
 * downloaded; everything else is fetched by the phone's MMS service.
 */
class MmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.WAP_PUSH_DELIVER_ACTION) return
        val data = intent.getByteArrayExtra("data") ?: return
        val pdu = runCatching { MmsPdu.parse(data) }.getOrNull() ?: return
        if (pdu.messageType != MmsPdu.NOTIFICATION_IND) return
        val from = MmsPdu.cleanAddress(pdu.from.orEmpty())
        if (BlockStore.isBlocked(context, from)) return
        val location = pdu.contentLocation ?: return
        MmsSender.download(context.applicationContext, location, pdu.transactionId, from)
    }
}

/** Downloaded MMS: parse, apply blocking, store in the inbox and notify. */
class MmsDownloadedReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val app = context.applicationContext
        val ok = resultCode == Activity.RESULT_OK
        val pending = goAsync()
        Thread {
            val file = MmsSender.fileFrom(intent)
            try {
                if (!ok || file == null || !file.exists() || file.length() == 0L) return@Thread
                val pdu = MmsPdu.parse(file.readBytes())
                if (pdu.messageType != MmsPdu.RETRIEVE_CONF) return@Thread
                val from = MmsPdu.cleanAddress(pdu.from ?: MmsSender.fromOf(intent))
                MmsSender.acknowledge(app, pdu.transactionId, MmsSender.trIdOf(intent))

                val text = pdu.parts.filter { it.isText }.joinToString("\n") { it.text() }
                if (BlockStore.isBlocked(app, from) ||
                    BlockStore.containsBlockedKeyword(app, (pdu.subject ?: "") + " " + text)
                ) return@Thread
                if (pdu.messageId != null && MmsStore.existsWithMessageId(app, pdu.messageId)) return@Thread

                val date = (pdu.date ?: (System.currentTimeMillis() / 1000)) * 1000
                MmsStore.persist(
                    app, MmsStore.BOX_INBOX, from, date, pdu.subject, pdu.parts,
                    pdu.messageId, pdu.transactionId
                ) ?: return@Thread

                val files = pdu.parts.filter { !it.isText && !it.isSmil }
                val preview = when {
                    text.isNotBlank() -> text
                    !pdu.subject.isNullOrBlank() -> pdu.subject
                    files.any { it.contentType.startsWith("image/") } -> "📷 사진"
                    files.isNotEmpty() -> "📎 ${files[0].name ?: "파일"}"
                    else -> "새 메시지"
                }
                Notifier.notifyNewSms(app, from, preview)
            } catch (e: Exception) {
                // Malformed PDU: drop it rather than crash.
            } finally {
                file?.delete()
                pending.finish()
            }
        }.start()
    }
}
