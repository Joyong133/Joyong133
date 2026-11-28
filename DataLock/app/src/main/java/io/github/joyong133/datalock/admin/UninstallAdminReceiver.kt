package io.github.joyong133.datalock.admin

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent

/**
 * A device-administrator receiver. While this admin is active, Android refuses to uninstall the
 * app — that is the whole point. It takes no other power: the policy set is empty. The user turns
 * it on themselves in a system dialog and can turn it off in Settings at any time.
 */
class UninstallAdminReceiver : DeviceAdminReceiver() {
    override fun onDisableRequested(context: Context, intent: Intent): CharSequence =
        "끄면 데이터 잠금을 삭제할 수 있게 돼요. 차단 중이라면 그대로 두는 게 좋아요."
}
