package io.github.joyong133.datalock.ui

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.AdminPanelSettings
import androidx.compose.material.icons.rounded.Apps
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.EmojiEvents
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.Remove
import androidx.compose.material.icons.rounded.Shield
import androidx.compose.material.icons.rounded.SignalCellularAlt
import androidx.compose.material.icons.rounded.Timer
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.LineBreak
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LifecycleResumeEffect
import io.github.joyong133.datalock.guard.GuardService
import io.github.joyong133.datalock.core.BlockMode
import io.github.joyong133.datalock.core.Format
import io.github.joyong133.datalock.core.Settings
import io.github.joyong133.datalock.core.Stats

private val TIMER_PRESETS = listOf(0, 1, 30, 60, 120, 240, 480)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun IdleScreen(
    settings: Settings,
    stats: Stats,
    onStart: () -> Unit,
    onModeChange: (BlockMode) -> Unit,
    onTimerChange: (Int) -> Unit,
    onOpenApps: () -> Unit,
    onOpenHistory: () -> Unit,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("데이터 잠금", fontWeight = FontWeight.Bold) },
                actions = {
                    IconButton(onClick = onOpenHistory) {
                        Icon(Icons.Rounded.History, contentDescription = "기록 보기")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Transparent),
            )
        },
        containerColor = MaterialTheme.colorScheme.background,
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp)
                .padding(bottom = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            StartButton(onClick = onStart)
            Text(
                "누르는 순간 데이터가 잠겨요",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
            )
            Text(
                if (settings.mode == BlockMode.MOBILE_ONLY) {
                    "모바일 데이터를 켜도 인터넷이 연결되지 않아요.\n풀려면 버튼을 30초 동안 꾹 눌러야 해요."
                } else {
                    "Wi-Fi와 모바일 데이터 모두 인터넷이 연결되지 않아요.\n풀려면 버튼을 30초 동안 꾹 눌러야 해요."
                },
                style = MaterialTheme.typography.bodyMedium.copy(lineBreak = LineBreak.Heading),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(4.dp))
            ModeCard(settings.mode, onModeChange)
            TimerCard(settings.timerMinutes, onTimerChange)
            AllowedAppsCard(settings.allowedPackages, onOpenApps)
            GuardCard()
            StrongLockCard()
            if (stats.sessions > 0) SummaryCard(stats, onOpenHistory)
            HowItWorksCard()
        }
    }
}

@Composable
private fun ModeCard(mode: BlockMode, onModeChange: (BlockMode) -> Unit) {
    SectionCard(title = "차단 범위", icon = Icons.Rounded.SignalCellularAlt) {
        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
            SegmentedButton(
                selected = mode == BlockMode.MOBILE_ONLY,
                onClick = { onModeChange(BlockMode.MOBILE_ONLY) },
                shape = SegmentedButtonDefaults.itemShape(index = 0, count = 2),
            ) { Text("모바일 데이터", maxLines = 1) }
            SegmentedButton(
                selected = mode == BlockMode.ALL_NETWORKS,
                onClick = { onModeChange(BlockMode.ALL_NETWORKS) },
                shape = SegmentedButtonDefaults.itemShape(index = 1, count = 2),
            ) { Text("Wi-Fi까지", maxLines = 1) }
        }
        Text(
            if (mode == BlockMode.MOBILE_ONLY) {
                "Wi-Fi는 그대로 쓸 수 있어요. 모바일 데이터로 바뀌는 순간 바로 막아요."
            } else {
                "Wi-Fi든 모바일 데이터든 모든 인터넷을 막아요."
            },
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TimerCard(minutes: Int, onTimerChange: (Int) -> Unit) {
    var showCustom by rememberSaveable { mutableStateOf(false) }
    val custom = minutes !in TIMER_PRESETS
    SectionCard(title = "자동 해제 타이머", icon = Icons.Rounded.Timer) {
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(0.dp),
        ) {
            TIMER_PRESETS.forEach { preset ->
                FilterChip(
                    selected = minutes == preset,
                    onClick = { onTimerChange(preset) },
                    label = { Text(Format.timer(preset)) },
                )
            }
            FilterChip(
                selected = custom,
                onClick = { showCustom = true },
                label = { Text(if (custom) Format.timer(minutes) else "직접 설정") },
                leadingIcon = { Icon(Icons.Rounded.Edit, contentDescription = null, Modifier.size(16.dp)) },
            )
        }
        Text(
            if (minutes == 0) {
                "타이머 없이 시작하면 30초 꾹 누르기로만 풀 수 있어요."
            } else {
                "${Format.timer(minutes)}이 지나면 저절로 풀려요. 그 전에 풀려면 30초 꾹 누르기."
            },
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
    if (showCustom) {
        CustomTimerDialog(
            initialMinutes = if (minutes > 0) minutes else 90,
            onDismiss = { showCustom = false },
            onConfirm = {
                onTimerChange(it)
                showCustom = false
            },
        )
    }
}

@Composable
private fun CustomTimerDialog(initialMinutes: Int, onDismiss: () -> Unit, onConfirm: (Int) -> Unit) {
    var hours by remember { mutableIntStateOf((initialMinutes / 60).coerceIn(0, 23)) }
    var minutes by remember { mutableIntStateOf((initialMinutes % 60) / 5 * 5) }
    val total = hours * 60 + minutes
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("타이머 직접 설정") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Stepper("시간", hours, onMinus = { hours = (hours - 1).coerceAtLeast(0) }, onPlus = { hours = (hours + 1).coerceAtMost(23) })
                Stepper("분", minutes, onMinus = { minutes = (minutes - 5).coerceAtLeast(0) }, onPlus = { minutes = (minutes + 5).coerceAtMost(55) })
                Text(
                    if (total >= 5) "${Format.timer(total)}이 지나면 저절로 풀려요." else "5분 이상으로 정해 주세요.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
        confirmButton = {
            TextButton(onClick = { onConfirm(total) }, enabled = total >= 5) { Text("확인") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("취소") } },
    )
}

@Composable
private fun Stepper(label: String, value: Int, onMinus: () -> Unit, onPlus: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
        FilledTonalIconButton(onClick = onMinus) { Icon(Icons.Rounded.Remove, contentDescription = "$label 줄이기") }
        Text(
            "$value",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.Center,
            modifier = Modifier.width(56.dp),
        )
        FilledTonalIconButton(onClick = onPlus) { Icon(Icons.Rounded.Add, contentDescription = "$label 늘리기") }
    }
}

@Composable
private fun AllowedAppsCard(packages: Set<String>, onOpenApps: () -> Unit) {
    val context = LocalContext.current
    val names = remember(packages) {
        val pm = context.packageManager
        packages.mapNotNull { pkg ->
            try {
                pm.getApplicationInfo(pkg, 0).loadLabel(pm).toString()
            } catch (_: PackageManager.NameNotFoundException) {
                null
            }
        }.sorted()
    }
    SectionCard(
        title = "허용할 앱",
        icon = Icons.Rounded.Apps,
        onClick = onOpenApps,
        trailing = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    if (names.isEmpty()) "없음" else "${names.size}개",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.primary,
                )
                Icon(
                    Icons.AutoMirrored.Rounded.KeyboardArrowRight,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
    ) {
        Text(
            if (names.isEmpty()) {
                "모든 앱의 데이터를 막아요. 카카오톡처럼 꼭 필요한 앱만 골라서 허용할 수 있어요."
            } else {
                names.joinToString(", ")
            },
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun SummaryCard(stats: Stats, onOpenHistory: () -> Unit) {
    SectionCard(
        title = "지금까지",
        icon = Icons.Rounded.EmojiEvents,
        onClick = onOpenHistory,
        trailing = {
            Icon(
                Icons.AutoMirrored.Rounded.KeyboardArrowRight,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        },
    ) {
        Row(Modifier.fillMaxWidth()) {
            MiniStat("총 차단 시간", Format.duration(stats.totalMs), Modifier.weight(1f))
            MiniStat("차단 횟수", "${stats.sessions}회", Modifier.weight(1f))
            MiniStat("연속 기록", "${stats.streakDays}일", Modifier.weight(1f))
        }
    }
}

@Composable
private fun GuardCard() {
    val context = LocalContext.current
    var enabled by remember { mutableStateOf(GuardService.isEnabled(context)) }
    LifecycleResumeEffect(Unit) {
        enabled = GuardService.isEnabled(context)
        onPauseOrDispose { }
    }
    SectionCard(
        title = "VPN 설정 잠그기",
        icon = Icons.Rounded.AdminPanelSettings,
        trailing = {
            Text(
                if (enabled) "켜짐" else "꺼짐",
                style = MaterialTheme.typography.labelLarge,
                color = if (enabled) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
            )
        },
    ) {
        Text(
            if (enabled) {
                "차단 중에 VPN 설정 화면, 알림창의 VPN 연결 끊기 창, 다른 VPN 앱, 그리고 이 지킴이를 끄는 접근성 화면이 열리면 바로 닫아요."
            } else {
                "‘차단 지킴이’를 켜 두면 차단 중에 VPN 설정 화면, 알림창의 VPN 연결 끊기 창, 다른 VPN 앱, 그리고 이 지킴이를 끄는 접근성 화면이 열리자마자 닫혀서 VPN을 끄거나 다른 VPN으로 바꿀 수 없어요."
            },
            style = MaterialTheme.typography.bodyMedium.copy(lineBreak = LineBreak.Heading),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (!enabled) {
            Text(
                "1. 아래 ‘접근성 설정 열기’ → 설치된 앱 → ‘데이터 잠금 차단 지킴이’ 켜기\n" +
                    "2. ‘제한된 설정’이라고 막히면: ‘앱 정보 열기’ → 오른쪽 위 ⋮ → ‘제한된 설정 허용’ 후 1번 다시",
                style = MaterialTheme.typography.bodySmall.copy(lineBreak = LineBreak.Heading),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilledTonalButton(onClick = { GuardService.openSettings(context) }) { Text("접근성 설정 열기") }
                TextButton(onClick = { GuardService.openAppInfo(context) }) { Text("앱 정보 열기") }
            }
        }
    }
}

@Composable
private fun StrongLockCard() {
    val context = LocalContext.current
    SectionCard(title = "더 강력하게 잠그기 (선택)", icon = Icons.Rounded.Shield) {
        Text(
            "안드로이드의 ‘항상 VPN 사용’과 ‘VPN 없이 연결 차단’을 이 앱에 켜 두면, 차단 중에는 VPN을 끄기 어려워지고 설령 꺼지더라도 안드로이드가 직접 데이터를 막아요.",
            style = MaterialTheme.typography.bodyMedium.copy(lineBreak = LineBreak.Heading),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            "• 설정 > 네트워크 > VPN > ‘데이터 잠금’ 옆 톱니바퀴에서 두 가지를 모두 켜 주세요.\n" +
                "• 이 모드에서는 ‘허용할 앱’ 예외가 동작하지 않고 모든 데이터가 막혀요.\n" +
                "• 완전히 풀려면: 차단 화면에서 30초 꾹(세션 종료) + 이 설정에서 ‘항상 VPN 사용’ 끄기.",
            style = MaterialTheme.typography.bodySmall.copy(lineBreak = LineBreak.Heading),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        FilledTonalButton(onClick = { context.openVpnSettings() }) {
            Text("VPN 설정 열기")
        }
    }
}

/** Opens Android's VPN settings so the user can turn on always-on and lockdown for this app. */
private fun Context.openVpnSettings() {
    val candidates = listOf(
        Intent("android.settings.VPN_SETTINGS"),
        Intent(android.provider.Settings.ACTION_SETTINGS),
    )
    for (intent in candidates) {
        try {
            startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            return
        } catch (_: android.content.ActivityNotFoundException) {
        }
    }
}

@Composable
private fun HowItWorksCard() {
    SectionCard(title = "이렇게 작동해요", icon = Icons.Rounded.Info) {
        Step(1, "시작을 누르면 휴대폰 안의 VPN이 인터넷 연결을 막아요. 데이터를 켜도 연결되지 않아요.")
        Step(2, "풀고 싶으면 버튼을 30초 동안 꾹 눌러야 해요. 중간에 손을 떼면 처음부터예요.")
        Step(3, "앱을 닫거나 휴대폰을 다시 켜도 차단은 계속돼요. 전화와 문자 메시지는 그대로 쓸 수 있어요.")
    }
}

@Composable
private fun Step(number: Int, text: String) {
    Row(verticalAlignment = Alignment.Top) {
        Box(
            Modifier
                .padding(top = 1.dp)
                .size(22.dp)
                .background(MaterialTheme.colorScheme.primaryContainer, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                "$number",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onPrimaryContainer,
                fontWeight = FontWeight.Bold,
            )
        }
        Spacer(Modifier.width(10.dp))
        Text(text, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
    }
}
