package io.github.joyong133.datalock.vpn

import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.net.VpnService
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.os.SystemClock
import android.util.Log
import androidx.core.app.ServiceCompat
import io.github.joyong133.datalock.R
import io.github.joyong133.datalock.core.ActiveSession
import io.github.joyong133.datalock.core.BlockController
import io.github.joyong133.datalock.core.BlockMode
import io.github.joyong133.datalock.core.BlockState
import io.github.joyong133.datalock.core.EndReason
import io.github.joyong133.datalock.core.Notifications
import io.github.joyong133.datalock.core.Store
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

/**
 * Blocks data with a local VPN that routes every IPv4 packet of the blocked apps into a
 * [Tunnel] which never forwards anything. Nothing ever leaves the phone.
 *
 * In mobile-only mode the tunnel is only up while the phone's default network is mobile data;
 * on Wi-Fi it is taken down so Wi-Fi keeps working, and it comes back the moment the phone
 * falls back to mobile data.
 */
class BlockVpnService : VpnService() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val main = Handler(Looper.getMainLooper())

    private var applied: ActiveSession? = null
    private var tunnel: Tunnel? = null
    private var watcher: NetworkWatcher? = null
    private var timerJob: Job? = null
    private var lastStartId = 0
    private val recentRestarts = ArrayDeque<Long>()

    override fun onCreate() {
        super.onCreate()
        BlockState.update { it.copy(serviceRunning = true) }

        // However a session ends (30-second hold, timer, revoke), tear everything down.
        scope.launch {
            BlockState.status.map { it.session }.distinctUntilChanged().collect { session ->
                when {
                    session == null -> if (lastStartId != 0) shutdown()
                    applied != null && session != applied -> apply(session)
                }
            }
        }
        // Keep the ongoing notification in step with what is being blocked.
        scope.launch {
            BlockState.status
                .map { Triple(it.session, it.engaged, it.onWifi) }
                .distinctUntilChanged()
                .collect { (session, _, _) ->
                    if (session != null && applied != null) {
                        Notifications.updateOngoing(this@BlockVpnService, BlockState.status.value)
                    }
                }
        }
        scope.launch { publishCounter() }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        lastStartId = startId
        // Always go foreground first: we were started with startForegroundService().
        if (!goForeground()) {
            shutdown()
            return START_NOT_STICKY
        }
        val session = BlockState.status.value.session ?: Store.get(this).activeSession()
        if (session == null) {
            shutdown()
            return START_NOT_STICKY
        }
        if (session.hasTimer && System.currentTimeMillis() >= session.endsAt) {
            BlockController.finishSession(this, EndReason.TIMER_DONE, endedAt = session.endsAt)
            return START_NOT_STICKY
        }
        if (prepare(this) != null) {
            // The VPN consent is gone. Keep the session; the app asks again when opened.
            BlockState.update { it.copy(session = session, needsPermission = true) }
            Notifications.needsAttention(this)
            shutdown()
            return START_NOT_STICKY
        }
        BlockState.update { it.copy(session = session, needsPermission = false) }
        apply(session)
        // If Android kills us, it restarts the service and blocking resumes.
        return START_STICKY
    }

    override fun onRevoke() {
        // Called on a binder thread when the VPN is switched off in system settings or another
        // VPN app takes over. Respect it: the session ends and is recorded as interrupted.
        main.post {
            disengage()
            if (BlockState.status.value.session != null) {
                BlockController.finishSession(this, EndReason.INTERRUPTED)
            } else {
                shutdown()
            }
        }
    }

    override fun onDestroy() {
        timerJob?.cancel()
        watcher?.stop()
        watcher = null
        tunnel?.close()
        tunnel = null
        if (BlockState.status.value.session != null) {
            Store.get(this).sessionBlockedCount = BlockState.blockedCounter.get()
        }
        scope.cancel()
        main.removeCallbacksAndMessages(null)
        BlockState.update { it.copy(serviceRunning = false, engaged = false, onWifi = false) }
        super.onDestroy()
    }

    private fun goForeground(): Boolean {
        val notification = Notifications.ongoing(this, BlockState.status.value)
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                startForeground(
                    Notifications.ID_ONGOING,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
                )
            } else {
                startForeground(Notifications.ID_ONGOING, notification)
            }
            true
        } catch (e: RuntimeException) {
            Log.w(TAG, "cannot run in the foreground", e)
            BlockState.update { it.copy(needsPermission = true) }
            Notifications.needsAttention(this)
            false
        }
    }

    private fun apply(session: ActiveSession) {
        if (session == applied) return
        applied = session
        watcher?.stop()
        watcher = null
        disengage()
        BlockState.update { it.copy(onWifi = false) }
        if (session.mode == BlockMode.ALL_NETWORKS) {
            engage()
        } else {
            onUplink(NetworkWatcher.current(this))
            watcher = NetworkWatcher(this, ::onUplink).also { it.start() }
        }
        scheduleTimer(session)
        Notifications.updateOngoing(this, BlockState.status.value)
    }

    private fun onUplink(uplink: Uplink) {
        val session = applied ?: return
        val onWifi = session.mode == BlockMode.MOBILE_ONLY && uplink == Uplink.WIFI
        BlockState.update { it.copy(onWifi = onWifi) }
        // Unknown or no network counts as mobile: stay blocked rather than leak.
        if (onWifi) disengage() else engage()
    }

    private fun engage() {
        val session = applied ?: return
        if (tunnel != null) return
        val pfd = try {
            establishInterface(session)
        } catch (e: RuntimeException) {
            Log.w(TAG, "establish failed", e)
            null
        }
        if (pfd == null) {
            // Android no longer lets us hold the VPN (another VPN app took over).
            BlockController.finishSession(this, EndReason.INTERRUPTED)
            return
        }
        tunnel = Tunnel(pfd, BlockState.blockedCounter, ::onTunnelDied).also { it.start() }
        BlockState.update { it.copy(engaged = true) }
    }

    private fun establishInterface(session: ActiveSession): ParcelFileDescriptor? {
        val builder = Builder()
            .setSession(getString(R.string.app_name))
            .setMtu(MTU)
            .addAddress(TUN_ADDRESS, 32)
            .addRoute("0.0.0.0", 0)
            // A DNS server inside the tunnel: lookups fail at once instead of timing out.
            // No IPv6 address or route is added, so Android blocks all IPv6 by itself.
            .addDnsServer(TUN_DNS)
            .setConfigureIntent(Notifications.openAppIntent(this))
        builder.addDisallowedApplication(packageName)
        for (pkg in session.allowedPackages) {
            try {
                builder.addDisallowedApplication(pkg)
            } catch (_: PackageManager.NameNotFoundException) {
                // Uninstalled since it was allowed.
            }
        }
        return builder.establish()
    }

    private fun disengage() {
        val current = tunnel ?: return
        tunnel = null
        current.close()
        BlockState.update { it.copy(engaged = false) }
    }

    /** The interface died on its own; bring it back unless that keeps happening. */
    private fun onTunnelDied(dead: Tunnel) {
        main.post {
            if (tunnel !== dead) return@post
            tunnel = null
            BlockState.update { it.copy(engaged = false) }
            val now = SystemClock.elapsedRealtime()
            recentRestarts.addLast(now)
            while (recentRestarts.isNotEmpty() && now - recentRestarts.first() > 60_000) {
                recentRestarts.removeFirst()
            }
            if (recentRestarts.size > 3) {
                BlockController.finishSession(this, EndReason.INTERRUPTED)
                return@post
            }
            val session = applied ?: return@post
            if (session.mode == BlockMode.ALL_NETWORKS || !BlockState.status.value.onWifi) engage()
        }
    }

    private fun scheduleTimer(session: ActiveSession) {
        timerJob?.cancel()
        timerJob = null
        if (!session.hasTimer) return
        timerJob = scope.launch {
            while (true) {
                val left = session.endsAt - System.currentTimeMillis()
                if (left <= 0) break
                delay(left.coerceAtMost(15_000))
            }
            BlockController.finishSession(this@BlockVpnService, EndReason.TIMER_DONE)
        }
    }

    /** Pushes the blocked-attempt count to the UI and saves it now and then. */
    private suspend fun publishCounter() {
        var savedValue = -1L
        var savedAt = 0L
        while (true) {
            delay(1_500)
            val value = BlockState.blockedCounter.get()
            if (value != BlockState.status.value.blockedAttempts) {
                BlockState.update { it.copy(blockedAttempts = value) }
            }
            val now = SystemClock.elapsedRealtime()
            if (applied != null && value != savedValue && now - savedAt >= 20_000) {
                Store.get(this).sessionBlockedCount = value
                savedValue = value
                savedAt = now
            }
        }
    }

    private fun shutdown() {
        timerJob?.cancel()
        timerJob = null
        watcher?.stop()
        watcher = null
        disengage()
        applied = null
        BlockState.update { it.copy(onWifi = false) }
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        // Only stops if no newer start request arrived meanwhile (a session started right away).
        stopSelfResult(lastStartId)
    }

    companion object {
        const val ACTION_RUN = "io.github.joyong133.datalock.action.RUN"

        private const val TAG = "BlockVpnService"
        private const val MTU = 1500
        private const val TUN_ADDRESS = "10.111.222.2"
        private const val TUN_DNS = "10.111.222.1"
    }
}
