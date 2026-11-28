package io.github.joyong133.datalock.core

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import java.util.concurrent.atomic.AtomicLong

/** Live view of the blocker, shared by the service, the UI, the tile and the receivers. */
data class BlockStatus(
    /** The running session, or null when nothing is blocked. */
    val session: ActiveSession? = null,
    val serviceRunning: Boolean = false,
    /** The tunnel is up: traffic is being dropped right now. */
    val engaged: Boolean = false,
    /** Mobile-only mode while the phone is on Wi-Fi: nothing to block until it falls back to mobile data. */
    val onWifi: Boolean = false,
    val blockedAttempts: Long = 0,
    /** A session is running but Android no longer lets us hold the VPN; the app must ask again. */
    val needsPermission: Boolean = false,
)

object BlockState {
    private val _status = MutableStateFlow(BlockStatus())
    val status: StateFlow<BlockStatus> = _status.asStateFlow()

    /** Bumped by the packet thread for every blocked connection attempt. */
    val blockedCounter = AtomicLong()

    private val _finished = MutableSharedFlow<SessionRecord>(extraBufferCapacity = 4)

    /** Emits each session as it ends, so the open UI can react (celebrate, show a message). */
    val finished: SharedFlow<SessionRecord> = _finished.asSharedFlow()

    fun init(store: Store) {
        val session = store.activeSession()
        blockedCounter.set(if (session != null) store.sessionBlockedCount else 0L)
        _status.value = BlockStatus(session = session, blockedAttempts = blockedCounter.get())
    }

    fun update(transform: (BlockStatus) -> BlockStatus) = _status.update(transform)

    internal fun emitFinished(record: SessionRecord) {
        _finished.tryEmit(record)
    }
}
