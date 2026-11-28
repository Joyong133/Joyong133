package io.github.joyong133.datalock

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.VpnService
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import io.github.joyong133.datalock.core.BlockController
import io.github.joyong133.datalock.core.BlockState
import io.github.joyong133.datalock.core.EndReason
import io.github.joyong133.datalock.admin.DeviceAdmin
import io.github.joyong133.datalock.core.Store
import io.github.joyong133.datalock.guard.GuardService
import io.github.joyong133.datalock.ui.DataLockActions
import io.github.joyong133.datalock.ui.DataLockRoot
import io.github.joyong133.datalock.ui.theme.DataLockTheme
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.receiveAsFlow

class MainActivity : ComponentActivity(), DataLockActions {

    private enum class Pending { NONE, START, RECONNECT }

    private val messages = Channel<String>(Channel.BUFFERED)
    private val messageFlow = messages.receiveAsFlow()
    private val quickStarts = Channel<Unit>(Channel.CONFLATED)
    private val quickStartFlow = quickStarts.receiveAsFlow()
    private var pending = Pending.NONE
    private var focusChrome: Boolean? = null

    private val vpnConsent =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            if (result.resultCode == RESULT_OK) {
                afterVpnConsent()
            } else {
                pending = Pending.NONE
                messages.trySend("VPN 연결을 허용해야 데이터를 막을 수 있어요.")
            }
        }

    private val notificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { runPending() }

    private val deviceAdminConsent =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val on = DeviceAdmin.isActive(this)
            Store.get(this).updateSettings { it.copy(preventUninstall = on) }
            messages.trySend(
                if (on) "삭제 방지가 켜졌어요. 차단 중에는 앱을 삭제할 수 없어요." else "삭제 방지를 켜지 않았어요.",
            )
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        pending = savedInstanceState?.getString(KEY_PENDING)
            ?.let { name -> Pending.entries.firstOrNull { it.name == name } }
            ?: Pending.NONE
        setContent {
            DataLockTheme {
                DataLockRoot(
                    actions = this,
                    messages = messageFlow,
                    quickStartRequests = quickStartFlow,
                    onFocusMode = ::applySystemBars,
                )
            }
        }
        if (savedInstanceState == null) handleIntent(intent)
    }

    override fun onStart() {
        super.onStart()
        // A session that should still be running (the app was killed, or the phone restarted
        // without the boot broadcast) is picked up again as soon as the app is opened.
        BlockController.resume(this)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.putString(KEY_PENDING, pending.name)
    }

    override fun startBlocking() {
        if (BlockState.status.value.session != null) return
        pending = Pending.START
        requestVpnConsent()
    }

    override fun reconnect() {
        pending = Pending.RECONNECT
        requestVpnConsent()
    }

    override fun releaseByHold() {
        BlockController.finishSession(this, EndReason.HOLD_RELEASE)
    }

    override fun enableUninstallProtection() {
        if (DeviceAdmin.isActive(this)) return
        try {
            deviceAdminConsent.launch(DeviceAdmin.requestIntent(this))
        } catch (_: ActivityNotFoundException) {
            messages.trySend("이 휴대폰에서는 삭제 방지 기능을 쓸 수 없어요.")
        }
    }

    override fun disableUninstallProtection() {
        // Only allowed while nothing is blocking; the UI hides the button during a session.
        if (BlockState.status.value.session != null) {
            messages.trySend("차단 중에는 삭제 방지를 끌 수 없어요.")
            return
        }
        DeviceAdmin.remove(this)
        Store.get(this).updateSettings { it.copy(preventUninstall = false) }
    }

    private fun handleIntent(intent: Intent?) {
        if (intent?.action == ACTION_QUICK_START) quickStarts.trySend(Unit)
    }

    private fun requestVpnConsent() {
        val consent = VpnService.prepare(this)
        if (consent == null) {
            afterVpnConsent()
            return
        }
        try {
            // Our own consent dialog must not be closed by the guard.
            GuardService.allowOwnConsentDialog()
            vpnConsent.launch(consent)
        } catch (_: ActivityNotFoundException) {
            pending = Pending.NONE
            messages.trySend("이 휴대폰에서는 VPN 기능을 쓸 수 없어요.")
        }
    }

    private fun afterVpnConsent() {
        val store = Store.get(this)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            !store.askedNotificationPermission &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            // Asked once, so the "blocking" notification can show. Blocking works either way.
            store.askedNotificationPermission = true
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            runPending()
        }
    }

    private fun runPending() {
        when (pending) {
            Pending.START -> if (!BlockController.start(this)) {
                messages.trySend("차단을 시작하지 못했어요. 잠시 후 다시 눌러 주세요.")
            }
            Pending.RECONNECT -> if (!BlockController.resume(this)) {
                messages.trySend("다시 연결하지 못했어요. 잠시 후 다시 시도해 주세요.")
            }
            Pending.NONE -> Unit
        }
        pending = Pending.NONE
    }

    /** Light system-bar icons over the dark focus screen, normal ones elsewhere. */
    private fun applySystemBars(focus: Boolean) {
        if (focusChrome == focus) return
        focusChrome = focus
        if (focus) {
            enableEdgeToEdge(
                statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
                navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
            )
        } else {
            enableEdgeToEdge()
        }
    }

    companion object {
        const val ACTION_QUICK_START = "io.github.joyong133.datalock.action.QUICK_START"
        private const val KEY_PENDING = "pending"
    }
}
