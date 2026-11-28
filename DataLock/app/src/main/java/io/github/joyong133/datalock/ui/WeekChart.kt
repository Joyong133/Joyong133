package io.github.joyong133.datalock.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import io.github.joyong133.datalock.core.DayTotal
import io.github.joyong133.datalock.core.Format
import io.github.joyong133.datalock.ui.theme.LocalExtraColors
import kotlin.math.max
import kotlin.math.min

/** Clean axis maxima; half of each is a clean tick too. */
private val NICE_MAX_MS = listOf(30, 60, 120, 240, 360, 480, 720, 960, 1440).map { it * 60_000L }

internal fun niceMax(maxMs: Long): Long = NICE_MAX_MS.firstOrNull { it >= maxMs } ?: NICE_MAX_MS.last()

/**
 * Blocked time per day for the last seven days: one series, so one color and no legend.
 * The selected day (today by default; tap a bar to pick another) is read out above the plot,
 * where it can never collide with a neighbouring bar.
 */
@Composable
fun WeekChart(days: List<DayTotal>, modifier: Modifier = Modifier) {
    if (days.isEmpty()) return
    val extras = LocalExtraColors.current
    val textMeasurer = rememberTextMeasurer()
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    val strong = MaterialTheme.colorScheme.onSurface
    val axisStyle = MaterialTheme.typography.labelSmall.copy(color = muted)
    val axisStrongStyle = axisStyle.copy(color = strong, fontWeight = FontWeight.Bold)
    val emptyStyle = MaterialTheme.typography.bodySmall.copy(color = muted)

    val last = days.lastIndex
    var selected by remember(days) { mutableIntStateOf(last) }
    val axisMax = niceMax(days.maxOf { it.ms })
    val hasData = days.any { it.ms > 0 }
    val dayLabels = remember(days) { days.mapIndexed { i, d -> if (i == last) "오늘" else Format.weekday(d.date) } }
    val description = remember(days) {
        "최근 7일 차단 시간. " + days.indices.joinToString(", ") { "${dayLabels[it]} ${Format.duration(days[it].ms)}" }
    }

    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (hasData) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
                Text(
                    "${dayLabels[selected]} ",
                    style = MaterialTheme.typography.bodyMedium,
                    color = muted,
                )
                Text(
                    if (days[selected].ms == 0L) "기록 없음" else Format.duration(days[selected].ms),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f),
                )
                Text("막대를 누르면 그날을 볼 수 있어요", style = MaterialTheme.typography.labelSmall, color = muted)
            }
        }
        Canvas(
            Modifier
                .fillMaxWidth()
                .height(160.dp)
                .semantics { contentDescription = description }
                .pointerInput(days) {
                    detectTapGestures { offset ->
                        val gutter = 44.dp.toPx()
                        val slot = (size.width - gutter) / days.size
                        val index = ((offset.x - gutter) / slot).toInt()
                        if (index in days.indices) selected = index
                    }
                },
        ) {
            val gutter = 44.dp.toPx()
            val topPad = 8.dp.toPx()
            val axisBand = 24.dp.toPx()
            val plotTop = topPad
            val plotBottom = size.height - axisBand
            val plotHeight = plotBottom - plotTop
            val plotWidth = size.width - gutter
            val slot = plotWidth / days.size
            val barWidth = min(24.dp.toPx(), slot * 0.55f)
            val corner = 4.dp.toPx()
            val hairline = 1.dp.toPx()

            // Recessive hairline grid with clean ticks: max, half, zero.
            listOf(axisMax, axisMax / 2, 0L).forEach { tick ->
                val y = plotBottom - plotHeight * (tick.toFloat() / axisMax)
                drawLine(extras.chartGrid, Offset(gutter, y), Offset(size.width, y), hairline)
                val label = textMeasurer.measure(if (tick == 0L) "0" else Format.shortHours(tick), axisStyle)
                drawText(
                    label,
                    topLeft = Offset(gutter - 8.dp.toPx() - label.size.width, y - label.size.height / 2f),
                )
            }

            days.forEachIndexed { i, day ->
                val centerX = gutter + slot * i + slot / 2f
                if (day.ms > 0) {
                    // Rounded at the data end, square on the baseline.
                    val h = max(2.dp.toPx(), plotHeight * (day.ms.toFloat() / axisMax).coerceAtMost(1f))
                    val r = min(corner, h)
                    val path = Path().apply {
                        addRoundRect(
                            RoundRect(
                                left = centerX - barWidth / 2f,
                                top = plotBottom - h,
                                right = centerX + barWidth / 2f,
                                bottom = plotBottom,
                                topLeftCornerRadius = CornerRadius(r),
                                topRightCornerRadius = CornerRadius(r),
                                bottomRightCornerRadius = CornerRadius.Zero,
                                bottomLeftCornerRadius = CornerRadius.Zero,
                            ),
                        )
                    }
                    drawPath(path, extras.chartBar)
                }
                val dayLabel = textMeasurer.measure(
                    dayLabels[i],
                    if (hasData && i == selected) axisStrongStyle else axisStyle,
                )
                drawText(
                    dayLabel,
                    topLeft = Offset(centerX - dayLabel.size.width / 2f, plotBottom + 6.dp.toPx()),
                )
            }

            if (!hasData) {
                val text = textMeasurer.measure("이번 주 기록이 아직 없어요", emptyStyle)
                drawText(
                    text,
                    topLeft = Offset(gutter + (plotWidth - text.size.width) / 2f, plotTop + (plotHeight - text.size.height) / 2f),
                )
            }
        }
    }
}
