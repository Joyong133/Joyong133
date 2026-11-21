package com.joyong.smsblocker

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayOutputStream

class MmsPduTest {

    private fun bytes(vararg parts: Any): ByteArray {
        val o = ByteArrayOutputStream()
        for (p in parts) when (p) {
            is Int -> o.write(p)
            is ByteArray -> o.write(p)
            is String -> o.write(p.toByteArray(Charsets.UTF_8))
            else -> error("bad part")
        }
        return o.toByteArray()
    }

    @Test
    fun sendReqRoundTrip() {
        val image = ByteArray(5000) { (it % 251).toByte() }
        val pdu = MmsPdu.encodeSendReq(
            "010-1234-5678",
            listOf(
                MmsPdu.Part.text("안녕하세요 사진 보내요"),
                MmsPdu.Part("image/jpeg", "photo.jpg", image)
            ),
            "T12345"
        )
        val p = MmsPdu.parse(pdu)
        assertEquals(MmsPdu.SEND_REQ, p.messageType)
        assertEquals("T12345", p.transactionId)
        assertEquals(listOf("01012345678/TYPE=PLMN"), p.to)
        assertEquals(MmsPdu.CT_RELATED, p.contentType)
        assertEquals(3, p.parts.size)
        assertTrue(p.parts[0].isSmil)
        assertTrue(String(p.parts[0].data).contains("photo.jpg"))
        assertEquals("안녕하세요 사진 보내요", p.parts[1].text())
        assertEquals("image/jpeg", p.parts[2].contentType)
        assertEquals("photo.jpg", p.parts[2].name)
        assertArrayEquals(image, p.parts[2].data)
    }

    @Test
    fun koreanFileNameSurvives() {
        val pdu = MmsPdu.encodeSendReq(
            "01012345678",
            listOf(MmsPdu.Part("application/pdf", "보고서.pdf", byteArrayOf(1, 2, 3))),
            "T1"
        )
        val part = MmsPdu.parse(pdu).parts[1]
        assertEquals("보고서.pdf", part.name)
        assertEquals("application/pdf", part.contentType)
    }

    @Test
    fun parsesNotificationInd() {
        val from = "01099998888/TYPE=PLMN"
        val pdu = bytes(
            0x8C, 0x82,
            0x98, "T777", 0,
            0x8D, 0x92,
            0x89, from.length + 2, 0x80, from, 0,
            0x8A, 0x80,
            0x8E, 0x02, 0x01, 0x00,                  // size 256
            0x88, 0x05, 0x81, 0x03, 0x01, 0x51, 0x80, // expiry (relative)
            0x83, "http://mmsc.example/abc", 0
        )
        val p = MmsPdu.parse(pdu)
        assertEquals(MmsPdu.NOTIFICATION_IND, p.messageType)
        assertEquals("T777", p.transactionId)
        assertEquals("01099998888", MmsPdu.cleanAddress(p.from!!))
        assertEquals(256L, p.messageSize)
        assertEquals("http://mmsc.example/abc", p.contentLocation)
    }

    @Test
    fun parsesKoreanLmsRetrieveConf() {
        val euckr = charset("EUC-KR")
        val subject = "알림".toByteArray(euckr)
        val body = "긴 문자입니다. 띄어쓰기 포함".toByteArray(euckr)
        val from = "+821011112222/TYPE=PLMN"
        val partHeaders = bytes(0x03, 0x83, 0x81, 0x80 or 38)   // text/plain; charset=EUC-KR
        val pdu = bytes(
            0x8C, 0x84,
            0x98, "TR1", 0,
            0x8D, 0x92,
            0x8B, "msg-1", 0,
            0x85, 0x04, 0x65, 0x4F, 0x2A, 0x10,                   // date
            0x89, from.length + 2, 0x80, from, 0,
            0x96, subject.size + 2, 0x80 or 38, subject, 0,         // subject, EUC-KR
            0x84, 0x80 or 0x23,                                     // multipart/mixed
            0x01,                                                   // 1 part
            partHeaders.size, body.size,
            partHeaders, body
        )
        val p = MmsPdu.parse(pdu)
        assertEquals(MmsPdu.RETRIEVE_CONF, p.messageType)
        assertEquals("msg-1", p.messageId)
        assertEquals("+821011112222", MmsPdu.cleanAddress(p.from!!))
        assertEquals("알림", p.subject)
        assertNotNull(p.date)
        assertEquals(1, p.parts.size)
        assertTrue(p.parts[0].isText)
        assertEquals("긴 문자입니다. 띄어쓰기 포함", p.parts[0].text())
    }

    @Test
    fun acksAreWellFormed() {
        val ack = MmsPdu.parse(MmsPdu.encodeAcknowledgeInd("TR9"))
        assertEquals(MmsPdu.ACKNOWLEDGE_IND, ack.messageType)
        assertEquals("TR9", ack.transactionId)
        val resp = MmsPdu.parse(MmsPdu.encodeNotifyRespInd("T5"))
        assertEquals(MmsPdu.NOTIFYRESP_IND, resp.messageType)
        assertEquals("T5", resp.transactionId)
    }
}
