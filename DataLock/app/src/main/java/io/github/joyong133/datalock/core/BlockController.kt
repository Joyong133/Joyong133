package io.github.joyong133.datalock.core

import android.content.Context
import android.content.Intent
import android.net.VpnService
import android.util.Log
import androidx.core.content.ContextCompat
import io.github.joyong133.datalock.tile.BlockTileService
import io.github.joyong133.datalock.vpn.BlockVpnService

/**
 * Starts, resumes and ends sessions. Every way a session can end (30-second hold, timer,
 * VPN revoked) goes through [finishSession]; the service watches [BlockState] and tears
 * itself down as soon as the session is gone.
 */
object BlockController {
    private const val TAG = "BlockController"

    /** Starts a new session from the current settings. The VPN consent must already be granted. */
    fun start(context: Context): Boolean {
        if (BlockState.status.value.session != null) return true
        val store = Store.get(context)
        val settings = store.settings.value
        val now = System.currentTimeMillis()
        val session = ActiveSession(
            startedAt = now,
            endsAt = if (settings.timerMinutes > 0) now + settings.timerMinutes * 60_000L else 0L,
            mode = settings.mode,
            allowedPackages = settings.allowedPackages,
        )
        store.saveActiveSession(session)
        BlockState.blockedCounter.set(0)
        BlockState.update {
            it.copy(session = session, blockedAttempts = 0, needsPermission = false, engaged = false, onWifi = false)
        }
        if (session.hasTimer) TimerAlarm.schedule(context, session.endsAt)
        BlockTileService.requestRefresh(context)
        return launchService(context)
    }

    /**
     * Begins a permanent (no-timer) session from the current settings, for when Android's
     * "always-on VPN" starts the service with nothing already running. It does not launch the
     * service (the caller is the service) and sets no timer, so the block stays until the user
     * ends it with the 30-second hold and turns always-on off.
     */
    fun beginAlwaysOn(context: Context): ActiveSession {
        BlockState.status.value.session?.let { return it }
        val store = Store.get(context)
        store.activeSession()?.let { existing ->
            BlockState.blockedCounter.set(store.sessionBlockedCount)
            BlockState.update { it.copy(session = existing, needsPermission = false) }
            return existing
        }
        val settings = store.settings.value
        val session = ActiveSession(
            startedAt = System.currentTimeMillis(),
            endsAt = 0L,
            mode = settings.mode,
            allowedPackages = settings.allowedPackages,
        )
        store.saveActiveSession(session)
        BlockState.blockedCounter.set(0)
        BlockState.update {
            it.copy(session = session, blockedAttempts = 0, needsPermission = false, engaged = false, onWifi = false)
        }
        BlockTileService.requestRefresh(context)
        return session
    }

    /**
     * Brings blocking back for a session that is still supposed to run: after a reboot, an app
     * update, or the app being killed. Returns true when blocking is (or keeps) running.
     */
    fun resume(context: Context): Boolean {
        val store = Store.get(context)
        val session = BlockState.status.value.session ?: store.activeSession() ?: return false
        val now = System.currentTimeMillis()
        if (session.hasTimer && now >= session.endsAt) {
            finishSession(context, EndReason.TIMER_DONE, endedAt = session.endsAt)
            return false
        }
        if (BlockState.status.value.serviceRunning) return true
        if (VpnService.prepare(context) != null) {
            BlockState.update { it.copy(session = session, needsPermission = true) }
            return false
        }
        BlockState.update { it.copy(session = session, needsPermission = false) }
        if (session.hasTimer) TimerAlarm.schedule(context, session.endsAt)
        return launchService(context)
    }

    /** Ends the running session, records it and lets every component know. Safe to call twice. */
    fun finishSession(
        context: Context,
        reason: EndReason,
        endedAt: Long = System.currentTimeMillis(),
    ) {
        val store = Store.get(context)
        val session = store.activeSession() ?: BlockState.status.value.session ?: return
        val record = SessionRecord(
            startedAt = session.startedAt,
            endedAt = endedAt.coerceAtLeast(session.startedAt),
            plannedEnd = session.endsAt,
            mode = session.mode,
            reason = reason,
            blockedAttempts = BlockState.blockedCounter.get(),
        )
        store.clearActiveSession()
        store.addRecord(record)
        TimerAlarm.cancel(context)
        BlockState.update {
            it.copy(session = null, engaged = false, onWifi = false, needsPermission = false)
        }
        BlockState.emitFinished(record)
        Notifications.sessionEnded(context, record)
        BlockTileService.requestRefresh(context)
    }

    private fun launchService(context: Context): Boolean {
        val intent = Intent(context, BlockVpnService::class.java).setAction(BlockVpnService.ACTION_RUN)
        return try {
            ContextCompat.startForegroundService(context, intent)
            true
        } catch (e: IllegalStateException) {
            // Android refused a background start (ForegroundServiceStartNotAllowedException is one).
            Log.w(TAG, "Could not start the blocking service", e)
            BlockState.update { it.copy(needsPermission = true) }
            Notifications.needsAttention(context)
            false
        }
    }
}
