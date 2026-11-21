package com.joyong.smsblocker

import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.provider.Telephony

/** An attachment stored in the MMS provider. */
data class StoredPart(val id: Long, val contentType: String, val name: String?) {
    val isImage get() = contentType.startsWith("image/", ignoreCase = true)
    val uri: Uri get() = Uri.parse("content://mms/part/$id")
}

/** Latest MMS of a thread, for the conversation list. */
class MmsSummary(val date: Long, val address: String, val snippet: String, val outgoing: Boolean)

/**
 * Reads/writes MMS in the system provider. As the default SMS app we must
 * store sent and downloaded MMS ourselves. Call off the main thread.
 */
object MmsStore {
    const val BOX_INBOX = 1
    const val BOX_SENT = 2
    const val BOX_OUTBOX = 4
    const val BOX_FAILED = 5

    private const val ADDR_FROM = 137
    private const val ADDR_TO = 151
    private const val MT_SEND_REQ = 128
    private const val MT_RETRIEVE_CONF = 132

    private val MMS: Uri = Telephony.Mms.CONTENT_URI
    private val PART: Uri = Uri.parse("content://mms/part")
    private const val REAL_MESSAGES = "${Telephony.Mms.MESSAGE_TYPE} IN ($MT_SEND_REQ, $MT_RETRIEVE_CONF)"

    // ---------------------------------------------------------------- write

    fun persist(
        ctx: Context,
        box: Int,
        address: String,
        dateMillis: Long,
        subject: String?,
        parts: List<MmsPdu.Part>,
        messageId: String? = null,
        transactionId: String? = null
    ): Uri? = runCatching {
        val incoming = box == BOX_INBOX
        val threadId = Telephony.Threads.getOrCreateThreadId(ctx, address)
        val stored = parts.filterNot { it.isSmil }
        val values = ContentValues().apply {
            put(Telephony.Mms.THREAD_ID, threadId)
            put(Telephony.Mms.DATE, dateMillis / 1000)
            put(Telephony.Mms.DATE_SENT, dateMillis / 1000)
            put(Telephony.Mms.MESSAGE_BOX, box)
            put(Telephony.Mms.READ, if (incoming) 0 else 1)
            put(Telephony.Mms.SEEN, if (incoming) 0 else 1)
            put(Telephony.Mms.MESSAGE_TYPE, if (incoming) MT_RETRIEVE_CONF else MT_SEND_REQ)
            put(Telephony.Mms.CONTENT_TYPE, MmsPdu.CT_RELATED)
            put(Telephony.Mms.MMS_VERSION, 0x12)
            put(Telephony.Mms.TEXT_ONLY, if (stored.all { it.isText }) 1 else 0)
            if (!subject.isNullOrBlank()) {
                put(Telephony.Mms.SUBJECT, subject)
                put(Telephony.Mms.SUBJECT_CHARSET, 106)
            }
            messageId?.let { put(Telephony.Mms.MESSAGE_ID, it) }
            transactionId?.let { put(Telephony.Mms.TRANSACTION_ID, it) }
        }
        val uri = ctx.contentResolver.insert(MMS, values) ?: return@runCatching null
        val id = ContentUris.parseId(uri)

        fun addr(a: String, type: Int) = ctx.contentResolver.insert(
            Uri.parse("content://mms/$id/addr"),
            ContentValues().apply {
                put("address", a); put("type", type); put("charset", 106); put("msg_id", id)
            }
        )
        if (incoming) addr(address, ADDR_FROM) else {
            addr("insert-address-token", ADDR_FROM)
            addr(address, ADDR_TO)
        }

        stored.forEachIndexed { i, p ->
            val pv = ContentValues().apply {
                put(Telephony.Mms.Part.MSG_ID, id)
                put(Telephony.Mms.Part.SEQ, i)
                put(Telephony.Mms.Part.CONTENT_TYPE, p.contentType)
                p.name?.let {
                    put(Telephony.Mms.Part.NAME, it)
                    put(Telephony.Mms.Part.FILENAME, it)
                    put(Telephony.Mms.Part.CONTENT_LOCATION, it)
                }
                if (p.isText) {
                    put(Telephony.Mms.Part.CHARSET, 106)
                    put(Telephony.Mms.Part.TEXT, p.text())
                }
            }
            val partUri = ctx.contentResolver.insert(Uri.parse("content://mms/$id/part"), pv)
            if (partUri != null && !p.isText) {
                ctx.contentResolver.openOutputStream(partUri)?.use { it.write(p.data) }
            }
        }
        uri
    }.getOrNull()

    fun setBox(ctx: Context, uri: Uri, box: Int) {
        runCatching {
            ctx.contentResolver.update(
                uri, ContentValues().apply { put(Telephony.Mms.MESSAGE_BOX, box) }, null, null
            )
        }
    }

    fun existsWithMessageId(ctx: Context, messageId: String): Boolean = runCatching {
        ctx.contentResolver.query(
            MMS, arrayOf(Telephony.Mms._ID), "${Telephony.Mms.MESSAGE_ID}=?", arrayOf(messageId), null
        )?.use { it.count > 0 } ?: false
    }.getOrDefault(false)

    fun delete(ctx: Context, id: Long): Int =
        runCatching { ctx.contentResolver.delete(ContentUris.withAppendedId(MMS, id), null, null) }
            .getOrDefault(0)

    fun markRead(ctx: Context, threadId: Long): Int = runCatching {
        ctx.contentResolver.update(
            MMS,
            ContentValues().apply { put(Telephony.Mms.READ, 1); put(Telephony.Mms.SEEN, 1) },
            "${Telephony.Mms.THREAD_ID}=? AND ${Telephony.Mms.READ}=0",
            arrayOf(threadId.toString())
        )
    }.getOrDefault(0)

    fun markAllRead(ctx: Context): Int = runCatching {
        ctx.contentResolver.update(
            MMS,
            ContentValues().apply { put(Telephony.Mms.READ, 1); put(Telephony.Mms.SEEN, 1) },
            "${Telephony.Mms.READ}=0", null
        )
    }.getOrDefault(0)

    // ---------------------------------------------------------------- read

    private class Row(val id: Long, val date: Long, val box: Int, val read: Boolean)

    private fun rows(ctx: Context, selection: String, args: Array<String>?, order: String): List<Row> {
        val out = mutableListOf<Row>()
        runCatching {
            ctx.contentResolver.query(
                MMS,
                arrayOf(Telephony.Mms._ID, Telephony.Mms.DATE, Telephony.Mms.MESSAGE_BOX, Telephony.Mms.READ),
                selection, args, order
            )?.use { c ->
                while (c.moveToNext()) {
                    out.add(Row(c.getLong(0), c.getLong(1) * 1000, c.getInt(2), c.getInt(3) != 0))
                }
            }
        }
        return out
    }

    /** Text (joined) and attachments of one MMS. */
    fun content(ctx: Context, id: Long): Pair<String, List<StoredPart>> {
        val texts = mutableListOf<String>()
        val files = mutableListOf<StoredPart>()
        runCatching {
            ctx.contentResolver.query(
                PART,
                arrayOf(
                    Telephony.Mms.Part._ID, Telephony.Mms.Part.CONTENT_TYPE, Telephony.Mms.Part.TEXT,
                    Telephony.Mms.Part.NAME, Telephony.Mms.Part.FILENAME, Telephony.Mms.Part.CONTENT_LOCATION
                ),
                "${Telephony.Mms.Part.MSG_ID}=?", arrayOf(id.toString()), "${Telephony.Mms.Part.SEQ} ASC"
            )?.use { c ->
                while (c.moveToNext()) {
                    val ct = c.getString(1).orEmpty()
                    when {
                        ct.equals(MmsPdu.CT_SMIL, ignoreCase = true) -> Unit
                        ct.equals(MmsPdu.CT_TEXT, ignoreCase = true) ->
                            c.getString(2)?.takeIf { it.isNotBlank() }?.let { texts.add(it) }
                        else -> files.add(
                            StoredPart(c.getLong(0), ct, c.getString(3) ?: c.getString(4) ?: c.getString(5))
                        )
                    }
                }
            }
        }
        return texts.joinToString("\n") to files
    }

    private fun subject(ctx: Context, id: Long): String? = runCatching {
        ctx.contentResolver.query(
            ContentUris.withAppendedId(MMS, id), arrayOf(Telephony.Mms.SUBJECT), null, null, null
        )?.use { c -> if (c.moveToFirst()) c.getString(0) else null }
    }.getOrNull()?.takeIf { it.isNotBlank() }

    /** Sender (incoming) or recipient (sent) of an MMS. */
    fun address(ctx: Context, id: Long, incoming: Boolean): String = runCatching {
        ctx.contentResolver.query(
            Uri.parse("content://mms/$id/addr"), arrayOf("address"),
            "type=?", arrayOf((if (incoming) ADDR_FROM else ADDR_TO).toString()), null
        )?.use { c -> if (c.moveToFirst()) c.getString(0) else null }
    }.getOrNull().orEmpty()

    fun messages(ctx: Context, threadId: Long): List<ChatMsg> {
        if (threadId < 0) return emptyList()
        return rows(
            ctx, "${Telephony.Mms.THREAD_ID}=? AND $REAL_MESSAGES", arrayOf(threadId.toString()),
            "${Telephony.Mms.DATE} ASC"
        ).map { r ->
            val (text, files) = content(ctx, r.id)
            val subj = subject(ctx, r.id)
            val body = if (subj != null && !text.startsWith(subj)) {
                if (text.isEmpty()) subj else "$subj\n\n$text"
            } else text
            ChatMsg(
                id = r.id,
                body = body,
                date = r.date,
                outgoing = r.box != BOX_INBOX,
                status = when (r.box) {
                    BOX_OUTBOX -> ChatMsg.SENDING
                    BOX_FAILED -> ChatMsg.FAILED
                    else -> ChatMsg.SENT
                },
                read = r.read,
                mms = true,
                parts = files
            )
        }
    }

    fun snippet(text: String, files: List<StoredPart>): String = when {
        text.isNotBlank() -> text.replace('\n', ' ')
        files.any { it.isImage } -> "📷 사진"
        files.isNotEmpty() -> "📎 ${files[0].name ?: "파일"}"
        else -> "(MMS)"
    }

    /**
     * Latest MMS per thread plus unread counts. [skipOlderThan] lets the caller
     * avoid the per-thread address/text lookups when an SMS is newer anyway.
     */
    fun summaries(ctx: Context, skipOlderThan: Map<Long, Long>): Pair<Map<Long, MmsSummary>, Map<Long, Int>> {
        val latest = HashMap<Long, MmsSummary>()
        val unread = HashMap<Long, Int>()
        val seen = HashSet<Long>()
        runCatching {
            ctx.contentResolver.query(
                MMS,
                arrayOf(
                    Telephony.Mms._ID, Telephony.Mms.THREAD_ID, Telephony.Mms.DATE,
                    Telephony.Mms.MESSAGE_BOX, Telephony.Mms.READ
                ),
                REAL_MESSAGES, null, "${Telephony.Mms.DATE} DESC"
            )?.use { c ->
                while (c.moveToNext()) {
                    val id = c.getLong(0)
                    val tid = c.getLong(1)
                    val date = c.getLong(2) * 1000
                    val box = c.getInt(3)
                    if (box == BOX_INBOX && c.getInt(4) == 0) unread[tid] = (unread[tid] ?: 0) + 1
                    if (!seen.add(tid)) continue
                    if ((skipOlderThan[tid] ?: Long.MIN_VALUE) >= date) continue
                    val incoming = box == BOX_INBOX
                    val (text, files) = content(ctx, id)
                    latest[tid] = MmsSummary(date, address(ctx, id, incoming), snippet(text, files), !incoming)
                }
            }
        }
        return latest to unread
    }
}
