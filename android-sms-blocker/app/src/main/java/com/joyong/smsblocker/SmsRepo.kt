package com.joyong.smsblocker

import android.Manifest
import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.ContactsContract
import android.provider.Telephony
import androidx.core.content.ContextCompat

data class Conversation(
    val threadId: Long,
    val address: String,
    val name: String?,
    val snippet: String,
    val date: Long,
    val unread: Int,
    val lastOutgoing: Boolean
)

data class ChatMsg(
    val id: Long,
    val body: String,
    val date: Long,
    val outgoing: Boolean,
    val status: Int,
    val read: Boolean
) {
    companion object {
        const val SENT = 0
        const val SENDING = 1
        const val FAILED = 2
    }
}

/** All reads/writes against the system SMS provider. Call off the main thread. */
object SmsRepo {

    private const val NOT_DRAFT = "${Telephony.Sms.TYPE}!=${Telephony.Sms.MESSAGE_TYPE_DRAFT}"

    fun conversations(ctx: Context): List<Conversation> {
        val latest = LinkedHashMap<Long, Conversation>()
        val unread = HashMap<Long, Int>()
        runCatching {
            ctx.contentResolver.query(
                Telephony.Sms.CONTENT_URI,
                arrayOf(
                    Telephony.Sms.THREAD_ID, Telephony.Sms.ADDRESS, Telephony.Sms.BODY,
                    Telephony.Sms.DATE, Telephony.Sms.TYPE, Telephony.Sms.READ
                ),
                NOT_DRAFT, null, "${Telephony.Sms.DATE} DESC"
            )?.use { c ->
                val iT = c.getColumnIndexOrThrow(Telephony.Sms.THREAD_ID)
                val iA = c.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)
                val iB = c.getColumnIndexOrThrow(Telephony.Sms.BODY)
                val iD = c.getColumnIndexOrThrow(Telephony.Sms.DATE)
                val iY = c.getColumnIndexOrThrow(Telephony.Sms.TYPE)
                val iR = c.getColumnIndexOrThrow(Telephony.Sms.READ)
                while (c.moveToNext()) {
                    val tid = c.getLong(iT)
                    val type = c.getInt(iY)
                    if (type == Telephony.Sms.MESSAGE_TYPE_INBOX && c.getInt(iR) == 0) {
                        unread[tid] = (unread[tid] ?: 0) + 1
                    }
                    if (!latest.containsKey(tid)) {
                        latest[tid] = Conversation(
                            threadId = tid,
                            address = c.getString(iA).orEmpty(),
                            name = null,
                            snippet = c.getString(iB).orEmpty().replace('\n', ' '),
                            date = c.getLong(iD),
                            unread = 0,
                            lastOutgoing = type != Telephony.Sms.MESSAGE_TYPE_INBOX
                        )
                    }
                }
            }
        }
        val names = HashMap<String, String?>()
        return latest.values
            // Safety net: never list a blocked sender, even for messages stored
            // before this app became the default SMS app.
            .filter { !BlockStore.isBlocked(ctx, it.address) }
            .map {
                it.copy(
                    unread = unread[it.threadId] ?: 0,
                    name = names.getOrPut(it.address) { contactName(ctx, it.address) }
                )
            }
    }

    fun messages(ctx: Context, threadId: Long): List<ChatMsg> {
        if (threadId < 0) return emptyList()
        val out = mutableListOf<ChatMsg>()
        runCatching {
            ctx.contentResolver.query(
                Telephony.Sms.CONTENT_URI,
                arrayOf(
                    Telephony.Sms._ID, Telephony.Sms.BODY, Telephony.Sms.DATE,
                    Telephony.Sms.TYPE, Telephony.Sms.READ
                ),
                "${Telephony.Sms.THREAD_ID}=? AND $NOT_DRAFT",
                arrayOf(threadId.toString()),
                "${Telephony.Sms.DATE} ASC"
            )?.use { c ->
                val iI = c.getColumnIndexOrThrow(Telephony.Sms._ID)
                val iB = c.getColumnIndexOrThrow(Telephony.Sms.BODY)
                val iD = c.getColumnIndexOrThrow(Telephony.Sms.DATE)
                val iY = c.getColumnIndexOrThrow(Telephony.Sms.TYPE)
                val iR = c.getColumnIndexOrThrow(Telephony.Sms.READ)
                while (c.moveToNext()) {
                    val type = c.getInt(iY)
                    val status = when (type) {
                        Telephony.Sms.MESSAGE_TYPE_OUTBOX,
                        Telephony.Sms.MESSAGE_TYPE_QUEUED -> ChatMsg.SENDING
                        Telephony.Sms.MESSAGE_TYPE_FAILED -> ChatMsg.FAILED
                        else -> ChatMsg.SENT
                    }
                    out.add(
                        ChatMsg(
                            id = c.getLong(iI),
                            body = c.getString(iB).orEmpty(),
                            date = c.getLong(iD),
                            outgoing = type != Telephony.Sms.MESSAGE_TYPE_INBOX,
                            status = status,
                            read = c.getInt(iR) != 0
                        )
                    )
                }
            }
        }
        return out
    }

    fun threadIdFor(ctx: Context, address: String): Long =
        runCatching { Telephony.Threads.getOrCreateThreadId(ctx, address) }.getOrDefault(-1L)

    fun markRead(ctx: Context, threadId: Long) {
        runCatching {
            val v = ContentValues().apply {
                put(Telephony.Sms.READ, 1)
                put(Telephony.Sms.SEEN, 1)
            }
            ctx.contentResolver.update(
                Telephony.Sms.CONTENT_URI, v,
                "${Telephony.Sms.THREAD_ID}=? AND ${Telephony.Sms.READ}=0",
                arrayOf(threadId.toString())
            )
        }
    }

    fun deleteThread(ctx: Context, threadId: Long): Int =
        runCatching {
            ctx.contentResolver.delete(
                Telephony.Sms.CONTENT_URI,
                "${Telephony.Sms.THREAD_ID}=?",
                arrayOf(threadId.toString())
            )
        }.getOrDefault(0)

    /** Delete every stored message to/from a number (used when blocking it). */
    fun deleteFromAddress(ctx: Context, number: String): Int {
        var count = 0
        runCatching {
            ctx.contentResolver.query(
                Telephony.Sms.CONTENT_URI,
                arrayOf(Telephony.Sms._ID, Telephony.Sms.ADDRESS),
                null, null, null
            )?.use { c ->
                val iI = c.getColumnIndexOrThrow(Telephony.Sms._ID)
                val iA = c.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)
                while (c.moveToNext()) {
                    val addr = c.getString(iA) ?: continue
                    if (BlockStore.matches(addr, number)) {
                        count += ctx.contentResolver.delete(
                            Telephony.Sms.CONTENT_URI,
                            "${Telephony.Sms._ID}=?",
                            arrayOf(c.getLong(iI).toString())
                        )
                    }
                }
            }
        }
        return count
    }

    fun insertOutgoing(ctx: Context, address: String, body: String): Uri? =
        runCatching {
            ctx.contentResolver.insert(
                Telephony.Sms.Outbox.CONTENT_URI,
                ContentValues().apply {
                    put(Telephony.Sms.ADDRESS, address)
                    put(Telephony.Sms.BODY, body)
                    put(Telephony.Sms.DATE, System.currentTimeMillis())
                    put(Telephony.Sms.READ, 1)
                    put(Telephony.Sms.SEEN, 1)
                }
            )
        }.getOrNull()

    /** Change a message's type; if [onlyFromType] is set, only when it currently has that type. */
    fun setType(ctx: Context, uri: Uri, type: Int, onlyFromType: Int? = null) {
        runCatching {
            val v = ContentValues().apply { put(Telephony.Sms.TYPE, type) }
            if (onlyFromType == null) {
                ctx.contentResolver.update(uri, v, null, null)
            } else {
                ctx.contentResolver.update(
                    uri, v, "${Telephony.Sms.TYPE}=?", arrayOf(onlyFromType.toString())
                )
            }
        }
    }

    /** Threads with a message body containing [query]. */
    fun searchThreadIds(ctx: Context, query: String): Set<Long> {
        val q = query.trim()
        if (q.isEmpty()) return emptySet()
        val out = HashSet<Long>()
        runCatching {
            ctx.contentResolver.query(
                Telephony.Sms.CONTENT_URI,
                arrayOf(Telephony.Sms.THREAD_ID),
                "${Telephony.Sms.BODY} LIKE ? AND $NOT_DRAFT",
                arrayOf("%$q%"),
                null
            )?.use { c -> while (c.moveToNext()) out.add(c.getLong(0)) }
        }
        return out
    }

    fun markAllRead(ctx: Context): Int =
        runCatching {
            ctx.contentResolver.update(
                Telephony.Sms.CONTENT_URI,
                ContentValues().apply {
                    put(Telephony.Sms.READ, 1)
                    put(Telephony.Sms.SEEN, 1)
                },
                "${Telephony.Sms.READ}=0", null
            )
        }.getOrDefault(0)

    fun deleteMessage(ctx: Context, id: Long): Int =
        runCatching {
            ctx.contentResolver.delete(
                ContentUris.withAppendedId(Telephony.Sms.CONTENT_URI, id), null, null
            )
        }.getOrDefault(0)

    fun contactName(ctx: Context, address: String): String? {
        if (address.isBlank()) return null
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.READ_CONTACTS)
            != PackageManager.PERMISSION_GRANTED
        ) return null
        return runCatching {
            val uri = Uri.withAppendedPath(
                ContactsContract.PhoneLookup.CONTENT_FILTER_URI, Uri.encode(address)
            )
            ctx.contentResolver.query(
                uri, arrayOf(ContactsContract.PhoneLookup.DISPLAY_NAME), null, null, null
            )?.use { c -> if (c.moveToFirst()) c.getString(0) else null }
        }.getOrNull()?.takeIf { it.isNotBlank() }
    }
}
