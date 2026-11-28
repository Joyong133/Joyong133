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
import io.github.joyong133.datalock.R
import io.github.joyong133.datalock.admin.DeviceAdmin
import io.github.joyong133.datalock.core.BlockState

/**
 * "차단 지킴이": an accessibility service the user turns on themselves. While (and only while)
 * a blocking session runs, it closes the screens that would switch the block off:
 *
 * - the VPN page of the Settings app,
 * - this app's own accessibility (차단 지킴이) toggle page, so the guard can't be turned off
 *   mid-session (only this app's page — other apps' accessibility pages are left alone),
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

        // Uninstall-related screens are only guarded when the user turned on 삭제 방지 (device
        // admin). Then, during a session, they can't uninstall or deactivate the admin.
        val guardUninstall = DeviceAdmin.isActive(this)

        val reason = when {
            pkg == VPN_DIALOGS -> if (ownConsentAllowed()) null else "VPN 연결을 바꾸는 창은 차단 중에 열 수 없어요"
            pkg in settingsPackages && isOwnAccessibilityPage() -> "차단 중에는 차단 지킴이를 끌 수 없어요"
            pkg in settingsPackages && isVpnSettings(event) -> "차단 중에는 VPN 설정을 열 수 없어요"
            pkg !in session.allowedPackages && pkg in vpnApps() -> "차단 중에는 다른 VPN 앱을 쓸 수 없어요"
            guardUninstall && pkg in installerPackages && isUninstallingOwnApp() -> "차단 중에는 이 앱을 삭제할 수 없어요"
            guardUninstall && pkg in settingsPackages && isOwnDeviceAdminPage() -> "차단 중에는 이 앱의 기기 관리자를 끌 수 없어요"
            guardUninstall && pkg in settingsPackages && isOwnAppInfoPage() -> "차단 중에는 이 앱 정보를 열 수 없어요"
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
        return withTitle { hasTitle(it, depth = 0) { text -> text.equals("VPN", ignoreCase = true) } }
    }

    /**
     * The detail page for THIS app's accessibility service (the big on/off switch), not the
     * accessibility list that also leads to every other app. We match our own label as the page
     * title, so only our own toggle page is closed — other apps' pages are left alone.
     */
    private fun isOwnAccessibilityPage(): Boolean {
        val label = getString(R.string.guard_label).trim()
        return withTitle { hasTitle(it, depth = 0) { text -> text == label } }
    }

    /**
     * The device-admin detail page for THIS app (its deactivate button), matched by this app's
     * own admin label as the title. The generic admin list, where other apps' admins are managed,
     * is not matched, so only this app's admin is protected.
     */
    private fun isOwnDeviceAdminPage(): Boolean {
        val label = getString(R.string.admin_label).trim()
        return withTitle { node -> hasTitle(node, 0) { it == label } }
    }

    /**
     * True only when the uninstall dialog on screen is uninstalling THIS app. The dialog shows the
     * target app's label, so other apps' uninstall dialogs don't contain our name and are left
     * alone. (Device admin already blocks only this app's uninstall; this just matches it.)
     */
    private fun isUninstallingOwnApp(): Boolean {
        val root = rootInActiveWindow ?: return false
        val appName = getString(R.string.app_name).trim()
        return try {
            root.findAccessibilityNodeInfosByText(appName).isNotEmpty()
        } catch (_: RuntimeException) {
            false
        } finally {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
                @Suppress("DEPRECATION")
                root.recycle()
            }
        }
    }

    /** This app's own entry on the App info page, where the uninstall button lives. */
    private fun isOwnAppInfoPage(): Boolean {
        val appName = getString(R.string.app_name).trim()
        return withTitle { node -> hasTitle(node, 0) { it == appName } }
    }

    private inline fun withTitle(check: (AccessibilityNodeInfo) -> Boolean): Boolean {
        val root = rootInActiveWindow ?: return false
        return try {
            check(root)
        } finally {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
                @Suppress("DEPRECATION")
                root.recycle()
            }
        }
    }

    /** A toolbar / collapsing / heading title matching [match], not a plain list row. */
    private fun hasTitle(node: AccessibilityNodeInfo, depth: Int, match: (String) -> Boolean): Boolean {
        if (depth > 14) return false
        val text = node.text?.toString()?.trim()
        if (text != null && match(text)) {
            val id = node.viewIdResourceName.orEmpty().lowercase()
            val heading = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && node.isHeading
            if (heading || TITLE_IDS.any { id.contains(it) }) return true
        }
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            if (hasTitle(child, depth + 1, match)) return true
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
        private val installerPackages = setOf(
            "com.android.packageinstaller",
            "com.google.android.packageinstaller",
            "com.miui.packageinstaller",
            "com.samsung.android.packageinstaller",
        )
        private val TITLE_IDS = listOf("toolbar", "action_bar", "collapsing")

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
