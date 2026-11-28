package io.github.joyong133.datalock.guard

import android.accessibilityservice.AccessibilityService
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.SystemClock
import android.provider.Settings
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.Toast
import io.github.joyong133.datalock.core.BlockState

/**
 * "차단 지킴이": an accessibility service the user turns on themselves. While (and only while)
 * a blocking session runs, it closes the screens that would switch the block off:
 *
 * - the VPN page of the Settings app,
 * - Android's VPN dialogs (the "disconnect" dialog from the notification shade, and the
 *   connection request of any other VPN app),
 * - other VPN apps.
 *
 * It reads nothing else and sends nothing anywhere. Outside a session it does nothing.
 */
class GuardService : AccessibilityService() {

    private var vpnApps: Set<String> = emptySet()
    private var vpnAppsLoadedAt = 0L
    private var lastKickAt = 0L

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        event ?: return
        if (event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED &&
            event.eventType != AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED
        ) {
            return
        }
        val session = BlockState.status.value.session ?: return
        val pkg = event.packageName?.toString() ?: return
        if (pkg == packageName) return

        val reason = when {
            pkg == VPN_DIALOGS -> if (ownConsentAllowed()) null else "VPN 연결을 바꾸는 창은 차단 중에 열 수 없어요"
            pkg in settingsPackages && isVpnSettings(event) -> "차단 중에는 VPN 설정을 열 수 없어요"
            pkg !in session.allowedPackages && pkg in vpnApps() -> "차단 중에는 다른 VPN 앱을 쓸 수 없어요"
            else -> null
        } ?: return
        kick(reason)
    }

    override fun onInterrupt() = Unit

    /** Leave the screen: back closes dialogs, home leaves settings pages and apps. */
    private fun kick(reason: String) {
        val now = SystemClock.elapsedRealtime()
        performGlobalAction(GLOBAL_ACTION_BACK)
        performGlobalAction(GLOBAL_ACTION_HOME)
        if (now - lastKickAt > 3_000) {
            Toast.makeText(this, "🔒 $reason", Toast.LENGTH_SHORT).show()
        }
        lastKickAt = now
    }

    private fun isVpnSettings(event: AccessibilityEvent): Boolean {
        val className = event.className?.toString().orEmpty()
        if (className.contains("vpn", ignoreCase = true)) return true
        // Samsung and others reuse one activity class for every page; look at the page title.
        val root = rootInActiveWindow ?: return false
        return try {
            hasVpnTitle(root, depth = 0)
        } finally {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
                @Suppress("DEPRECATION")
                root.recycle()
            }
        }
    }

    /** A toolbar / collapsing title whose text is "VPN", not a list row that leads to it. */
    private fun hasVpnTitle(node: AccessibilityNodeInfo, depth: Int): Boolean {
        if (depth > 12) return false
        val text = node.text?.toString()?.trim()
        if (text != null && text.equals("VPN", ignoreCase = true)) {
            val id = node.viewIdResourceName.orEmpty().lowercase()
            val heading = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && node.isHeading
            if (heading || TITLE_IDS.any { id.contains(it) }) return true
        }
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            if (hasVpnTitle(child, depth + 1)) return true
        }
        return false
    }

    /** Apps that declare a VPN service. Refreshed every few minutes. */
    private fun vpnApps(): Set<String> {
        val now = SystemClock.elapsedRealtime()
        if (now - vpnAppsLoadedAt > 5 * 60_000 || vpnAppsLoadedAt == 0L) {
            vpnApps = try {
                val intent = Intent("android.net.VpnService")
                val services = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    packageManager.queryIntentServices(intent, PackageManager.ResolveInfoFlags.of(0L))
                } else {
                    @Suppress("DEPRECATION")
                    packageManager.queryIntentServices(intent, 0)
                }
                services.mapNotNull { it.serviceInfo?.packageName }.filter { it != packageName }.toSet()
            } catch (_: RuntimeException) {
                emptySet()
            }
            vpnAppsLoadedAt = now
        }
        return vpnApps
    }

    companion object {
        private const val VPN_DIALOGS = "com.android.vpndialogs"
        private val settingsPackages = setOf("com.android.settings", "com.samsung.android.settings")
        private val TITLE_IDS = listOf("title", "toolbar", "action_bar", "collapsing")

        /** Until when our own app may show Android's VPN consent dialog ("다시 연결"). */
        @Volatile
        private var ownConsentUntil = 0L

        fun allowOwnConsentDialog() {
            ownConsentUntil = SystemClock.elapsedRealtime() + 60_000
        }

        private fun ownConsentAllowed() = SystemClock.elapsedRealtime() < ownConsentUntil

        fun isEnabled(context: Context): Boolean {
            val enabled = Settings.Secure.getString(
                context.contentResolver,
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,
            ) ?: return false
            val me = ComponentName(context, GuardService::class.java)
            return enabled.split(':').any { ComponentName.unflattenFromString(it) == me }
        }

        fun openSettings(context: Context) {
            try {
                context.startActivity(
                    Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                )
            } catch (_: RuntimeException) {
            }
        }

        /** App info page, where Android 13+ hides "제한된 설정 허용" for sideloaded apps. */
        fun openAppInfo(context: Context) {
            try {
                context.startActivity(
                    Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                        .setData(android.net.Uri.fromParts("package", context.packageName, null))
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                )
            } catch (_: RuntimeException) {
            }
        }
    }
}
