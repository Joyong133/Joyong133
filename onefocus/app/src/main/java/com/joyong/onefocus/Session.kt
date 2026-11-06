package com.joyong.onefocus

import android.content.Context
import android.content.SharedPreferences

/** 집중 세션 상태. 재부팅해도 이어지도록 SharedPreferences에 저장합니다. */
object Session {
    const val MODE_TAPS = 0
    const val MODE_TIMER = 1

    private fun p(c: Context): SharedPreferences =
        c.applicationContext.getSharedPreferences("focus", Context.MODE_PRIVATE)

    fun isActive(c: Context) = p(c).getBoolean("active", false)
    fun target(c: Context): String? = p(c).getString("target", null)
    fun label(c: Context): String = p(c).getString("label", null) ?: "선택한 앱"
    fun mode(c: Context) = p(c).getInt("mode", MODE_TAPS)
    fun goalTaps(c: Context) = p(c).getInt("goalTaps", 1000)
    fun minutes(c: Context) = p(c).getInt("minutes", 25)
    fun taps(c: Context) = p(c).getInt("taps", 0)
    fun endAt(c: Context) = p(c).getLong("endAt", 0L)

    fun remainingTaps(c: Context) = (goalTaps(c) - taps(c)).coerceAtLeast(0)
    fun remainingMillis(c: Context) = (endAt(c) - System.currentTimeMillis()).coerceAtLeast(0L)

    fun isGoalReached(c: Context): Boolean = when (mode(c)) {
        MODE_TAPS -> taps(c) >= goalTaps(c)
        else -> System.currentTimeMillis() >= endAt(c)
    }

    /** 마지막으로 고른 앱만 기억(세션은 시작하지 않음). */
    fun remember(c: Context, pkg: String, label: String) {
        p(c).edit().putString("target", pkg).putString("label", label).apply()
    }

    fun start(c: Context, pkg: String, label: String, mode: Int, goalTaps: Int, minutes: Int) {
        p(c).edit()
            .putBoolean("active", true)
            .putString("target", pkg)
            .putString("label", label)
            .putInt("mode", mode)
            .putInt("goalTaps", goalTaps)
            .putInt("minutes", minutes)
            .putInt("taps", 0)
            .putLong("endAt", System.currentTimeMillis() + minutes * 60_000L)
            .commit()
    }

    fun setTaps(c: Context, n: Int) {
        p(c).edit().putInt("taps", n).apply()
    }

    fun finish(c: Context) {
        p(c).edit().putBoolean("active", false).commit()
    }

    fun formatTime(ms: Long): String {
        val total = (ms + 999) / 1000
        val h = total / 3600
        val m = (total % 3600) / 60
        val s = total % 60
        return if (h > 0) String.format("%d:%02d:%02d", h, m, s) else String.format("%02d:%02d", m, s)
    }

    fun progressText(c: Context): String = when (mode(c)) {
        MODE_TAPS -> "남은 탭 ${remainingTaps(c)}회 (${taps(c)}/${goalTaps(c)})"
        else -> "남은 시간 ${formatTime(remainingMillis(c))}"
    }
}
