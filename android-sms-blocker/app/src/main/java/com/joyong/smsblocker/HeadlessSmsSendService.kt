package com.joyong.smsblocker

import android.app.Service
import android.content.Intent
import android.os.IBinder

/**
 * Required for the default-SMS-app role ("respond via message" during a call).
 * Minimal stub — it does not send quick replies.
 */
class HeadlessSmsSendService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        stopSelf(startId)
        return START_NOT_STICKY
    }
}
