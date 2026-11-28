package io.github.joyong133.datalock.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.LineBreak

private val LightColors = lightColorScheme(
    primary = Color(0xFF5B4CF0),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFE6E1FF),
    onPrimaryContainer = Color(0xFF1B1065),
    secondary = Color(0xFF5E5C71),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFE4E0F9),
    onSecondaryContainer = Color(0xFF1A1A2C),
    tertiary = Color(0xFF8E44D6),
    onTertiary = Color.White,
    tertiaryContainer = Color(0xFFF4DAFF),
    onTertiaryContainer = Color(0xFF2E004E),
    background = Color(0xFFF7F6FC),
    onBackground = Color(0xFF1B1B21),
    surface = Color(0xFFF7F6FC),
    onSurface = Color(0xFF1B1B21),
    surfaceVariant = Color(0xFFE5E1EC),
    onSurfaceVariant = Color(0xFF47464F),
    surfaceContainerLowest = Color.White,
    surfaceContainerLow = Color(0xFFF2F0FA),
    surfaceContainer = Color(0xFFECEAF6),
    surfaceContainerHigh = Color(0xFFE6E4F0),
    surfaceContainerHighest = Color(0xFFE0DEEA),
    outline = Color(0xFF787680),
    outlineVariant = Color(0xFFC9C5D0),
    error = Color(0xFFBA1A1A),
    onError = Color.White,
    errorContainer = Color(0xFFFFDAD6),
    onErrorContainer = Color(0xFF410002),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFFC6BFFF),
    onPrimary = Color(0xFF2A1C93),
    primaryContainer = Color(0xFF4335C9),
    onPrimaryContainer = Color(0xFFE6E1FF),
    secondary = Color(0xFFC8C4DC),
    onSecondary = Color(0xFF2F2F42),
    secondaryContainer = Color(0xFF474659),
    onSecondaryContainer = Color(0xFFE4E0F9),
    tertiary = Color(0xFFDDB7FF),
    onTertiary = Color(0xFF4A0080),
    tertiaryContainer = Color(0xFF6A1FB0),
    onTertiaryContainer = Color(0xFFF4DAFF),
    background = Color(0xFF121218),
    onBackground = Color(0xFFE4E1E9),
    surface = Color(0xFF121218),
    onSurface = Color(0xFFE4E1E9),
    surfaceVariant = Color(0xFF47464F),
    onSurfaceVariant = Color(0xFFC9C5D0),
    surfaceContainerLowest = Color(0xFF0D0D12),
    surfaceContainerLow = Color(0xFF1B1B21),
    surfaceContainer = Color(0xFF1F1F26),
    surfaceContainerHigh = Color(0xFF2A2930),
    surfaceContainerHighest = Color(0xFF35343B),
    outline = Color(0xFF928F99),
    outlineVariant = Color(0xFF47464F),
    error = Color(0xFFFFB4AB),
    onError = Color(0xFF690005),
    errorContainer = Color(0xFF93000A),
    onErrorContainer = Color(0xFFFFDAD6),
)

/** Colors that are not part of the Material scheme. */
@Immutable
data class ExtraColors(
    /** The single series color of the weekly chart (validated against both card surfaces). */
    val chartBar: Color,
    val chartGrid: Color,
)

private val LightExtras = ExtraColors(chartBar = Color(0xFF5B4CF0), chartGrid = Color(0xFFD9D6E3))
private val DarkExtras = ExtraColors(chartBar = Color(0xFF8B7CFF), chartGrid = Color(0xFF35343B))

val LocalExtraColors = staticCompositionLocalOf { LightExtras }

/** The immersive "blocking" screen looks the same in light and dark mode. */
object FocusColors {
    val Top = Color(0xFF0B1026)
    val Middle = Color(0xFF1A1850)
    val Bottom = Color(0xFF2E1F70)
    val Text = Color(0xFFF4F2FF)
    val TextMuted = Color(0xFFB9B5D6)
    val Card = Color(0x1AFFFFFF)
    val CardBorder = Color(0x26FFFFFF)
    val Track = Color(0x24FFFFFF)
    val HoldStart = Color(0xFFFFD166)
    val HoldMiddle = Color(0xFFFF8A5B)
    val HoldEnd = Color(0xFFFF4F7B)
    val Live = Color(0xFFFF5C7A)
    val Wifi = Color(0xFF5EE0B5)
}

/** Fixed brand gradient of the start button (white text passes 4.5:1 on both ends). */
object BrandColors {
    val Start = Color(0xFF5B4CF0)
    val End = Color(0xFF8E3FD6)
}

/** Breaks Korean lines between words (at spaces) instead of in the middle of a word. */
private val KoreanLineBreak = LineBreak(
    strategy = LineBreak.Strategy.HighQuality,
    strictness = LineBreak.Strictness.Strict,
    wordBreak = LineBreak.WordBreak.Phrase,
)

private val AppTypography = Typography().run {
    fun TextStyle.korean() = copy(lineBreak = KoreanLineBreak)
    copy(
        displayLarge = displayLarge.korean(),
        displayMedium = displayMedium.korean(),
        displaySmall = displaySmall.korean(),
        headlineLarge = headlineLarge.korean(),
        headlineMedium = headlineMedium.korean(),
        headlineSmall = headlineSmall.korean(),
        titleLarge = titleLarge.korean(),
        titleMedium = titleMedium.korean(),
        titleSmall = titleSmall.korean(),
        bodyLarge = bodyLarge.korean(),
        bodyMedium = bodyMedium.korean(),
        bodySmall = bodySmall.korean(),
        labelLarge = labelLarge.korean(),
        labelMedium = labelMedium.korean(),
        labelSmall = labelSmall.korean(),
    )
}

@Composable
fun DataLockTheme(darkTheme: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    val extras = if (darkTheme) DarkExtras else LightExtras
    androidx.compose.runtime.CompositionLocalProvider(LocalExtraColors provides extras) {
        MaterialTheme(
            colorScheme = if (darkTheme) DarkColors else LightColors,
            typography = AppTypography,
            content = content,
        )
    }
}
