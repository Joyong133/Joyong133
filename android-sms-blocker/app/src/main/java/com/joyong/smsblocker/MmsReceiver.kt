package com.joyong.smsblocker

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Required so the app can hold the default-SMS-app role. This build focuses on
 * SMS (text) messages; MMS (picture messages) are not downloaded or displayed.
 */
class MmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        // Intentionally no-op.
    }
}
