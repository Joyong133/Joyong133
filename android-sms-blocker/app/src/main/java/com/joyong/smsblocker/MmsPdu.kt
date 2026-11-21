package com.joyong.smsblocker

import java.io.ByteArrayOutputStream
import java.nio.charset.Charset

/**
 * Minimal MMS PDU (OMA-WAP-MMS-ENC) encoder/decoder: enough to send
 * m-send-req, read m-notification-ind / m-retrieve-conf and acknowledge
 * downloads. Pure Kotlin (no Android classes) so it is unit-tested on the JVM.
 */
object MmsPdu {
    const val SEND_REQ = 0x80
    const val SEND_CONF = 0x81
    const val NOTIFICATION_IND = 0x82
    const val NOTIFYRESP_IND = 0x83
    const val RETRIEVE_CONF = 0x84
    const val ACKNOWLEDGE_IND = 0x85

    const val CT_SMIL = "application/smil"
    const val CT_TEXT = "text/plain"
    const val CT_RELATED = "application/vnd.wap.multipart.related"

    class Part(
        val contentType: String,
        val name: String?,
        val data: ByteArray,
        /** Java charset name for text parts (null = UTF-8). */
        val charset: String? = null
    ) {
        val isText get() = contentType.equals(CT_TEXT, ignoreCase = true)
        val isSmil get() = contentType.equals(CT_SMIL, ignoreCase = true)

        fun text(): String = String(data, charsetOrUtf8(charset))

        companion object {
            fun text(s: String, name: String = "text_0.txt") =
                Part(CT_TEXT, name, s.toByteArray(Charsets.UTF_8), "UTF-8")
        }
    }

    class Pdu(
        val messageType: Int,
        val transactionId: String?,
        val from: String?,
        val to: List<String>,
        val subject: String?,
        val contentLocation: String?,
        val messageId: String?,
        /** Seconds since epoch. */
        val date: Long?,
        val messageSize: Long?,
        val contentType: String?,
        val parts: List<Part>
    )

    /** "01012345678/TYPE=PLMN" → "01012345678". */
    fun cleanAddress(a: String): String = a.substringBefore('/').trim()

    // ------------------------------------------------------------------ decode

    fun parse(bytes: ByteArray): Pdu {
        val r = Reader(bytes)
        var type = -1
        var trId: String? = null
        var from: String? = null
        val to = mutableListOf<String>()
        var subject: String? = null
        var location: String? = null
        var messageId: String? = null
        var date: Long? = null
        var size: Long? = null
        var contentType: String? = null
        var parts: List<Part> = emptyList()

        while (r.hasMore()) {
            val code = r.u8()
            if (code < 0x80) {
                // Application header: token text, then text value.
                r.back(); r.textString(); r.textString()
                continue
            }
            when (code and 0x7F) {
                0x0C -> type = r.u8()
                0x18 -> trId = r.textString()
                0x09 -> {
                    val len = r.valueLength()
                    val end = r.p + len
                    if (r.u8() == 0x80) from = r.encodedString()
                    r.p = end
                }
                0x17, 0x02, 0x01 -> to.add(r.encodedString())
                0x16 -> subject = r.encodedString()
                0x03 -> location = r.textString()
                0x0B -> messageId = r.textString()
                0x05 -> date = r.longInteger()
                0x0E -> size = r.longInteger()
                0x04 -> {
                    val ct = parseContentType(r)
                    contentType = ct.type
                    if (ct.type.startsWith("application/vnd.wap.multipart", ignoreCase = true) ||
                        ct.type.startsWith("multipart/", ignoreCase = true)
                    ) {
                        parts = parseMultipart(r)
                    } else if (r.hasMore()) {
                        // Single-part body.
                        parts = listOf(Part(ct.type, ct.name, r.bytes(r.remaining()), ct.charset))
                    }
                    break // Content-Type is the last header; the body follows it.
                }
                else -> r.skipValue()
            }
        }
        return Pdu(type, trId, from, to, subject, location, messageId, date, size, contentType, parts)
    }

    private class ContentType(val type: String, val charset: String?, val name: String?)

    private fun parseContentType(r: Reader): ContentType {
        val c = r.peek()
        if (c >= 0x80) {
            r.u8()
            return ContentType(wellKnownType(c and 0x7F), null, null)
        }
        if (c >= 0x20) return ContentType(r.textString(), null, null)

        val len = r.valueLength()
        val end = r.p + len
        val media = when {
            r.peek() >= 0x80 -> wellKnownType(r.u8() and 0x7F)
            r.peek() >= 0x20 -> r.textString()
            else -> wellKnownType(r.longInteger().toInt())
        }
        val params = parseParams(r, end)
        r.p = end
        return ContentType(media, params.charset, params.name)
    }

    private class Params(var charset: String? = null, var name: String? = null)

    private fun parseParams(r: Reader, end: Int): Params {
        val out = Params()
        while (r.p < end) {
            val pc = r.peek()
            if (pc >= 0x80) {
                when (r.u8() and 0x7F) {
                    0x01 -> out.charset = charsetName(r.integerValue().toInt())
                    0x05, 0x17, 0x06, 0x18 -> {
                        val v = r.textString()
                        if (out.name == null) out.name = v
                    }
                    else -> r.skipValue()
                }
            } else {
                // Untyped parameter: token text + value.
                r.textString(); r.skipValue()
            }
        }
        return out
    }

    private fun parseMultipart(r: Reader): List<Part> {
        val out = mutableListOf<Part>()
        if (!r.hasMore()) return out
        val count = r.uintvar().toInt()
        repeat(count) {
            val headersLen = r.uintvar().toInt()
            val dataLen = r.uintvar().toInt()
            val hEnd = r.p + headersLen
            val ct = parseContentType(r)
            var name = ct.name
            var location: String? = null
            while (r.p < hEnd) {
                val code = r.u8()
                if (code >= 0x80) {
                    when (code and 0x7F) {
                        0x0E -> location = r.textString()        // Content-Location
                        0x2E, 0x45 -> {                           // Content-Disposition
                            val len = r.valueLength()
                            val dEnd = r.p + len
                            r.skipValue()
                            val p = parseParams(r, dEnd)
                            if (name == null) name = p.name
                            r.p = dEnd
                        }
                        else -> r.skipValue()
                    }
                } else {
                    r.back(); r.textString(); r.textString()
                }
            }
            r.p = hEnd
            out.add(Part(ct.type, name ?: location, r.bytes(dataLen), ct.charset))
        }
        return out
    }

    // ------------------------------------------------------------------ encode

    /** m-send-req as multipart/related with a generated SMIL layout. */
    fun encodeSendReq(to: String, parts: List<Part>, transactionId: String): ByteArray {
        val w = Writer()
        w.u8(0x8C); w.u8(SEND_REQ)
        w.u8(0x98); w.text(transactionId)
        w.u8(0x8D); w.u8(0x92)                          // MMS version 1.2
        w.u8(0x89); w.u8(0x01); w.u8(0x81)              // From: insert-address-token
        w.u8(0x97); w.text(to.filter { it.isDigit() || it == '+' } + "/TYPE=PLMN")
        w.u8(0x8A); w.u8(0x80)                          // Message class: personal
        w.u8(0x8F); w.u8(0x81)                          // Priority: normal
        w.u8(0x86); w.u8(0x81)                          // Delivery report: no
        w.u8(0x90); w.u8(0x81)                          // Read report: no

        val ct = Writer()
        ct.u8(0x80 or 0x33)                             // application/vnd.wap.multipart.related
        ct.u8(0x89); ct.text(CT_SMIL)                   // type=application/smil
        ct.u8(0x8A); ct.text("<smil>")                  // start=<smil>
        w.u8(0x84); w.valueLength(ct.size()); w.bytes(ct.toByteArray())

        val all = listOf(Part(CT_SMIL, "smil.xml", smil(parts).toByteArray(Charsets.UTF_8))) + parts
        w.uintvar(all.size.toLong())
        all.forEachIndexed { i, part ->
            val name = part.name ?: "part_$i"
            val cid = if (part.isSmil) "<smil>" else "<${name}>"

            val ctv = Writer()
            if (part.isText) ctv.u8(0x80 or 0x03) else ctv.text(part.contentType)
            if (part.isText) { ctv.u8(0x81); ctv.u8(0x80 or 106) }  // charset=utf-8
            ctv.u8(0x85); ctv.text(name)                            // name=

            val h = Writer()
            h.valueLength(ctv.size()); h.bytes(ctv.toByteArray())
            h.u8(0xC0); h.u8(0x22); h.bytes(cid.toByteArray(Charsets.UTF_8)); h.u8(0)  // Content-ID
            h.u8(0x8E); h.text(name)                                                  // Content-Location

            w.uintvar(h.size().toLong())
            w.uintvar(part.data.size.toLong())
            w.bytes(h.toByteArray())
            w.bytes(part.data)
        }
        return w.toByteArray()
    }

    /** Tells the MMSC a notified message was retrieved (used when retrieve-conf has no transaction id). */
    fun encodeNotifyRespInd(transactionId: String): ByteArray = Writer().apply {
        u8(0x8C); u8(NOTIFYRESP_IND)
        u8(0x98); text(transactionId)
        u8(0x8D); u8(0x92)
        u8(0x95); u8(0x81)                              // Status: retrieved
        u8(0x91); u8(0x81)                              // Report allowed: no
    }.toByteArray()

    fun encodeAcknowledgeInd(transactionId: String): ByteArray = Writer().apply {
        u8(0x8C); u8(ACKNOWLEDGE_IND)
        u8(0x98); text(transactionId)
        u8(0x8D); u8(0x92)
        u8(0x91); u8(0x81)
    }.toByteArray()

    private fun smil(parts: List<Part>): String {
        val body = StringBuilder()
        for (p in parts) {
            val src = p.name ?: continue
            val t = p.contentType.lowercase()
            val tag = when {
                p.isText -> "<text src=\"$src\" region=\"Text\"/>"
                t.startsWith("image/") -> "<img src=\"$src\" region=\"Image\"/>"
                t.startsWith("video/") -> "<video src=\"$src\" region=\"Image\"/>"
                t.startsWith("audio/") -> "<audio src=\"$src\"/>"
                else -> "<ref src=\"$src\"/>"
            }
            body.append(tag)
        }
        return "<smil><head><layout><root-layout/>" +
            "<region id=\"Image\" top=\"0\" left=\"0\" height=\"80%\" width=\"100%\" fit=\"meet\"/>" +
            "<region id=\"Text\" top=\"80%\" left=\"0\" height=\"20%\" width=\"100%\" fit=\"scroll\"/>" +
            "</layout></head><body><par dur=\"5000ms\">$body</par></body></smil>"
    }

    // ------------------------------------------------------------------ helpers

    private fun charsetOrUtf8(name: String?): Charset =
        name?.let { runCatching { Charset.forName(it) }.getOrNull() } ?: Charsets.UTF_8

    /** IANA MIBenum → Java charset name. */
    fun charsetName(mib: Int): String = when (mib) {
        3 -> "US-ASCII"
        4 -> "ISO-8859-1"
        17 -> "Shift_JIS"
        36, 38 -> "EUC-KR"
        106 -> "UTF-8"
        1000 -> "UTF-16BE"
        1015 -> "UTF-16"
        2025 -> "GB2312"
        2026 -> "Big5"
        else -> "UTF-8"
    }

    private val WELL_KNOWN = arrayOf(
        "*/*", "text/*", "text/html", "text/plain", "text/x-hdml", "text/x-ttml",
        "text/x-vCalendar", "text/x-vCard", "text/vnd.wap.wml", "text/vnd.wap.wmlscript",
        "text/vnd.wap.wta-event", "multipart/*", "multipart/mixed", "multipart/form-data",
        "multipart/byterantes", "multipart/alternative", "application/*", "application/java-vm",
        "application/x-www-form-urlencoded", "application/x-hdmlc", "application/vnd.wap.wmlc",
        "application/vnd.wap.wmlscriptc", "application/vnd.wap.wta-eventc",
        "application/vnd.wap.uaprof", "application/vnd.wap.wtls-ca-certificate",
        "application/vnd.wap.wtls-user-certificate", "application/x-x509-ca-cert",
        "application/x-x509-user-cert", "image/*", "image/gif", "image/jpeg", "image/tiff",
        "image/png", "image/vnd.wap.wbmp", "application/vnd.wap.multipart.*",
        "application/vnd.wap.multipart.mixed", "application/vnd.wap.multipart.form-data",
        "application/vnd.wap.multipart.byteranges", "application/vnd.wap.multipart.alternative",
        "application/xml", "text/xml", "application/vnd.wap.wbxml",
        "application/x-x968-cross-cert", "application/x-x968-ca-cert",
        "application/x-x968-user-cert", "text/vnd.wap.si", "application/vnd.wap.sic",
        "text/vnd.wap.sl", "application/vnd.wap.slc", "text/vnd.wap.co",
        "application/vnd.wap.coc", "application/vnd.wap.multipart.related",
        "application/vnd.wap.sia", "text/vnd.wap.connectivity-xml",
        "application/vnd.wap.connectivity-wbxml", "application/pkcs7-mime",
        "application/vnd.wap.hashed-certificate", "application/vnd.wap.signed-certificate",
        "application/vnd.wap.cert-response", "application/xhtml+xml", "application/wml+xml",
        "text/css", "application/vnd.wap.mms-message"
    )

    private fun wellKnownType(i: Int): String =
        WELL_KNOWN.getOrNull(i) ?: "application/octet-stream"

    private class Reader(val b: ByteArray) {
        var p = 0
        fun hasMore() = p < b.size
        fun remaining() = b.size - p
        fun back() { p-- }
        fun peek() = b[p].toInt() and 0xFF
        fun u8() = b[p++].toInt() and 0xFF
        fun bytes(n: Int): ByteArray = b.copyOfRange(p, p + n).also { p += n }

        fun uintvar(): Long {
            var v = 0L
            while (true) {
                val c = u8()
                v = (v shl 7) or (c and 0x7F).toLong()
                if (c and 0x80 == 0) return v
            }
        }

        fun valueLength(): Int {
            val c = u8()
            return when {
                c <= 30 -> c
                c == 31 -> uintvar().toInt()
                else -> throw IllegalStateException("bad value-length")
            }
        }

        /** NUL-terminated text; a leading quote (0x7F / 0x22) is dropped. */
        fun textString(): String = String(rawText(), Charsets.UTF_8)

        fun rawText(): ByteArray {
            if (hasMore() && (peek() == 0x7F || peek() == 0x22)) p++
            val s = p
            while (p < b.size && b[p].toInt() != 0) p++
            val out = b.copyOfRange(s, p)
            if (p < b.size) p++
            return out
        }

        fun longInteger(): Long {
            val n = u8()
            var v = 0L
            repeat(n) { v = (v shl 8) or u8().toLong() }
            return v
        }

        fun integerValue(): Long = if (peek() >= 0x80) (u8() and 0x7F).toLong() else longInteger()

        /** Text-string, or value-length + charset + text-string. */
        fun encodedString(): String {
            if (peek() > 31) return textString()
            val len = valueLength()
            val end = p + len
            val cs = charsetName(integerValue().toInt())
            val raw = rawText()
            p = end
            return String(raw, runCatching { Charset.forName(cs) }.getOrDefault(Charsets.UTF_8))
        }

        /** Skip any WSP-encoded header value. */
        fun skipValue() {
            val c = peek()
            when {
                c <= 30 -> { p++; p += c }
                c == 31 -> { p++; val n = uintvar().toInt(); p += n }
                c < 0x80 -> rawText()
                else -> p++
            }
        }
    }

    private class Writer : ByteArrayOutputStream() {
        fun u8(v: Int) = write(v and 0xFF)
        fun bytes(a: ByteArray) = write(a, 0, a.size)

        fun uintvar(value: Long) {
            var v = value
            val tmp = ArrayList<Int>()
            tmp.add((v and 0x7F).toInt())
            v = v shr 7
            while (v > 0) {
                tmp.add(((v and 0x7F) or 0x80).toInt())
                v = v shr 7
            }
            for (i in tmp.indices.reversed()) u8(tmp[i])
        }

        fun valueLength(n: Int) {
            if (n <= 30) u8(n) else { u8(31); uintvar(n.toLong()) }
        }

        /** Text-string: quote if it starts with a byte ≥ 0x80, NUL-terminated. */
        fun text(s: String) {
            val bs = s.toByteArray(Charsets.UTF_8)
            if (bs.isNotEmpty() && (bs[0].toInt() and 0xFF) >= 0x80) u8(0x7F)
            bytes(bs)
            u8(0)
        }
    }
}
