package io.github.joyong133.datalock.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import io.github.joyong133.datalock.core.BlockController
import io.github.joyong133.datalock.core.BlockState
import io.github.joyong133.datalock.core.Notifications
import io.github.joyong133.datalock.core.Store

/** Turning the phone off and on again (or updating the app) does not end a session. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        if (action != Intent.ACTION_BOOT_COMPLETED && action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        if (Store.get(context).activeSession() == null) return
        if (!BlockController.resume(context) && BlockState.status.value.needsPermission) {
            Notifications.needsAttention(context)
        }
    }
}
