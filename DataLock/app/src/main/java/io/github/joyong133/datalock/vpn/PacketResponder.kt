package io.github.joyong133.datalock.vpn

import kotlin.math.min

/**
 * Decides what to send back for a packet that an app tried to send while blocking.
 *
 * Dropping packets silently would leave apps waiting for timeouts (a spinner for 30 seconds or
 * more). Instead we answer the way a closed server would, so apps show "no connection" at once:
 * TCP gets a RST, UDP (DNS, QUIC) gets an ICMP "port unreachable". Only IPv4 needs handling:
 * the tunnel configures no IPv6 at all, so Android itself rejects every IPv6 packet.
 *
 * Pure Kotlin, so it is covered by JVM unit tests.
 */
class PacketResponder {

    class Result(
        /** The packet to write back into the tunnel, or null to just drop. */
        val reply: ByteArray?,
        /** True when the packet opened a new connection attempt (TCP SYN, UDP datagram). */
        val isNewAttempt: Boolean,
    )

    private var nextId = 1

    fun respond(packet: ByteArray, length: Int): Result {
        if (length < IPV4_HEADER || length > packet.size) return DROP
        val versionAndIhl = packet[0].toInt() and 0xFF
        if (versionAndIhl ushr 4 != 4) return DROP
        val ihl = (versionAndIhl and 0x0F) * 4
        if (ihl < IPV4_HEADER || ihl > length) return DROP
        val total = u16(packet, 2)
        if (total < ihl || total > length) return DROP
        // A later fragment carries no transport header to answer.
        if (u16(packet, 6) and 0x1FFF != 0) return DROP
        // Never answer multicast, broadcast or packets without a source address.
        val firstDstOctet = packet[16].toInt() and 0xFF
        if (firstDstOctet in 224..239 || isAll(packet, 16, 0xFF) || isAll(packet, 12, 0x00)) return DROP

        return when (packet[9].toInt() and 0xFF) {
            PROTO_TCP -> tcp(packet, ihl, total)
            PROTO_UDP -> udp(packet, ihl, total)
            else -> DROP
        }
    }

    /** RST built as RFC 793 §3.4 describes, so the app's kernel accepts it in any state. */
    private fun tcp(p: ByteArray, ihl: Int, total: Int): Result {
        if (total - ihl < TCP_HEADER) return DROP
        val flags = p[ihl + 13].toInt() and 0xFF
        if (flags and RST != 0) return DROP
        val dataOffset = ((p[ihl + 12].toInt() and 0xFF) ushr 4) * 4
        if (dataOffset < TCP_HEADER || ihl + dataOffset > total) return DROP

        val seq = u32(p, ihl + 4)
        val ack = u32(p, ihl + 8)
        val payload = total - ihl - dataOffset
        val segmentLength = payload + (if (flags and SYN != 0) 1 else 0) + (if (flags and FIN != 0) 1 else 0)

        val rstSeq: Long
        val rstAck: Long
        val rstFlags: Int
        if (flags and ACK != 0) {
            rstSeq = ack
            rstAck = 0
            rstFlags = RST
        } else {
            rstSeq = 0
            rstAck = (seq + segmentLength) and 0xFFFF_FFFFL
            rstFlags = RST or ACK
        }

        val out = ByteArray(IPV4_HEADER + TCP_HEADER)
        writeIpv4Header(out, out.size, PROTO_TCP, p)
        val t = IPV4_HEADER
        out[t] = p[ihl + 2] // source port = the port the app tried to reach
        out[t + 1] = p[ihl + 3]
        out[t + 2] = p[ihl] // destination port = the app's port
        out[t + 3] = p[ihl + 1]
        put32(out, t + 4, rstSeq)
        put32(out, t + 8, rstAck)
        out[t + 12] = (5 shl 4).toByte() // header length: 5 words, no options
        out[t + 13] = rstFlags.toByte()
        put16(out, t + 16, transportChecksum(out, t, TCP_HEADER, PROTO_TCP))

        val opensConnection = flags and SYN != 0 && flags and ACK == 0
        return Result(out, opensConnection)
    }

    /** ICMP destination unreachable / port unreachable, quoting the header as RFC 792 asks. */
    private fun udp(p: ByteArray, ihl: Int, total: Int): Result {
        if (total - ihl < UDP_HEADER) return DROP
        val quoted = min(total, ihl + 8)
        val icmpLength = ICMP_HEADER + quoted
        val out = ByteArray(IPV4_HEADER + icmpLength)
        writeIpv4Header(out, out.size, PROTO_ICMP, p)
        val i = IPV4_HEADER
        out[i] = ICMP_DEST_UNREACHABLE.toByte()
        out[i + 1] = ICMP_PORT_UNREACHABLE.toByte()
        System.arraycopy(p, 0, out, i + ICMP_HEADER, quoted)
        put16(out, i + 2, checksum(out, i, icmpLength, 0L))
        return Result(out, true)
    }

    /** Header of a packet travelling back from the address the app tried to reach. */
    private fun writeIpv4Header(out: ByteArray, totalLength: Int, protocol: Int, original: ByteArray) {
        out[0] = 0x45
        out[1] = 0
        put16(out, 2, totalLength)
        put16(out, 4, nextId)
        nextId = (nextId + 1) and 0xFFFF
        put16(out, 6, 0x4000) // don't fragment
        out[8] = 64 // TTL
        out[9] = protocol.toByte()
        System.arraycopy(original, 16, out, 12, 4) // from: the original destination
        System.arraycopy(original, 12, out, 16, 4) // to: the app
        put16(out, 10, checksum(out, 0, IPV4_HEADER, 0L))
    }

    companion object {
        private val DROP = Result(null, false)

        const val IPV4_HEADER = 20
        private const val TCP_HEADER = 20
        private const val UDP_HEADER = 8
        private const val ICMP_HEADER = 8

        const val PROTO_ICMP = 1
        const val PROTO_TCP = 6
        const val PROTO_UDP = 17

        const val FIN = 0x01
        const val SYN = 0x02
        const val RST = 0x04
        const val ACK = 0x10

        const val ICMP_DEST_UNREACHABLE = 3
        const val ICMP_PORT_UNREACHABLE = 3

        /** Internet checksum (RFC 1071) of [length] bytes, starting from a partial [initial] sum. */
        fun checksum(buf: ByteArray, offset: Int, length: Int, initial: Long): Int {
            var sum = initial
            var i = offset
            val end = offset + length
            while (i + 1 < end) {
                sum += ((buf[i].toInt() and 0xFF) shl 8) or (buf[i + 1].toInt() and 0xFF)
                i += 2
            }
            if (i < end) sum += (buf[i].toInt() and 0xFF) shl 8
            while (sum ushr 16 != 0L) sum = (sum and 0xFFFF) + (sum ushr 16)
            return (sum.inv() and 0xFFFF).toInt()
        }

        /** TCP/UDP checksum over the IPv4 pseudo-header of the packet in [out] plus the segment. */
        fun transportChecksum(out: ByteArray, offset: Int, length: Int, protocol: Int): Int {
            var sum = 0L
            for (i in 12 until 20 step 2) sum += u16(out, i)
            sum += protocol
            sum += length
            return checksum(out, offset, length, sum)
        }

        fun u16(b: ByteArray, at: Int): Int =
            ((b[at].toInt() and 0xFF) shl 8) or (b[at + 1].toInt() and 0xFF)

        fun u32(b: ByteArray, at: Int): Long =
            (u16(b, at).toLong() shl 16) or u16(b, at + 2).toLong()

        private fun put16(b: ByteArray, at: Int, value: Int) {
            b[at] = (value ushr 8).toByte()
            b[at + 1] = value.toByte()
        }

        private fun put32(b: ByteArray, at: Int, value: Long) {
            put16(b, at, (value ushr 16).toInt() and 0xFFFF)
            put16(b, at + 2, value.toInt() and 0xFFFF)
        }

        private fun isAll(b: ByteArray, at: Int, value: Int): Boolean =
            (0 until 4).all { (b[at + it].toInt() and 0xFF) == value }
    }
}
