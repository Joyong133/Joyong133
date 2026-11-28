package io.github.joyong133.datalock.ui

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import io.github.joyong133.datalock.ui.theme.BrandColors

/** The big round "시작" button that gently breathes while it waits. */
@Composable
fun StartButton(onClick: () -> Unit, modifier: Modifier = Modifier) {
    val breathing = rememberInfiniteTransition(label = "breathing")
    val breath by breathing.animateFloat(
        initialValue = 1f,
        targetValue = 1.045f,
        animationSpec = infiniteRepeatable(tween(1_600, easing = FastOutSlowInEasing), RepeatMode.Reverse),
        label = "breath",
    )
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val pressScale by animateFloatAsState(if (pressed) 0.94f else 1f, label = "press")

    Box(modifier.size(232.dp), contentAlignment = Alignment.Center) {
        Box(
            Modifier
                .size(232.dp)
                .scale(breath)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.10f)),
        )
        Box(
            Modifier
                .size(204.dp)
                .scale(breath)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.10f)),
        )
        Box(
            Modifier
                .size(172.dp)
                .scale(pressScale)
                .shadow(18.dp, CircleShape, spotColor = BrandColors.Start)
                .clip(CircleShape)
                .background(Brush.linearGradient(listOf(BrandColors.Start, BrandColors.End)))
                .clickable(
                    interactionSource = interaction,
                    indication = ripple(color = Color.White),
                    role = Role.Button,
                    onClickLabel = "데이터 차단 시작",
                    onClick = onClick,
                ),
            contentAlignment = Alignment.Center,
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Icon(
                    Icons.Rounded.Lock,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(44.dp),
                )
                Text("시작", color = Color.White, fontSize = 30.dp.fixedSp(), fontWeight = FontWeight.Bold)
            }
        }
    }
}
