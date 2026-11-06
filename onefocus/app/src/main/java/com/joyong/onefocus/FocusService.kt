package com.joyong.onefocus

import android.accessibilityservice.AccessibilityService
import android.app.KeyguardManager
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityWindowInfo
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import kotlin.math.abs

/**
 * 집중 잠금의 핵심.
 *  - 지금 앞에 있는 앱을 직접 확인해서, 선택한 앱(또는 허용한 앱)이 아니면 차단 화면을 띄우고 선택한 앱을 다시 엽니다.
 *    선택한 앱이 다시 앞에 오면 차단 화면은 자동으로 사라집니다(1초마다 재확인).
 *  - 작은 상태 표시(HUD) 창이 FLAG_WATCH_OUTSIDE_TOUCH 로 화면 터치를 받아 탭 횟수를 셉니다.
 *  - HUD를 톡 누르면 허용한 앱(전화, 메시지 등) 바로가기 창이 열립니다.
 */
class FocusService : AccessibilityService() {

    companion object {
        @Volatile
        var instance: FocusService? = null
            private set

        private const val SYSTEM_UI = "com.android.systemui"
    }

    private val handler = Handler(Looper.getMainLooper())
    private var wm: WindowManager? = null
    private var hud: TextView? = null
    private var hudParams: WindowManager.LayoutParams? = null
    private var blocker: View? = null
    private var blockerProgress: TextView? = null
    private var panel: View? = null
    private var taps = 0
    private var lastLaunch = 0L
    private var allowed: Set<String> = emptySet()
    private var quick: List<String> = emptyList()
    /** 마지막으로 확인한 앞쪽 앱. */
    private var foreground: String? = null

    private val ticker = object : Runnable {
        override fun run() {
            if (!Session.isActive(this@FocusService)) return
            if (Session.mode(this@FocusService) == Session.MODE_TIMER && Session.isGoalReached(this@FocusService)) {
                complete()
                return
            }
            check()
            updateTexts()
            handler.postDelayed(this, 1000)
        }
    }

    private val checkRunnable = Runnable { check() }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        wm = getSystemService(WINDOW_SERVICE) as WindowManager
        refresh()
    }

    override fun onUnbind(intent: Intent?): Boolean {
        cleanup()
        return super.onUnbind(intent)
    }

    override fun onDestroy() {
        cleanup()
        super.onDestroy()
    }

    private fun cleanup() {
        handler.removeCallbacksAndMessages(null)
        removeOverlays()
        if (instance === this) instance = null
    }

    override fun onInterrupt() {}

    /** 세션 상태에 맞춰 잠금을 켜거나 끕니다. 세션 시작 직후에도 호출됩니다. */
    fun refresh() {
        handler.removeCallbacks(ticker)
        if (!Session.isActive(this)) {
            removeOverlays()
            return
        }
        if (Session.isGoalReached(this)) {
            complete()
            return
        }
        taps = Session.taps(this)
        allowed = AllowedApps.all(this)
        quick = AllowedApps.quickApps(this)
        showHud()
        if (foregroundPkg() != Session.target(this)) launchTarget(force = true)
        handler.post(ticker)
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null || event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
        if (!Session.isActive(this)) return
        if (event.packageName?.toString() == SYSTEM_UI) {
            collapseSystemUi()
            return
        }
        // 창 전환 애니메이션이 끝난 뒤 실제 앞쪽 앱을 확인합니다.
        handler.removeCallbacks(checkRunnable)
        handler.postDelayed(checkRunnable, 250)
    }

    /** 지금 화면 맨 앞에 있는 일반 앱의 패키지 이름. (차단 화면 같은 오버레이는 제외) */
    private fun foregroundPkg(): String? {
        try {
            var fallback: String? = null
            for (w in windows) {
                if (w.type != AccessibilityWindowInfo.TYPE_APPLICATION) continue
                val pkg = w.root?.packageName?.toString() ?: continue
                if (w.isActive || w.isFocused) return pkg
                if (fallback == null) fallback = pkg
            }
            return fallback ?: rootInActiveWindow?.packageName?.toString()
        } catch (_: Exception) {
            return null
        }
    }

    private fun isAllowed(pkg: String) = pkg == Session.target(this) || pkg in allowed

    /** 앞쪽 앱을 확인해서 차단 화면을 켜거나 끕니다. */
    private fun check() {
        if (!Session.isActive(this)) return
        val fg = foregroundPkg() ?: return
        foreground = fg
        if (isAllowed(fg)) {
            hideBlocker()
        } else if (blocker == null && SystemClock.uptimeMillis() - lastLaunch < 1000) {
            // 방금 집중 앱을 실행했으면 화면이 바뀔 때까지 잠깐 기다립니다(차단 화면 깜빡임 방지).
            handler.removeCallbacks(checkRunnable)
            handler.postDelayed(checkRunnable, 500)
        } else {
            // 홈 화면, 최근 앱, 다른 앱, 집중 중 열린 이 앱의 설정 화면
            showBlocker()
            launchTarget(force = false)
        }
    }

    /** 알림창 / 빠른 설정을 닫습니다. 잠금 화면에서는 건드리지 않습니다. */
    private fun collapseSystemUi() {
        val km = getSystemService(KeyguardManager::class.java)
        if (km?.isKeyguardLocked == true) return
        handler.postDelayed({
            if (!Session.isActive(this)) return@postDelayed
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                performGlobalAction(GLOBAL_ACTION_DISMISS_NOTIFICATION_SHADE)
            } else {
                try {
                    @Suppress("DEPRECATION")
                    sendBroadcast(Intent(Intent.ACTION_CLOSE_SYSTEM_DIALOGS))
                } catch (_: Exception) {
                }
            }
        }, 150)
    }

    fun launchTarget(force: Boolean) {
        val now = SystemClock.uptimeMillis()
        if (!force && now - lastLaunch < 1500) return
        lastLaunch = now
        val target = Session.target(this) ?: return
        if (!AllowedApps.launchable(this, target)) {
            // 앱이 사라졌으면 세션을 끝냅니다.
            Toast.makeText(this, "집중 앱을 찾을 수 없어 세션을 종료합니다.", Toast.LENGTH_LONG).show()
            Session.finish(this)
            refresh()
            return
        }
        launchPackage(target)
        // 실행이 끝나면 차단 화면이 바로 사라지도록 몇 번 다시 확인합니다.
        handler.postDelayed(checkRunnable, 400)
        handler.postDelayed({ check() }, 1200)
    }

    private fun launchPackage(pkg: String) {
        val intent = packageManager.getLaunchIntentForPackage(pkg) ?: return
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
        try {
            startActivity(intent)
        } catch (_: Exception) {
        }
    }

    private fun openAllowedApp(pkg: String) {
        hidePanel()
        hideBlocker()
        foreground = pkg
        launchPackage(pkg)
    }

    // ───────────────────────── 탭 세기 ─────────────────────────

    private fun onTap() {
        if (!Session.isActive(this) || Session.mode(this) != Session.MODE_TAPS) return
        // 집중 앱 화면에서 누른 것만 셉니다.
        if (blocker != null || panel != null) return
        if (foreground != null && foreground != Session.target(this)) return
        taps++
        Session.setTaps(this, taps)
        if (taps >= Session.goalTaps(this)) {
            complete()
        } else {
            updateTexts()
        }
    }

    private fun complete() {
        handler.removeCallbacksAndMessages(null)
        Session.finish(this)
        removeOverlays()
        Toast.makeText(this, "🎉 집중 완료! 수고했어요.", Toast.LENGTH_LONG).show()
        val i = Intent(this, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            .putExtra(MainActivity.EXTRA_DONE, true)
        try {
            startActivity(i)
        } catch (_: Exception) {
        }
    }

    // ───────────────────────── 오버레이 ─────────────────────────

    private fun dp(v: Float): Int =
        TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, resources.displayMetrics).toInt()

    private fun overlayParams(w: Int, h: Int, flags: Int) = WindowManager.LayoutParams(
        w, h,
        WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
        flags,
        PixelFormat.TRANSLUCENT,
    )

    private fun hudText(): String {
        val main = when (Session.mode(this)) {
            Session.MODE_TAPS -> "🎯 남은 탭 ${(Session.goalTaps(this) - taps).coerceAtLeast(0)}"
            else -> "⏱ ${Session.formatTime(Session.remainingMillis(this))}"
        }
        return if (quick.isNotEmpty()) "$main  ☰" else main
    }

    private fun showHud() {
        val wm = wm ?: return
        if (hud != null) {
            updateTexts()
            return
        }
        val tv = TextView(this).apply {
            setTextColor(Color.WHITE)
            textSize = 13f
            setPadding(dp(12f), dp(5f), dp(12f), dp(5f))
            background = GradientDrawable().apply {
                cornerRadius = dp(20f).toFloat()
                setColor(0xD95B3FD6.toInt())
            }
            text = hudText()
        }
        val lp = overlayParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
        ).apply {
            gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
            y = dp(36f)
        }

        // HUD 바깥(= 집중 앱 화면) 터치는 ACTION_OUTSIDE 로 들어옵니다 → 탭 1회.
        // HUD는 끌어서 옮길 수 있고, 톡 누르면 허용 앱 바로가기가 열립니다.
        var downX = 0f
        var downY = 0f
        var startX = 0
        var startY = 0
        var moved = false
        val slop = dp(8f)
        tv.setOnTouchListener { _, ev ->
            when (ev.actionMasked) {
                MotionEvent.ACTION_OUTSIDE -> onTap()
                MotionEvent.ACTION_DOWN -> {
                    downX = ev.rawX; downY = ev.rawY; startX = lp.x; startY = lp.y; moved = false
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = ev.rawX - downX
                    val dy = ev.rawY - downY
                    if (abs(dx) > slop || abs(dy) > slop) moved = true
                    if (moved) {
                        lp.x = startX + dx.toInt()
                        lp.y = (startY + dy.toInt()).coerceAtLeast(0)
                        try { wm.updateViewLayout(tv, lp) } catch (_: Exception) {}
                    }
                }
                MotionEvent.ACTION_UP -> if (!moved) togglePanel()
            }
            true
        }
        try {
            wm.addView(tv, lp)
            hud = tv
            hudParams = lp
        } catch (_: Exception) {
        }
    }

    private fun updateTexts() {
        hud?.text = hudText()
        blockerProgress?.text = Session.progressText(this)
    }

    /** 허용 앱 버튼들 (전화, 메시지, 추가한 앱). */
    private fun addAllowedButtons(box: LinearLayout) {
        val dialer = AllowedApps.dialerPackage(this)
        val sms = AllowedApps.smsPackage(this)
        for (pkg in quick) {
            val name = AllowedApps.label(this, pkg)
            val icon = when (pkg) {
                dialer -> "📞 "
                sms -> "💬 "
                else -> "▶ "
            }
            box.addView(Button(this).apply {
                text = "$icon$name"
                isAllCaps = false
                setOnClickListener { openAllowedApp(pkg) }
            }, LinearLayout.LayoutParams(dp(240f), LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(6f) })
        }
    }

    private fun showBlocker() {
        val wm = wm ?: return
        if (blocker != null) return
        hidePanel()
        val label = Session.label(this)

        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(0xF2120F1F.toInt())
            setPadding(dp(32f), dp(32f), dp(32f), dp(32f))
            isClickable = true // 아래 화면(홈 등)으로 터치가 새지 않게
        }
        box.addView(TextView(this).apply {
            text = "🔒"
            textSize = 56f
            gravity = Gravity.CENTER
        })
        box.addView(TextView(this).apply {
            text = "집중하는 중이에요"
            setTextColor(Color.WHITE)
            textSize = 24f
            gravity = Gravity.CENTER
            setPadding(0, dp(12f), 0, dp(8f))
        })
        box.addView(TextView(this).apply {
            text = "목표를 채울 때까지 「$label」 말고는 쓸 수 없어요.\n잠시 후 자동으로 돌아갑니다."
            setTextColor(0xFFCFCBE6.toInt())
            textSize = 15f
            gravity = Gravity.CENTER
        })
        val prog = TextView(this).apply {
            text = Session.progressText(this@FocusService)
            setTextColor(0xFFFFD54F.toInt())
            textSize = 18f
            gravity = Gravity.CENTER
            setPadding(0, dp(20f), 0, dp(20f))
        }
        box.addView(prog)
        box.addView(Button(this).apply {
            text = "「$label」(으)로 돌아가기"
            isAllCaps = false
            setOnClickListener { launchTarget(force = true) }
        }, LinearLayout.LayoutParams(dp(240f), LinearLayout.LayoutParams.WRAP_CONTENT))
        addAllowedButtons(box)

        val lp = overlayParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
        )
        try {
            wm.addView(box, lp)
            blocker = box
            blockerProgress = prog
            raiseHud()
        } catch (_: Exception) {
        }
    }

    /** HUD가 다른 오버레이 위에 보이도록 다시 올립니다. */
    private fun raiseHud() {
        val wm = wm ?: return
        val h = hud ?: return
        val p = hudParams ?: return
        try {
            wm.removeView(h)
            wm.addView(h, p)
        } catch (_: Exception) {
        }
    }

    private fun hideBlocker() {
        val b = blocker ?: return
        try { wm?.removeView(b) } catch (_: Exception) {}
        blocker = null
        blockerProgress = null
    }

    private fun togglePanel() {
        if (panel != null) {
            hidePanel()
            return
        }
        if (blocker != null) return // 차단 화면에 이미 버튼이 있음
        val wm = wm ?: return
        if (quick.isEmpty()) {
            Toast.makeText(this, "허용한 앱이 없어요. (원앱 집중 → 집중 중 허용할 앱)", Toast.LENGTH_SHORT).show()
            return
        }
        val dim = LinearLayout(this).apply {
            gravity = Gravity.CENTER
            setBackgroundColor(0x99000000.toInt())
            setOnClickListener { hidePanel() }
        }
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(20f), dp(20f), dp(20f), dp(16f))
            background = GradientDrawable().apply {
                cornerRadius = dp(18f).toFloat()
                setColor(0xFF1E1A33.toInt())
            }
            isClickable = true
        }
        card.addView(TextView(this).apply {
            text = "집중 중에 열 수 있는 앱"
            setTextColor(Color.WHITE)
            textSize = 17f
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, dp(8f))
        })
        addAllowedButtons(card)
        card.addView(Button(this).apply {
            text = "닫기"
            isAllCaps = false
            setOnClickListener { hidePanel() }
        }, LinearLayout.LayoutParams(dp(240f), LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(10f) })
        dim.addView(card)

        val lp = overlayParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
        )
        try {
            wm.addView(dim, lp)
            panel = dim
        } catch (_: Exception) {
        }
    }

    private fun hidePanel() {
        val p = panel ?: return
        try { wm?.removeView(p) } catch (_: Exception) {}
        panel = null
    }

    private fun removeOverlays() {
        hidePanel()
        hideBlocker()
        hud?.let { try { wm?.removeView(it) } catch (_: Exception) {} }
        hud = null
        hudParams = null
    }
}
