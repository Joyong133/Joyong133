package io.github.joyong133.datalock.vpn

import android.os.ParcelFileDescriptor
import android.system.ErrnoException
import android.system.Os
import android.system.OsConstants
import android.system.StructPollfd
import android.util.Log
import java.io.FileDescriptor
import java.io.IOException
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

/**
 * The "black hole": reads every packet the blocked apps send into the VPN interface and never
 * forwards any of them. A worker thread sleeps in poll() until a packet arrives, so an idle
 * tunnel costs no battery.
 */
internal class Tunnel(
    private val pfd: ParcelFileDescriptor,
    private val blockedCounter: AtomicLong,
    /** Called on the worker thread if the interface dies without [close] being called. */
    private val onUnexpectedExit: (Tunnel) -> Unit,
) {
    private val wakePipe: Array<FileDescriptor> = Os.pipe()
    private val closed = AtomicBoolean(false)

    @Volatile
    private var running = true

    private val worker = Thread(::run, "datalock-tunnel").apply { isDaemon = true }

    fun start() = worker.start()

    /** Asks the worker to stop; it closes the interface itself, which takes the VPN down. */
    fun close() {
        if (!closed.compareAndSet(false, true)) return
        running = false
        try {
            Os.write(wakePipe[1], byteArrayOf(1), 0, 1)
        } catch (e: ErrnoException) {
            Log.w(TAG, "wake failed", e)
        } catch (e: IOException) {
            Log.w(TAG, "wake failed", e)
        } finally {
            closeQuietly(wakePipe[1])
        }
    }

    private fun run() {
        val tun = pfd.fileDescriptor
        val buffer = ByteArray(MAX_PACKET)
        val responder = PacketResponder()
        val tunPoll = StructPollfd().apply {
            fd = tun
            events = OsConstants.POLLIN.toShort()
        }
        val wakePoll = StructPollfd().apply {
            fd = wakePipe[0]
            events = OsConstants.POLLIN.toShort()
        }
        val polls = arrayOf(tunPoll, wakePoll)
        try {
            while (running) {
                try {
                    Os.poll(polls, -1)
                } catch (e: ErrnoException) {
                    if (e.errno == OsConstants.EINTR) continue
                    throw e
                }
                if (!running || wakePoll.revents.toInt() != 0) break
                val revents = tunPoll.revents.toInt()
                if (revents and (OsConstants.POLLERR or OsConstants.POLLHUP or OsConstants.POLLNVAL) != 0) break
                if (revents and OsConstants.POLLIN != 0) drain(tun, buffer, responder)
            }
        } catch (e: ErrnoException) {
            if (running) Log.w(TAG, "tunnel failed", e)
        } catch (e: IOException) {
            if (running) Log.w(TAG, "tunnel failed", e)
        } finally {
            val unexpected = running
            running = false
            try {
                pfd.close()
            } catch (_: IOException) {
            }
            closeQuietly(wakePipe[0])
            if (unexpected) onUnexpectedExit(this)
        }
    }

    /** Reads every queued packet (the descriptor is non-blocking) and answers it if useful. */
    private fun drain(tun: FileDescriptor, buffer: ByteArray, responder: PacketResponder) {
        while (running) {
            val length = try {
                Os.read(tun, buffer, 0, buffer.size)
            } catch (e: ErrnoException) {
                if (e.errno == OsConstants.EAGAIN || e.errno == OsConstants.EINTR) return
                throw e
            }
            if (length <= 0) return
            val result = responder.respond(buffer, length)
            if (result.isNewAttempt) blockedCounter.incrementAndGet()
            val reply = result.reply ?: continue
            try {
                Os.write(tun, reply, 0, reply.size)
            } catch (_: ErrnoException) {
                // The queue is full; the app retries and gets the next answer.
            } catch (_: IOException) {
            }
        }
    }

    private fun closeQuietly(fd: FileDescriptor) {
        try {
            Os.close(fd)
        } catch (_: ErrnoException) {
        }
    }

    private companion object {
        const val TAG = "Tunnel"
        const val MAX_PACKET = 32_767
    }
}
