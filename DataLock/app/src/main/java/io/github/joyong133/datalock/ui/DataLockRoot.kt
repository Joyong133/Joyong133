package io.github.joyong133.datalock.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.VpnKey
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import io.github.joyong133.datalock.core.BlockState
import io.github.joyong133.datalock.core.BlockStatus
import io.github.joyong133.datalock.core.EndReason
import io.github.joyong133.datalock.core.Format
import io.github.joyong133.datalock.core.SessionRecord
import io.github.joyong133.datalock.core.StatsCalculator
import io.github.joyong133.datalock.core.Store
import kotlinx.coroutines.flow.Flow

/** What the UI asks of the activity (system dialogs live there). */
interface DataLockActions {
    fun startBlocking()
    fun reconnect()
    fun releaseByHold()
    fun enableUninstallProtection()
    fun disableUninstallProtection()
}

private enum class Screen { HOME, APPS, HISTORY }

@Composable
fun DataLockRoot(
    actions: DataLockActions,
    messages: Flow<String>,
    quickStartRequests: Flow<Unit>,
    onFocusMode: (Boolean) -> Unit,
) {
    val context = LocalContext.current
    val store = remember { Store.get(context) }
    val status by BlockState.status.collectAsStateWithLifecycle()
    val settings by store.settings.collectAsStateWithLifecycle()
    val history by store.history.collectAsStateWithLifecycle()
    val minute = rememberNow(60_000L) / 60_000L
    val stats = remember(history, minute) { StatsCalculator.compute(history, System.currentTimeMillis()) }

    var screen by rememberSaveable { mutableStateOf(Screen.HOME) }
    var showIntro by rememberSaveable { mutableStateOf(false) }
    var celebration by remember { mutableStateOf<SessionRecord?>(null) }
    val snackbar = remember { SnackbarHostState() }
    val active = status.session != null

    // Keeps the focus screen drawn with the last session while it fades out.
    val lastActive = remember { arrayOfNulls<BlockStatus>(1) }
    if (status.session != null) lastActive[0] = status
    val activeStatus = if (status.session != null) status else lastActive[0] ?: status

    val requestStart by rememberUpdatedState {
        if (!store.vpnIntroSeen) showIntro = true else actions.startBlocking()
    }

    LaunchedEffect(Unit) { messages.collect { snackbar.showSnackbar(it) } }
    LaunchedEffect(Unit) {
        quickStartRequests.collect {
            screen = Screen.HOME
            if (BlockState.status.value.session == null) requestStart()
        }
    }
    LaunchedEffect(Unit) {
        BlockState.finished.collect { record ->
            when (record.reason) {
                EndReason.TIMER_DONE -> celebration = record
                EndReason.HOLD_RELEASE -> snackbar.showSnackbar("차단을 풀었어요. 데이터가 다시 연결돼요.")
                EndReason.INTERRUPTED -> snackbar.showSnackbar("VPN 연결이 끊겨서 차단이 풀렸어요.")
            }
        }
    }
    val focusMode = active && screen == Screen.HOME
    LaunchedEffect(focusMode) { onFocusMode(focusMode) }

    BackHandler(enabled = screen != Screen.HOME) { screen = Screen.HOME }

    Box(Modifier.fillMaxSize()) {
        AnimatedContent(
            targetState = if (screen == Screen.HOME && active) null else screen,
            transitionSpec = { fadeIn(tween(320)) togetherWith fadeOut(tween(220)) },
            label = "screen",
        ) { target ->
            when (target) {
                null -> ActiveScreen(
                    status = activeStatus,
                    onRelease = actions::releaseByHold,
                    onReconnect = actions::reconnect,
                    onOpenHistory = { screen = Screen.HISTORY },
                )
                Screen.HOME -> IdleScreen(
                    settings = settings,
                    stats = stats,
                    onStart = { requestStart() },
                    onModeChange = { mode -> store.updateSettings { it.copy(mode = mode) } },
                    onTimerChange = { minutes -> store.updateSettings { it.copy(timerMinutes = minutes) } },
                    onHoldChange = { seconds -> store.updateSettings { it.copy(holdSeconds = seconds) } },
                    sessionActive = active,
                    onEnableUninstallProtection = actions::enableUninstallProtection,
                    onDisableUninstallProtection = actions::disableUninstallProtection,
                    onOpenApps = { screen = Screen.APPS },
                    onOpenHistory = { screen = Screen.HISTORY },
                )
                Screen.APPS -> AppsScreen(
                    locked = active,
                    selected = settings.allowedPackages,
                    onToggle = { pkg, allowed ->
                        if (BlockState.status.value.session == null) {
                            store.updateSettings {
                                it.copy(allowedPackages = if (allowed) it.allowedPackages + pkg else it.allowedPackages - pkg)
                            }
                        }
                    },
                    onBack = { screen = Screen.HOME },
                )
                Screen.HISTORY -> HistoryScreen(
                    history = history,
                    stats = stats,
                    onBack = { screen = Screen.HOME },
                    onClear = store::clearHistory,
                )
            }
        }
        SnackbarHost(
            snackbar,
            Modifier
                .align(Alignment.BottomCenter)
                .navigationBarsPadding()
                .padding(16.dp),
        )
    }

    if (showIntro) {
        IntroDialog(
            onConfirm = {
                showIntro = false
                store.vpnIntroSeen = true
                actions.startBlocking()
            },
            onDismiss = { showIntro = false },
        )
    }
    celebration?.let { record -> CelebrationDialog(record) { celebration = null } }
}

@Composable
internal fun IntroDialog(onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        icon = { Icon(Icons.Rounded.VpnKey, contentDescription = null) },
        title = { Text("시작하기 전에 알아 두세요") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("데이터를 막기 위해 안드로이드의 VPN 기능을 써요. 다음 화면에서 '확인'을 눌러 주세요.")
                Text("• 실제 VPN 서버에 연결하지 않아요. 모든 연결은 휴대폰 안에서 막히고, 어떤 데이터도 밖으로 나가지 않아요.")
                Text("• 차단 중에는 화면 위쪽에 열쇠 모양 VPN 아이콘이 보여요.")
                Text("• 풀려면 버튼을 정해 둔 시간(30초 또는 1분) 동안 꾹 눌러야 해요.")
            }
        },
        confirmButton = { TextButton(onClick = onConfirm) { Text("계속") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("취소") } },
    )
}

@Composable
internal fun CelebrationDialog(record: SessionRecord, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        icon = { Text("🎉", fontSize = 40.sp) },
        title = { Text("목표 달성!") },
        text = {
            Text(
                "${Format.duration(record.durationMs)} 동안 데이터 없이 버텼어요.\n" +
                    "막아낸 연결 시도 ${Format.count(record.blockedAttempts)}회.\n이제 데이터가 다시 연결돼요.",
                textAlign = TextAlign.Center,
                style = MaterialTheme.typography.bodyLarge,
            )
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("좋아요") } },
    )
}
