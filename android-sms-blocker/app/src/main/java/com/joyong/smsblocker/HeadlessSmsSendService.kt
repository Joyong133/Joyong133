package com.joyong.smsblocker

import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.telephony.TelephonyManager

/**
 * "Respond via message": when you decline a call with a quick text
 * ("지금 통화할 수 없어요" etc.), the phone app asks the default SMS app to send it.
 */
class HeadlessSmsSendService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == TelephonyManager.ACTION_RESPOND_VIA_MESSAGE) {
            val address = intent.data?.schemeSpecificPart.orEmpty()
                .substringBefore('?').split(',', ';').firstOrNull().orEmpty().trim()
            val text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()?.trim().orEmpty()
            if (address.isNotEmpty() && text.isNotEmpty() && Ui.isDefaultSmsApp(this)) {
                val app = applicationContext
                Thread {
                    SmsSender.send(app, address, text)
                    stopSelf(startId)
                }.start()
                return START_NOT_STICKY
            }
        }
        stopSelf(startId)
        return START_NOT_STICKY
    }
}
