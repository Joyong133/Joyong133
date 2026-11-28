package io.github.joyong133.datalock.ui

import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Apps
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.Shield
import androidx.compose.material.icons.rounded.WarningAmber
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.LineBreak
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import io.github.joyong133.datalock.core.ActiveSession
import io.github.joyong133.datalock.core.BlockMode
import io.github.joyong133.datalock.core.BlockStatus
import io.github.joyong133.datalock.core.Format
import io.github.joyong133.datalock.ui.theme.FocusColors
import kotlinx.coroutines.delay
import kotlin.random.Random

/** The full-screen "focus" view shown while a session runs. */
@Composable
fun ActiveScreen(
    status: BlockStatus,
    onRelease: () -> Unit,
    onReconnect: () -> Unit,
    onOpenHistory: () -> Unit,
) {
    val session = status.session ?: return
    val now = rememberNow()
    BoxWithConstraints(
        Modifier
            .fillMaxSize()
            .background(Brush.verticalGradient(listOf(FocusColors.Top, FocusColors.Middle, FocusColors.Bottom))),
    ) {
        val viewport = maxHeight
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .heightIn(min = viewport)
                .systemBarsPadding()
                .padding(horizontal = 24.dp, vertical = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "데이터 잠금",
                    color = FocusColors.TextMuted,
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = onOpenHistory) {
                    Icon(Icons.Rounded.History, contentDescription = "기록 보기", tint = FocusColors.Text)
                }
            }
            Spacer(Modifier.height(8.dp))
            StatusPill(status)
            Spacer(Modifier.height(20.dp))
            Text(
                Format.clock(now - session.startedAt),
                color = FocusColors.Text,
                fontSize = 56.dp.fixedSp(),
                maxLines = 1,
                fontWeight = FontWeight.Bold,
                // A ticking clock: fixed-width digits keep it from jittering.
                style = MaterialTheme.typography.displayMedium.copy(fontFeatureSettings = "tnum"),
            )
            Text(
                "동안 데이터 없이 버티는 중",
                color = FocusColors.TextMuted,
                style = MaterialTheme.typography.bodyLarge,
            )
            if (session.hasTimer) {
                Spacer(Modifier.height(20.dp))
                TimerBar(session, now)
            }
            if (status.needsPermission) {
                Spacer(Modifier.height(16.dp))
                ReconnectCard(onReconnect)
            }
            Spacer(Modifier.weight(1f).heightIn(min = 24.dp))
            HoldToReleaseButton(onCompleted = onRelease)
            Spacer(Modifier.weight(1f).heightIn(min = 24.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                FocusStat(
                    icon = Icons.Rounded.Shield,
                    value = "${Format.count(status.blockedAttempts)}회",
                    label = "막아낸 연결 시도",
                    modifier = Modifier.weight(1f),
                )
                FocusStat(
                    icon = Icons.Rounded.Apps,
                    value = if (session.allowedPackages.isEmpty()) "없음" else "${session.allowedPackages.size}개",
                    label = "허용한 앱",
                    modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(16.dp))
            QuoteLine()
            Spacer(Modifier.height(8.dp))
        }
    }
}

@Composable
private fun StatusPill(status: BlockStatus) {
    val session = status.session ?: return
    val (dot, text) = when {
        status.needsPermission -> FocusColors.HoldStart to "차단이 멈춰 있어요"
        status.onWifi && !status.engaged -> FocusColors.Wifi to "Wi-Fi 사용 중 · 모바일 데이터는 차단"
        !status.engaged -> FocusColors.HoldStart to "차단 준비 중…"
        session.mode == BlockMode.ALL_NETWORKS -> FocusColors.Live to "인터넷 전체 차단 중"
        else -> FocusColors.Live to "모바일 데이터 차단 중"
    }
    val pulse = rememberInfiniteTransition(label = "pulse")
    val dotAlpha by pulse.animateFloat(
        initialValue = 1f,
        targetValue = 0.35f,
        animationSpec = infiniteRepeatable(tween(900), RepeatMode.Reverse),
        label = "dot",
    )
    Row(
        Modifier
            .clip(CircleShape)
            .background(FocusColors.Card)
            .border(1.dp, FocusColors.CardBorder, CircleShape)
            .padding(horizontal = 16.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(10.dp)
                .alpha(dotAlpha)
                .background(dot, CircleShape),
        )
        Spacer(Modifier.width(10.dp))
        Text(text, color = FocusColors.Text, style = MaterialTheme.typography.labelLarge)
    }
}

@Composable
private fun TimerBar(session: ActiveSession, now: Long) {
    val total = (session.endsAt - session.startedAt).coerceAtLeast(1L)
    val left = (session.endsAt - now).coerceAtLeast(0L)
    val done = (1f - left.toFloat() / total).coerceIn(0f, 1f)
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
            Text(
                "자동 해제까지 ${Format.clock(left)}",
                color = FocusColors.Text,
                style = MaterialTheme.typography.titleSmall.copy(fontFeatureSettings = "tnum"),
                modifier = Modifier.weight(1f),
            )
            Text(
                "${Format.timeOfDay(session.endsAt)}에 풀려요",
                color = FocusColors.TextMuted,
                style = MaterialTheme.typography.bodySmall,
            )
        }
        LinearProgressIndicator(
            progress = { done },
            modifier = Modifier
                .fillMaxWidth()
                .height(8.dp),
            color = FocusColors.Wifi,
            trackColor = FocusColors.Track,
            strokeCap = StrokeCap.Round,
            gapSize = 0.dp,
            drawStopIndicator = {},
        )
    }
}

@Composable
private fun ReconnectCard(onReconnect: () -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(Color(0x33FFB020))
            .border(1.dp, Color(0x66FFC56B), RoundedCornerShape(20.dp))
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Rounded.WarningAmber, contentDescription = null, tint = FocusColors.HoldStart)
            Spacer(Modifier.width(8.dp))
            Text(
                "지금은 데이터가 막혀 있지 않아요",
                color = FocusColors.Text,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
            )
        }
        Text(
            "안드로이드가 VPN 연결 권한을 거둬 갔어요. 다시 연결하면 차단이 이어져요.",
            color = FocusColors.TextMuted,
            style = MaterialTheme.typography.bodyMedium,
        )
        Button(
            onClick = onReconnect,
            colors = ButtonDefaults.buttonColors(containerColor = FocusColors.HoldStart, contentColor = Color(0xFF2B1A00)),
        ) {
            Text("다시 연결", fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
private fun FocusStat(icon: ImageVector, value: String, label: String, modifier: Modifier = Modifier) {
    Row(
        modifier
            .clip(RoundedCornerShape(18.dp))
            .background(FocusColors.Card)
            .border(1.dp, FocusColors.CardBorder, RoundedCornerShape(18.dp))
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = FocusColors.TextMuted, modifier = Modifier.size(22.dp))
        Spacer(Modifier.width(10.dp))
        Column {
            Text(value, color = FocusColors.Text, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text(label, color = FocusColors.TextMuted, style = MaterialTheme.typography.labelSmall)
        }
    }
}

@Composable
private fun QuoteLine() {
    var index by rememberSaveable { mutableIntStateOf(Random.nextInt(QUOTES.size)) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(12_000)
            index = (index + 1) % QUOTES.size
        }
    }
    Crossfade(targetState = index, label = "quote") { i ->
        Text(
            "“${QUOTES[i]}”",
            color = FocusColors.TextMuted,
            style = MaterialTheme.typography.bodyMedium.copy(lineBreak = LineBreak.Heading),
            textAlign = TextAlign.Center,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp),
        )
    }
}

private val QUOTES = listOf(
    "지금 이 순간에 집중해 보세요.",
    "알림은 기다려 줄 거예요.",
    "화면 밖에도 재미있는 일이 많아요.",
    "잠깐의 불편함이 더 큰 자유가 돼요.",
    "고개를 들고 주변을 한번 둘러보세요.",
    "물 한 잔 마시고 기지개를 켜 보는 건 어때요?",
    "스크롤 대신 숨을 한 번 깊게.",
    "지금 하려던 그 일, 정말 급한가요?",
    "책 한 페이지, 산책 10분이면 충분해요.",
    "오늘의 나에게 집중하는 시간이에요.",
    "멈춤도 하나의 선택이에요.",
    "조금 심심해도 괜찮아요. 심심함은 생각의 시작이에요.",
)
