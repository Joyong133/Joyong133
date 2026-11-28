package io.github.joyong133.datalock.ui

import android.content.Intent
import android.content.pm.ActivityInfo
import android.content.pm.ApplicationInfo
import android.content.pm.PackageInfo
import android.content.pm.ResolveInfo
import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.View
import androidx.compose.runtime.Composable
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTouchInput
import io.github.joyong133.datalock.core.ActiveSession
import io.github.joyong133.datalock.core.BlockMode
import io.github.joyong133.datalock.core.BlockStatus
import io.github.joyong133.datalock.core.EndReason
import io.github.joyong133.datalock.core.SessionRecord
import io.github.joyong133.datalock.core.Settings
import io.github.joyong133.datalock.core.StatsCalculator
import io.github.joyong133.datalock.ui.theme.DataLockTheme
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import org.robolectric.shadows.ShadowSystemClock
import java.io.File
import java.io.FileOutputStream
import java.time.Duration
import java.util.TimeZone

/**
 * Renders every screen to PNG so the layout can be checked without a phone.
 * Run with: ./gradlew :app:testDebugUnitTest -Pscreenshots --tests '*ScreenshotTest'
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "ko-rKR-w360dp-h780dp-xxhdpi")
class ScreenshotTest {

    @get:Rule
    val compose = createComposeRule()

    private val minute = 60_000L
    private val hour = 60 * minute
    private val now = System.currentTimeMillis()

    @Before
    fun setUp() {
        TimeZone.setDefault(TimeZone.getTimeZone("Asia/Seoul"))
        installFakeApps()
    }

    private val history: List<SessionRecord> by lazy {
        fun rec(daysAgo: Int, hoursAgo: Double, minutes: Long, reason: EndReason, timer: Boolean, blocked: Long) =
            (now - daysAgo * 24 * hour - (hoursAgo * hour).toLong()).let { start ->
                SessionRecord(
                    startedAt = start,
                    endedAt = start + minutes * minute,
                    plannedEnd = if (timer) start + (if (reason == EndReason.TIMER_DONE) minutes else minutes * 2) * minute else 0L,
                    mode = if (daysAgo == 3) BlockMode.ALL_NETWORKS else BlockMode.MOBILE_ONLY,
                    reason = reason,
                    blockedAttempts = blocked,
                )
            }
        listOf(
            rec(0, 3.0, 95, EndReason.TIMER_DONE, true, 2_341),
            rec(1, 2.0, 150, EndReason.TIMER_DONE, true, 4_012),
            rec(1, 9.0, 40, EndReason.HOLD_RELEASE, false, 512),
            rec(2, 4.0, 60, EndReason.HOLD_RELEASE, true, 873),
            rec(3, 6.0, 200, EndReason.TIMER_DONE, true, 6_120),
            rec(5, 5.0, 30, EndReason.INTERRUPTED, false, 95),
            rec(6, 1.0, 80, EndReason.TIMER_DONE, true, 1_330),
        ).sortedByDescending { it.startedAt }
    }

    private val stats get() = StatsCalculator.compute(history, now)

    private val activeSession = ActiveSession(
        startedAt = now - 37 * minute - 12_000,
        endsAt = now + 83 * minute,
        mode = BlockMode.MOBILE_ONLY,
        allowedPackages = setOf("com.kakao.talk"),
    )

    @Test
    fun idleLight() = shoot("01_idle_light") {
        IdleScreen(
            settings = Settings(BlockMode.MOBILE_ONLY, 60, setOf("com.kakao.talk", "viva.republica.toss")),
            stats = stats,
            onStart = {}, onModeChange = {}, onTimerChange = {}, onOpenApps = {}, onOpenHistory = {},
        )
    }

    @Test
    fun idleStrongLock() {
        compose.setContent {
            DataLockTheme {
                IdleScreen(
                    settings = Settings(BlockMode.MOBILE_ONLY, 60, setOf("com.kakao.talk")),
                    stats = stats,
                    onStart = {}, onModeChange = {}, onTimerChange = {}, onOpenApps = {}, onOpenHistory = {},
                )
            }
        }
        compose.onNodeWithText("접근성 설정 열기").performScrollTo()
        capture("13_strong_lock")
    }

    @Test
    fun idleDarkFirstRun() = shoot("02_idle_dark_first_run", dark = true) {
        IdleScreen(
            settings = Settings(BlockMode.ALL_NETWORKS, 0, emptySet()),
            stats = StatsCalculator.compute(emptyList(), now),
            onStart = {}, onModeChange = {}, onTimerChange = {}, onOpenApps = {}, onOpenHistory = {},
        )
    }

    @Test
    fun activeBlocking() = shoot("03_active_blocking") {
        ActiveScreen(
            status = BlockStatus(session = activeSession, serviceRunning = true, engaged = true, blockedAttempts = 1_234),
            onRelease = {}, onReconnect = {}, onOpenHistory = {},
        )
    }

    @Test
    fun activeHolding() {
        compose.mainClock.autoAdvance = false
        compose.setContent {
            DataLockTheme {
                ActiveScreen(
                    status = BlockStatus(session = activeSession, serviceRunning = true, engaged = true, blockedAttempts = 1_234),
                    onRelease = {}, onReconnect = {}, onOpenHistory = {},
                )
            }
        }
        compose.mainClock.advanceTimeBy(500)
        compose.onNodeWithContentDescription("버튼을 30초 동안 길게 누르면 차단이 풀려요")
            .performTouchInput { down(center) }
        compose.mainClock.advanceTimeByFrame()
        ShadowSystemClock.advanceBy(Duration.ofSeconds(12))
        compose.mainClock.advanceTimeBy(500)
        capture("04_active_holding")
    }

    @Test
    fun activeOnWifiWithoutTimer() = shoot("05_active_wifi_no_timer", dark = true) {
        ActiveScreen(
            status = BlockStatus(
                session = activeSession.copy(endsAt = 0L, allowedPackages = emptySet()),
                serviceRunning = true,
                engaged = false,
                onWifi = true,
                blockedAttempts = 87,
            ),
            onRelease = {}, onReconnect = {}, onOpenHistory = {},
        )
    }

    @Test
    fun activeNeedsPermission() = shoot("06_active_needs_permission") {
        ActiveScreen(
            status = BlockStatus(session = activeSession, serviceRunning = false, needsPermission = true, blockedAttempts = 12),
            onRelease = {}, onReconnect = {}, onOpenHistory = {},
        )
    }

    @Test
    fun history() = shoot("07_history") {
        HistoryScreen(history = history, stats = stats, onBack = {}, onClear = {})
    }

    @Test
    fun historyDark() = shoot("08_history_dark", dark = true) {
        HistoryScreen(history = history, stats = stats, onBack = {}, onClear = {})
    }

    @Test
    fun apps() {
        compose.setContent {
            DataLockTheme {
                AppsScreen(locked = false, selected = setOf("com.kakao.talk"), onToggle = { _, _ -> }, onBack = {})
            }
        }
        compose.waitUntil(10_000) { compose.onAllNodesWithText("카카오톡").fetchSemanticsNodes().isNotEmpty() }
        compose.waitForIdle()
        capture("09_apps")
    }

    @Test
    fun appsLocked() {
        compose.setContent {
            DataLockTheme(darkTheme = true) {
                AppsScreen(locked = true, selected = setOf("com.kakao.talk", "com.google.android.gms"), onToggle = { _, _ -> }, onBack = {})
            }
        }
        compose.waitUntil(10_000) { compose.onAllNodesWithText("카카오톡").fetchSemanticsNodes().isNotEmpty() }
        compose.waitForIdle()
        capture("10_apps_locked_dark")
    }

    @Test
    fun introDialog() {
        compose.setContent { DataLockTheme { IntroDialog(onConfirm = {}, onDismiss = {}) } }
        compose.waitForIdle()
        capture("11_intro_dialog")
    }

    @Test
    fun celebrationDialog() {
        compose.setContent { DataLockTheme { CelebrationDialog(history.first(), onDismiss = {}) } }
        compose.waitForIdle()
        capture("12_celebration_dialog")
    }

    private fun shoot(name: String, dark: Boolean = false, content: @Composable () -> Unit) {
        compose.setContent { DataLockTheme(darkTheme = dark) { content() } }
        capture(name)
    }

    /** Draws every window (activity first, then dialogs over a scrim) into one bitmap. */
    private fun capture(name: String) {
        compose.waitForIdle()
        val global = Class.forName("android.view.WindowManagerGlobal").getMethod("getInstance").invoke(null)!!
        @Suppress("UNCHECKED_CAST")
        val names = global.javaClass.getMethod("getViewRootNames").invoke(global) as Array<String>
        val getRootView = global.javaClass.getMethod("getRootView", String::class.java)
        val views = names.map { getRootView.invoke(global, it) as View }.filter { it.width > 0 && it.height > 0 }
        val main = views.first()
        val bitmap = Bitmap.createBitmap(main.width, main.height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        views.forEachIndexed { index, view ->
            canvas.save()
            if (index > 0) {
                canvas.drawColor(0x99000000.toInt())
                canvas.translate((main.width - view.width) / 2f, (main.height - view.height) / 2f)
            }
            view.draw(canvas)
            canvas.restore()
        }
        save(bitmap, name)
    }

    private fun save(bitmap: Bitmap, name: String) {
        val dir = File(System.getProperty("screenshots.dir") ?: "build/screenshots").apply { mkdirs() }
        FileOutputStream(File(dir, "$name.png")).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }

    private fun installFakeApps() {
        val context = RuntimeEnvironment.getApplication()
        val shadow = shadowOf(context.packageManager)
        val launcher = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        listOf(
            "com.kakao.talk" to "카카오톡",
            "com.google.android.youtube" to "YouTube",
            "com.nhn.android.search" to "네이버",
            "com.instagram.android" to "Instagram",
            "com.google.android.apps.maps" to "Google 지도",
            "viva.republica.toss" to "토스",
            "com.coupang.mobile" to "쿠팡",
            "com.google.android.gms" to "Google Play 서비스",
        ).forEach { (pkg, label) ->
            val app = ApplicationInfo().apply {
                packageName = pkg
                nonLocalizedLabel = label
            }
            shadow.installPackage(PackageInfo().apply {
                packageName = pkg
                applicationInfo = app
            })
            if (pkg != "com.google.android.gms") {
                shadow.addResolveInfoForIntent(
                    launcher,
                    ResolveInfo().apply {
                        activityInfo = ActivityInfo().apply {
                            packageName = pkg
                            name = "$pkg.Main"
                            applicationInfo = app
                            nonLocalizedLabel = label
                        }
                    },
                )
            }
        }
    }
}
