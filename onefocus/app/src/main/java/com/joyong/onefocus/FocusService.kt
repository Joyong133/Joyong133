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
import android.telecom.TelecomManager
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast

/**
 * 집중 잠금의 핵심.
 *  - 선택한 앱이 아닌 화면(홈, 최근 앱, 다른 앱)이 앞으로 오면 전체 화면 차단막을 띄우고 선택한 앱을 다시 엽니다.
 *  - 작은 상태 표시(HUD) 창이 FLAG_WATCH_OUTSIDE_TOUCH 로 화면 터치를 받아 탭 횟수를 셉니다.
 *  - 타이머 모드는 1초마다 남은 시간을 확인합니다.
 */
class FocusService : AccessibilityService() {

    companion object {
        @Volatile
        var instance: FocusService? = null
            private set

        private const val SYSTEM_UI = "com.android.systemui"

        /** 집중 중에도 막지 않는 시스템 화면(권한 팝업, 전화, 긴급 통화 등). */
        private val BASE_ALLOWED = setOf(
            "android",
            "com.android.permissioncontroller",
            "com.google.android.permissioncontroller",
            "com.google.android.gms",
            "com.android.phone",
            "com.android.server.telecom",
            "com.android.incallui",
            "com.samsung.android.incallui",
            "com.android.emergency",
            "com.google.android.apps.safetyhub",
        )
    }

    private val handler = Handler(Looper.getMainLooper())
    private var wm: WindowManager? = null
    private var hud: TextView? = null
    private var hudParams: WindowManager.LayoutParams? = null
    private var blocker: View? = null
    private var blockerProgress: TextView? = null
    private var taps = 0
    private var lastLaunch = 0L
    private var allowed: Set<String> = BASE_ALLOWED

    private val ticker = object : Runnable {
        override fun run() {
            if (!Session.isActive(this@FocusService)) return
            if (Session.mode(this@FocusService) == Session.MODE_TIMER && Session.isGoalReached(this@FocusService)) {
                complete()
                return
            }
            updateTexts()
            handler.postDelayed(this, 1000)
        }
    }

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
        allowed = buildAllowed()
        showHud()
        handler.post(ticker)
        val fg = try { rootInActiveWindow?.packageName?.toString() } catch (_: Exception) { null }
        if (fg != Session.target(this)) launchTarget(force = true)
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null || event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
        if (!Session.isActive(this)) return
        val pkg = event.packageName?.toString() ?: return
        val target = Session.target(this) ?: return

        when {
            pkg == target -> hideBlocker()
            pkg == packageName -> {
                // 집중 중에 이 앱의 설정 화면이 열리면 집중 앱으로 돌려보냅니다.
                if (event.className?.toString() == MainActivity::class.java.name) launchTarget(force = false)
            }
            pkg == SYSTEM_UI -> collapseSystemUi()
            pkg in allowed -> Unit
            else -> {
                // 홈 화면, 최근 앱, 다른 앱 → 막고 되돌리기
                showBlocker()
                launchTarget(force = false)
            }
        }
    }

    private fun buildAllowed(): Set<String> {
        val s = BASE_ALLOWED.toMutableSet()
        try {
            val imm = getSystemService(InputMethodManager::class.java)
            imm?.enabledInputMethodList?.forEach { s.add(it.packageName) }
        } catch (_: Exception) {
        }
        try {
            val tm = getSystemService(TelecomManager::class.java)
            tm?.defaultDialerPackage?.let { s.add(it) }
        } catch (_: Exception) {
        }
        s.remove(packageName)
        return s
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
        if (!force && now - lastLaunch < 700) return
        lastLaunch = now
        val target = Session.target(this) ?: return
        val intent = packageManager.getLaunchIntentForPackage(target)
        if (intent == null) {
            // 앱이 사라졌으면 세션을 끝냅니다.
            Toast.makeText(this, "집중 앱을 찾을 수 없어 세션을 종료합니다.", Toast.LENGTH_LONG).show()
            Session.finish(this)
            refresh()
            return
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
        try {
            startActivity(intent)
        } catch (_: Exception) {
        }
    }

    // ───────────────────────── 탭 세기 ─────────────────────────

    private fun onTap() {
        if (!Session.isActive(this) || Session.mode(this) != Session.MODE_TAPS) return
        if (blocker != null) return // 차단막 위 터치는 세지 않음
        taps++
        Session.setTaps(this, taps)
        if (taps >= Session.goalTaps(this)) {
            complete()
        } else {
            updateTexts()
        }
    }

    private fun complete() {
        handler.removeCallbacks(ticker)
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

    private fun hudText(): String = when (Session.mode(this)) {
        Session.MODE_TAPS -> "🎯 남은 탭 ${(Session.goalTaps(this) - taps).coerceAtLeast(0)}"
        else -> "⏱ ${Session.formatTime(Session.remainingMillis(this))}"
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
        // HUD 자체는 끌어서 옮길 수 있습니다.
        var downX = 0f
        var downY = 0f
        var startX = 0
        var startY = 0
        tv.setOnTouchListener { _, ev ->
            when (ev.actionMasked) {
                MotionEvent.ACTION_OUTSIDE -> onTap()
                MotionEvent.ACTION_DOWN -> {
                    downX = ev.rawX; downY = ev.rawY; startX = lp.x; startY = lp.y
                }
                MotionEvent.ACTION_MOVE -> {
                    lp.x = startX + (ev.rawX - downX).toInt()
                    lp.y = (startY + (ev.rawY - downY).toInt()).coerceAtLeast(0)
                    try { wm.updateViewLayout(tv, lp) } catch (_: Exception) {}
                }
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

    private fun showBlocker() {
        val wm = wm ?: return
        if (blocker != null) return
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
            text = "목표를 채울 때까지 「$label」 말고는 쓸 수 없어요."
            setTextColor(0xFFCFCBE6.toInt())
            textSize = 15f
            gravity = Gravity.CENTER
        })
        val prog = TextView(this).apply {
            text = Session.progressText(this@FocusService)
            setTextColor(0xFFFFD54F.toInt())
            textSize = 18f
            gravity = Gravity.CENTER
            setPadding(0, dp(20f), 0, dp(24f))
        }
        box.addView(prog)
        box.addView(Button(this).apply {
            text = "「$label」(으)로 돌아가기"
            isAllCaps = false
            setOnClickListener { launchTarget(force = true) }
        })

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
            // HUD가 차단막 위에 보이도록 다시 올립니다.
            hud?.let { h ->
                hudParams?.let { p ->
                    wm.removeView(h)
                    wm.addView(h, p)
                }
            }
        } catch (_: Exception) {
        }
    }

    private fun hideBlocker() {
        val b = blocker ?: return
        try { wm?.removeView(b) } catch (_: Exception) {}
        blocker = null
        blockerProgress = null
    }

    private fun removeOverlays() {
        hideBlocker()
        hud?.let { try { wm?.removeView(it) } catch (_: Exception) {} }
        hud = null
        hudParams = null
    }
}
