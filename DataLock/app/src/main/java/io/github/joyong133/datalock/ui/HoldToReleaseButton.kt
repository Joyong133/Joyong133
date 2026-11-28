package io.github.joyong133.datalock.ui

import android.os.SystemClock
import android.view.HapticFeedbackConstants
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.LockOpen
import androidx.compose.material.icons.rounded.TouchApp
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.LineBreak
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import io.github.joyong133.datalock.core.Format
import io.github.joyong133.datalock.ui.theme.FocusColors
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.sin


/**
 * The only way to stop blocking early: keep a finger on this button for 30 uninterrupted
 * seconds. Letting go resets it to zero.
 *
 * The 30 seconds are measured with the system clock, never with an animation, so turning
 * animations off in Android's settings cannot shorten the hold.
 */
@Composable
fun HoldToReleaseButton(holdSeconds: Int, onCompleted: () -> Unit, modifier: Modifier = Modifier) {
    val holdLabel = Format.hold(holdSeconds)
    val view = LocalView.current
    var progress by remember { mutableFloatStateOf(0f) }
    var holding by remember { mutableStateOf(false) }
    var completed by remember { mutableStateOf(false) }
    var releasedEarly by remember { mutableStateOf(false) }
    val latestOnCompleted by rememberUpdatedState(onCompleted)
    val secondsLeft by remember(holdSeconds) {
        derivedStateOf { ceil((1f - progress) * holdSeconds).toInt().coerceIn(0, holdSeconds) }
    }

    LaunchedEffect(holding, holdSeconds) {
        if (holding) {
            releasedEarly = false
            val startedAt = SystemClock.elapsedRealtime()
            while (true) {
                val elapsed = SystemClock.elapsedRealtime() - startedAt
                progress = (elapsed / (holdSeconds * 1_000f)).coerceAtMost(1f)
                if (progress >= 1f) break
                withFrameNanos { }
            }
            completed = true
            view.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
            latestOnCompleted()
        } else if (!completed && progress > 0f) {
            if (progress > 0.01f) releasedEarly = true
            val rewind = Animatable(progress)
            rewind.animateTo(0f, tween(500, easing = FastOutSlowInEasing)) { progress = value }
            progress = 0f
        }
    }

    // A tick every five seconds and on each of the last three, so the hold can be felt.
    LaunchedEffect(holding) {
        if (!holding) return@LaunchedEffect
        snapshotFlow { secondsLeft }.distinctUntilChanged().drop(1).collect { s ->
            if (s in 1..3 || (s > 0 && s % 5 == 0)) {
                view.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)
            }
        }
    }

    // 30 seconds is as long as many screen timeouts: keep the screen on while holding.
    DisposableEffect(holding) {
        view.keepScreenOn = holding
        onDispose { view.keepScreenOn = false }
    }

    val pressScale by animateFloatAsState(if (holding) 0.95f else 1f, label = "press")
    val glow by animateFloatAsState(if (holding) 1f else 0f, label = "glow")

    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            Modifier
                .size(248.dp)
                .semantics {
                    contentDescription = "버튼을 $holdLabel 동안 길게 누르면 차단이 풀려요"
                    role = Role.Button
                }
                .pointerInput(Unit) {
                    awaitEachGesture {
                        awaitFirstDown(requireUnconsumed = false).consume()
                        if (completed) return@awaitEachGesture
                        holding = true
                        try {
                            while (true) {
                                val event = awaitPointerEvent()
                                event.changes.forEach { it.consume() }
                                if (event.changes.none { it.pressed }) break
                            }
                        } finally {
                            holding = false
                        }
                    }
                },
            contentAlignment = Alignment.Center,
        ) {
            Box(
                Modifier
                    .size(248.dp)
                    .alpha(glow)
                    .background(
                        Brush.radialGradient(listOf(FocusColors.HoldMiddle.copy(alpha = 0.35f), Color.Transparent)),
                        CircleShape,
                    ),
            )
            Canvas(Modifier.size(228.dp)) {
                val stroke = 14.dp.toPx()
                val radius = (size.minDimension - stroke) / 2f
                val topLeft = Offset(center.x - radius, center.y - radius)
                val arcSize = Size(radius * 2f, radius * 2f)
                drawArc(
                    color = FocusColors.Track,
                    startAngle = 0f,
                    sweepAngle = 360f,
                    useCenter = false,
                    topLeft = topLeft,
                    size = arcSize,
                    style = Stroke(stroke),
                )
                val p = progress
                if (p > 0f) {
                    rotate(-90f) {
                        drawArc(
                            brush = Brush.sweepGradient(
                                0f to FocusColors.HoldStart,
                                0.5f to FocusColors.HoldMiddle,
                                1f to FocusColors.HoldEnd,
                                center = center,
                            ),
                            startAngle = 0f,
                            sweepAngle = 360f * p,
                            useCenter = false,
                            topLeft = topLeft,
                            size = arcSize,
                            style = Stroke(stroke, cap = StrokeCap.Butt),
                        )
                    }
                    // Round caps drawn by hand so each end keeps its own gradient color.
                    drawCircle(FocusColors.HoldStart, stroke / 2f, Offset(center.x, center.y - radius))
                    val angle = Math.toRadians((360.0 * p) - 90.0)
                    drawCircle(
                        holdColorAt(p),
                        stroke / 2f,
                        Offset(center.x + radius * cos(angle).toFloat(), center.y + radius * sin(angle).toFloat()),
                    )
                }
            }
            Box(
                Modifier
                    .size(180.dp)
                    .scale(pressScale)
                    .clip(CircleShape)
                    .background(FocusColors.Card)
                    .border(1.dp, FocusColors.CardBorder, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                if (completed) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Icon(
                            Icons.Rounded.LockOpen,
                            contentDescription = null,
                            tint = FocusColors.Text,
                            modifier = Modifier.size(48.dp),
                        )
                        Text("풀렸어요", color = FocusColors.Text, fontSize = 24.dp.fixedSp(), fontWeight = FontWeight.Bold)
                    }
                } else if (holding) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            "$secondsLeft",
                            color = FocusColors.Text,
                            fontSize = 68.dp.fixedSp(),
                            fontWeight = FontWeight.Bold,
                        )
                        Text("초 더 누르세요", color = FocusColors.TextMuted, fontSize = 14.dp.fixedSp())
                    }
                } else {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Icon(
                            Icons.Rounded.TouchApp,
                            contentDescription = null,
                            tint = FocusColors.Text,
                            modifier = Modifier.size(40.dp),
                        )
                        Text("$holdLabel 꾹", color = FocusColors.Text, fontSize = 24.dp.fixedSp(), fontWeight = FontWeight.Bold)
                        Text("눌러서 해제", color = FocusColors.TextMuted, fontSize = 14.dp.fixedSp())
                    }
                }
            }
        }
        Spacer(Modifier.height(14.dp))
        Text(
            text = when {
                completed -> "데이터가 다시 연결돼요"
                holding -> "손을 떼면 처음부터 다시 시작돼요"
                releasedEarly -> "괜찮아요, 조금만 더 버텨 볼까요? 🙂"
                else -> "버튼을 $holdLabel 동안 꾹 누르고 있으면 차단이 풀려요"
            },
            color = FocusColors.TextMuted,
            style = MaterialTheme.typography.bodyMedium.copy(lineBreak = LineBreak.Heading),
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = 16.dp),
        )
    }
}

private fun holdColorAt(fraction: Float): Color =
    if (fraction < 0.5f) {
        lerp(FocusColors.HoldStart, FocusColors.HoldMiddle, fraction * 2f)
    } else {
        lerp(FocusColors.HoldMiddle, FocusColors.HoldEnd, (fraction - 0.5f) * 2f)
    }
