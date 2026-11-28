package io.github.joyong133.datalock.admin

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent

/** Thin wrapper over the device-admin API used only to block (and unblock) uninstalling. */
object DeviceAdmin {

    fun component(context: Context) = ComponentName(context, UninstallAdminReceiver::class.java)

    private fun manager(context: Context): DevicePolicyManager? =
        context.getSystemService(DevicePolicyManager::class.java)

    fun isActive(context: Context): Boolean =
        manager(context)?.isAdminActive(component(context)) == true

    /** The system consent screen. The user must approve it; it can't be granted silently. */
    fun requestIntent(context: Context): Intent =
        Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN)
            .putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, component(context))
            .putExtra(
                DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                "켜 두면 차단이 끝날 때까지 데이터 잠금을 삭제할 수 없어요. 언제든 이 화면에서 다시 끌 수 있어요.",
            )

    fun remove(context: Context) {
        val manager = manager(context) ?: return
        if (manager.isAdminActive(component(context))) {
            manager.removeActiveAdmin(component(context))
        }
    }
}
