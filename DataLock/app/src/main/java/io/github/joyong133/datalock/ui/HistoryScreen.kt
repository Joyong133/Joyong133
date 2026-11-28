package io.github.joyong133.datalock.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.BarChart
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.EmojiEvents
import androidx.compose.material.icons.rounded.TouchApp
import androidx.compose.material.icons.rounded.WarningAmber
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import io.github.joyong133.datalock.core.BlockMode
import io.github.joyong133.datalock.core.EndReason
import io.github.joyong133.datalock.core.Format
import io.github.joyong133.datalock.core.SessionRecord
import io.github.joyong133.datalock.core.Stats

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HistoryScreen(
    history: List<SessionRecord>,
    stats: Stats,
    onBack: () -> Unit,
    onClear: () -> Unit,
) {
    var confirmClear by rememberSaveable { mutableStateOf(false) }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("기록") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "뒤로")
                    }
                },
                actions = {
                    if (history.isNotEmpty()) {
                        IconButton(onClick = { confirmClear = true }) {
                            Icon(Icons.Rounded.DeleteOutline, contentDescription = "기록 모두 지우기")
                        }
                    }
                },
            )
        },
    ) { padding ->
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(
                start = 20.dp,
                end = 20.dp,
                top = padding.calculateTopPadding() + 4.dp,
                bottom = padding.calculateBottomPadding() + 24.dp,
            ),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item { StatGrid(stats) }
            item {
                SectionCard(title = "최근 7일 차단 시간", icon = Icons.Rounded.BarChart) {
                    WeekChart(stats.lastWeek)
                }
            }
            item {
                Text(
                    "최근 기록",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(top = 8.dp, start = 4.dp),
                )
            }
            if (history.isEmpty()) {
                item {
                    Text(
                        "아직 기록이 없어요.\n첫 번째 데이터 잠금을 시작해 보세요!",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 32.dp),
                    )
                }
            } else {
                items(history.take(100), key = { it.startedAt }) { RecordRow(it) }
            }
        }
    }
    if (confirmClear) {
        AlertDialog(
            onDismissRequest = { confirmClear = false },
            title = { Text("기록을 모두 지울까요?") },
            text = { Text("지운 기록은 되돌릴 수 없어요.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmClear = false
                    onClear()
                }) { Text("지우기") }
            },
            dismissButton = { TextButton(onClick = { confirmClear = false }) { Text("취소") } },
        )
    }
}

@Composable
private fun StatGrid(stats: Stats) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            StatTile("총 차단 시간", Format.duration(stats.totalMs), Modifier.weight(1f))
            StatTile("오늘", Format.duration(stats.todayMs), Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            StatTile("최장 기록", Format.duration(stats.longestMs), Modifier.weight(1f))
            StatTile("연속 기록", "${stats.streakDays}일", Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            StatTile(
                "타이머 목표 달성",
                if (stats.timerSessions == 0) "-" else "${stats.timerCompleted} / ${stats.timerSessions}회",
                Modifier.weight(1f),
            )
            StatTile("막아낸 연결 시도", "${Format.count(stats.blockedAttempts)}회", Modifier.weight(1f))
        }
    }
}

@Composable
private fun StatTile(label: String, value: String, modifier: Modifier = Modifier) {
    Column(
        modifier
            .clip(RoundedCornerShape(18.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun RecordRow(record: SessionRecord) {
    val scheme = MaterialTheme.colorScheme
    data class Badge(val text: String, val icon: ImageVector, val container: Color, val content: Color)
    val badge = when (record.reason) {
        EndReason.TIMER_DONE -> Badge("목표 달성", Icons.Rounded.EmojiEvents, scheme.primaryContainer, scheme.onPrimaryContainer)
        EndReason.HOLD_RELEASE -> Badge("꾹 눌러 해제", Icons.Rounded.TouchApp, scheme.secondaryContainer, scheme.onSecondaryContainer)
        EndReason.INTERRUPTED -> Badge("중간에 끊김", Icons.Rounded.WarningAmber, scheme.errorContainer, scheme.onErrorContainer)
    }
    val details = buildList {
        add(Format.dateTime(record.startedAt))
        add(if (record.mode == BlockMode.MOBILE_ONLY) "모바일 데이터" else "Wi-Fi까지")
        if (record.plannedEnd > 0) add("목표 ${Format.duration(record.plannedEnd - record.startedAt)}")
    }.joinToString(" · ")
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(scheme.surfaceContainerLow)
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(40.dp)
                .background(badge.container, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(badge.icon, contentDescription = null, tint = badge.content, modifier = Modifier.size(22.dp))
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    Format.duration(record.durationMs),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.width(8.dp))
                Text(badge.text, style = MaterialTheme.typography.labelMedium, color = scheme.onSurfaceVariant)
            }
            Text(details, style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
            if (record.blockedAttempts > 0) {
                Text(
                    "연결 시도 ${Format.count(record.blockedAttempts)}회 차단",
                    style = MaterialTheme.typography.bodySmall,
                    color = scheme.onSurfaceVariant,
                )
            }
        }
    }
}
