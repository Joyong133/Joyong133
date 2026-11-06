package com.joyong.onefocus

import android.content.Context
import android.provider.Telephony
import android.telecom.TelecomManager
import android.view.inputmethod.InputMethodManager

/** 집중 중에도 열 수 있는 앱 계산. */
object AllowedApps {

    /** 항상 허용: 시스템 팝업, 권한 창, 전화 수신 화면, 긴급 통화. */
    private val SYSTEM = setOf(
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

    private val KNOWN_DIALERS = listOf("com.google.android.dialer", "com.samsung.android.dialer", "com.android.dialer")
    private val KNOWN_SMS = listOf(
        "com.google.android.apps.messaging", "com.samsung.android.messaging", "com.android.mms", "com.android.messaging",
    )

    fun dialerPackage(c: Context): String? {
        val d = try { c.getSystemService(TelecomManager::class.java)?.defaultDialerPackage } catch (_: Exception) { null }
        return d ?: KNOWN_DIALERS.firstOrNull { launchable(c, it) }
    }

    fun smsPackage(c: Context): String? {
        val d = try { Telephony.Sms.getDefaultSmsPackage(c) } catch (_: Exception) { null }
        return d ?: KNOWN_SMS.firstOrNull { launchable(c, it) }
    }

    fun launchable(c: Context, pkg: String) = c.packageManager.getLaunchIntentForPackage(pkg) != null

    fun label(c: Context, pkg: String): String = try {
        c.packageManager.getApplicationLabel(c.packageManager.getApplicationInfo(pkg, 0)).toString()
    } catch (_: Exception) {
        pkg
    }

    /** 사용자가 바로 열 수 있는 허용 앱 목록 (전화 → 메시지 → 추가한 앱 순). */
    fun quickApps(c: Context): List<String> {
        val out = LinkedHashSet<String>()
        if (Session.allowPhone(c)) dialerPackage(c)?.let { out.add(it) }
        if (Session.allowSms(c)) smsPackage(c)?.let { out.add(it) }
        out.addAll(Session.extraAllowed(c))
        out.remove(Session.target(c))
        out.remove(c.packageName)
        return out.filter { launchable(c, it) }
    }

    /** 화면에 떠도 막지 않는 패키지 전체. */
    fun all(c: Context): Set<String> {
        val s = SYSTEM.toMutableSet()
        try {
            c.getSystemService(InputMethodManager::class.java)?.enabledInputMethodList?.forEach { s.add(it.packageName) }
        } catch (_: Exception) {
        }
        if (Session.allowPhone(c)) {
            dialerPackage(c)?.let { s.add(it) }
            s.addAll(KNOWN_DIALERS)
            s.add("com.android.contacts")
            s.add("com.samsung.android.app.contacts")
            s.add("com.google.android.contacts")
        }
        if (Session.allowSms(c)) {
            smsPackage(c)?.let { s.add(it) }
            s.addAll(KNOWN_SMS)
        }
        s.addAll(Session.extraAllowed(c))
        s.remove(c.packageName)
        return s
    }
}
