package io.github.joyong133.datalock.vpn

import io.github.joyong133.datalock.vpn.PacketResponder.Companion.ACK
import io.github.joyong133.datalock.vpn.PacketResponder.Companion.FIN
import io.github.joyong133.datalock.vpn.PacketResponder.Companion.PROTO_ICMP
import io.github.joyong133.datalock.vpn.PacketResponder.Companion.PROTO_TCP
import io.github.joyong133.datalock.vpn.PacketResponder.Companion.PROTO_UDP
import io.github.joyong133.datalock.vpn.PacketResponder.Companion.RST
import io.github.joyong133.datalock.vpn.PacketResponder.Companion.SYN
import io.github.joyong133.datalock.vpn.PacketResponder.Companion.checksum
import io.github.joyong133.datalock.vpn.PacketResponder.Companion.transportChecksum
import io.github.joyong133.datalock.vpn.PacketResponder.Companion.u16
import io.github.joyong133.datalock.vpn.PacketResponder.Companion.u32
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.random.Random

class PacketResponderTest {

    private val app = byteArrayOf(10, 111, 222.toByte(), 2)
    private val server = byteArrayOf(142.toByte(), 250.toByte(), 196.toByte(), 110)

    @Test
    fun checksumMatchesTheTextbookIpv4Header() {
        // 4500 0073 0000 4000 4011 [b861] c0a8 0001 c0a8 00c7
        val header = hex("450000730000400040110000c0a80001c0a800c7")
        assertEquals(0xB861, checksum(header, 0, header.size, 0L))
    }

    @Test
    fun tcpSynGetsRstAckSoTheConnectionIsRefusedAtOnce() {
        val syn = tcp(app, server, srcPort = 51_000, dstPort = 443, seq = 1_000, ack = 0, flags = SYN)
        val result = PacketResponder().respond(syn, syn.size)

        assertNotNull(result.reply)
        val reply = result.reply!!
        assertTrue(result.isNewAttempt)
        assertEquals(40, reply.size)
        assertEquals(0x45, reply[0].toInt() and 0xFF)
        assertEquals(40, u16(reply, 2))
        assertEquals(PROTO_TCP, reply[9].toInt())
        assertArrayEquals(server, reply.copyOfRange(12, 16))
        assertArrayEquals(app, reply.copyOfRange(16, 20))
        assertEquals(443, u16(reply, 20))
        assertEquals(51_000, u16(reply, 22))
        assertEquals(0L, u32(reply, 24))
        assertEquals(1_001L, u32(reply, 28))
        assertEquals(0x50, reply[32].toInt() and 0xFF)
        assertEquals(RST or ACK, reply[33].toInt() and 0xFF)
        assertValidIpv4(reply)
        assertEquals(0, transportChecksum(reply, 20, 20, PROTO_TCP))
    }

    @Test
    fun establishedTcpGetsRstWithSequenceFromItsAck() {
        val data = tcp(
            app, server, srcPort = 40_000, dstPort = 80,
            seq = 5_000, ack = 0xFFFF_FFF0L, flags = ACK, payload = ByteArray(10) { it.toByte() },
        )
        val result = PacketResponder().respond(data, data.size)

        val reply = result.reply!!
        assertFalse(result.isNewAttempt)
        assertEquals(0xFFFF_FFF0L, u32(reply, 24))
        assertEquals(0L, u32(reply, 28))
        assertEquals(RST, reply[33].toInt() and 0xFF)
        assertValidIpv4(reply)
        assertEquals(0, transportChecksum(reply, 20, 20, PROTO_TCP))
    }

    @Test
    fun finWithoutAckIsAcknowledgedInTheReset() {
        val fin = tcp(app, server, srcPort = 40_001, dstPort = 80, seq = 0xFFFF_FFFFL, ack = 0, flags = FIN)
        val reply = PacketResponder().respond(fin, fin.size).reply!!
        // seq + 1 wraps around 2^32.
        assertEquals(0L, u32(reply, 28))
        assertEquals(RST or ACK, reply[33].toInt() and 0xFF)
    }

    @Test
    fun resetsAreNeverAnswered() {
        val rst = tcp(app, server, srcPort = 40_002, dstPort = 80, seq = 1, ack = 2, flags = RST or ACK)
        val result = PacketResponder().respond(rst, rst.size)
        assertNull(result.reply)
        assertFalse(result.isNewAttempt)
    }

    @Test
    fun udpGetsPortUnreachableQuotingTheOriginalHeader() {
        val dns = udp(app, byteArrayOf(10, 111, 222.toByte(), 1), srcPort = 33_333, dstPort = 53, payload = ByteArray(30) { 7 })
        val result = PacketResponder().respond(dns, dns.size)

        val reply = result.reply!!
        assertTrue(result.isNewAttempt)
        assertEquals(20 + 8 + 28, reply.size)
        assertEquals(reply.size, u16(reply, 2))
        assertEquals(PROTO_ICMP, reply[9].toInt())
        assertArrayEquals(byteArrayOf(10, 111, 222.toByte(), 1), reply.copyOfRange(12, 16))
        assertArrayEquals(app, reply.copyOfRange(16, 20))
        assertEquals(3, reply[20].toInt()) // destination unreachable
        assertEquals(3, reply[21].toInt()) // port unreachable
        assertArrayEquals(dns.copyOfRange(0, 28), reply.copyOfRange(28, 56))
        assertValidIpv4(reply)
        assertEquals(0, checksum(reply, 20, reply.size - 20, 0L))
    }

    @Test
    fun multicastBroadcastAndUnspecifiedSourcesAreDroppedSilently() {
        val responder = PacketResponder()
        val mdns = udp(app, byteArrayOf(224.toByte(), 0, 0, 251.toByte()), 5353, 5353, ByteArray(12))
        val broadcast = udp(app, byteArrayOf(-1, -1, -1, -1), 68, 67, ByteArray(12))
        val noSource = udp(byteArrayOf(0, 0, 0, 0), server, 68, 67, ByteArray(12))
        for (packet in listOf(mdns, broadcast, noSource)) {
            val result = responder.respond(packet, packet.size)
            assertNull(result.reply)
            assertFalse(result.isNewAttempt)
        }
    }

    @Test
    fun otherProtocolsAndLaterFragmentsAreDropped() {
        val responder = PacketResponder()
        val icmpEcho = ipv4(app, server, PROTO_ICMP, ByteArray(16))
        assertNull(responder.respond(icmpEcho, icmpEcho.size).reply)

        val fragment = udp(app, server, 1_000, 2_000, ByteArray(20))
        fragment[6] = 0x00
        fragment[7] = 0x10 // fragment offset 16 * 8 bytes
        fixIpChecksum(fragment)
        assertNull(responder.respond(fragment, fragment.size).reply)
    }

    @Test
    fun ipv6IsLeftToAndroid() {
        val packet = ByteArray(60).also { it[0] = 0x60 }
        assertNull(PacketResponder().respond(packet, packet.size).reply)
    }

    @Test
    fun truncatedOrGarbagePacketsNeverCrash() {
        val responder = PacketResponder()
        val syn = tcp(app, server, srcPort = 1, dstPort = 2, seq = 3, ack = 0, flags = SYN)
        for (length in 0 until syn.size) {
            assertNull(responder.respond(syn, length).reply)
        }
        val random = Random(42)
        repeat(5_000) {
            val bytes = random.nextBytes(random.nextInt(0, 120))
            if (bytes.isNotEmpty() && random.nextBoolean()) bytes[0] = 0x45
            responder.respond(bytes, bytes.size)
        }
    }

    private fun assertValidIpv4(packet: ByteArray) {
        assertEquals(0, checksum(packet, 0, 20, 0L))
        assertEquals(64, packet[8].toInt())
    }

    private fun tcp(
        src: ByteArray,
        dst: ByteArray,
        srcPort: Int,
        dstPort: Int,
        seq: Long,
        ack: Long,
        flags: Int,
        payload: ByteArray = ByteArray(0),
    ): ByteArray {
        val segment = ByteArray(20 + payload.size)
        put16(segment, 0, srcPort)
        put16(segment, 2, dstPort)
        put32(segment, 4, seq)
        put32(segment, 8, ack)
        segment[12] = 0x50
        segment[13] = flags.toByte()
        put16(segment, 14, 65_535)
        payload.copyInto(segment, 20)
        return ipv4(src, dst, PROTO_TCP, segment)
    }

    private fun udp(src: ByteArray, dst: ByteArray, srcPort: Int, dstPort: Int, payload: ByteArray): ByteArray {
        val datagram = ByteArray(8 + payload.size)
        put16(datagram, 0, srcPort)
        put16(datagram, 2, dstPort)
        put16(datagram, 4, datagram.size)
        payload.copyInto(datagram, 8)
        return ipv4(src, dst, PROTO_UDP, datagram)
    }

    private fun ipv4(src: ByteArray, dst: ByteArray, protocol: Int, body: ByteArray): ByteArray {
        val packet = ByteArray(20 + body.size)
        packet[0] = 0x45
        put16(packet, 2, packet.size)
        put16(packet, 4, 0x1234)
        put16(packet, 6, 0x4000)
        packet[8] = 64
        packet[9] = protocol.toByte()
        src.copyInto(packet, 12)
        dst.copyInto(packet, 16)
        body.copyInto(packet, 20)
        fixIpChecksum(packet)
        return packet
    }

    private fun fixIpChecksum(packet: ByteArray) {
        put16(packet, 10, 0)
        put16(packet, 10, checksum(packet, 0, 20, 0L))
    }

    private fun put16(b: ByteArray, at: Int, value: Int) {
        b[at] = (value ushr 8).toByte()
        b[at + 1] = value.toByte()
    }

    private fun put32(b: ByteArray, at: Int, value: Long) {
        put16(b, at, (value ushr 16).toInt() and 0xFFFF)
        put16(b, at + 2, value.toInt() and 0xFFFF)
    }

    private fun hex(s: String) = ByteArray(s.length / 2) { s.substring(it * 2, it * 2 + 2).toInt(16).toByte() }
}
