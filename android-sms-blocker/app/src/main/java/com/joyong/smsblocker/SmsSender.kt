package com.joyong.smsblocker

import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Telephony
import android.telephony.SmsManager

object SmsSender {
    private const val ACTION_SENT = "com.joyong.smsblocker.SMS_SENT"
    const val EXTRA_LAST = "last_part"

    /**
     * As the default SMS app we must record outgoing messages ourselves:
     * store in Outbox, send, then SmsSentReceiver flips it to Sent / Failed.
     */
    fun send(ctx: Context, address: String, body: String): Boolean {
        val uri = SmsRepo.insertOutgoing(ctx, address, body) ?: return false
        val sm: SmsManager = if (Build.VERSION.SDK_INT >= 31) {
            ctx.getSystemService(SmsManager::class.java) ?: @Suppress("DEPRECATION") SmsManager.getDefault()
        } else {
            @Suppress("DEPRECATION") SmsManager.getDefault()
        }
        return runCatching {
            val parts = sm.divideMessage(body)
            val sentIntents = ArrayList<PendingIntent>()
            for (i in parts.indices) {
                val intent = Intent(ctx, SmsSentReceiver::class.java)
                    .setAction(ACTION_SENT)
                    .setData(uri)
                    .putExtra(EXTRA_LAST, i == parts.size - 1)
                sentIntents.add(
                    PendingIntent.getBroadcast(
                        ctx, i, intent,
                        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
                    )
                )
            }
            if (parts.size > 1) {
                sm.sendMultipartTextMessage(address, null, parts, sentIntents, null)
            } else {
                sm.sendTextMessage(address, null, body, sentIntents[0], null)
            }
            true
        }.getOrElse {
            SmsRepo.setType(ctx, uri, Telephony.Sms.MESSAGE_TYPE_FAILED)
            false
        }
    }
}

class SmsSentReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val uri = intent.data ?: return
        if (resultCode == Activity.RESULT_OK) {
            if (intent.getBooleanExtra(SmsSender.EXTRA_LAST, true)) {
                // Don't overwrite a failure reported by an earlier part.
                SmsRepo.setType(
                    context, uri, Telephony.Sms.MESSAGE_TYPE_SENT,
                    onlyFromType = Telephony.Sms.MESSAGE_TYPE_OUTBOX
                )
            }
        } else {
            SmsRepo.setType(context, uri, Telephony.Sms.MESSAGE_TYPE_FAILED)
        }
    }
}
