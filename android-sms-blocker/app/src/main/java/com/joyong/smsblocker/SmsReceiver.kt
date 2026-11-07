package com.joyong.smsblocker

import android.content.BroadcastReceiver
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.provider.Telephony

/**
 * Fires for EVERY incoming SMS once this app is the default SMS app.
 * When the app is default, the system no longer writes SMS to the provider
 * automatically — we do. So if we simply skip writing a blocked sender's
 * message, it is never stored and therefore never appears anywhere.
 */
class SmsReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_DELIVER_ACTION) return

        val parts = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
        if (parts.isEmpty()) return

        val sender = parts[0].displayOriginatingAddress
            ?: parts[0].originatingAddress
            ?: ""
        val body = parts.joinToString("") { it.messageBody ?: "" }
        val date = parts[0].timestampMillis.takeIf { it > 0 } ?: System.currentTimeMillis()

        if (BlockStore.isBlocked(context, sender)) {
            // Drop it: do NOT write to the SMS provider. Keep a private record
            // so the user can confirm blocking works, without it showing in any inbox.
            BlockStore.logBlocked(context, sender, body, date)
            return
        }

        // Not blocked → store in the inbox so it shows normally.
        val values = ContentValues().apply {
            put(Telephony.Sms.ADDRESS, sender)
            put(Telephony.Sms.BODY, body)
            put(Telephony.Sms.DATE, date)
            put(Telephony.Sms.READ, 0)
            put(Telephony.Sms.SEEN, 0)
        }
        runCatching {
            context.contentResolver.insert(Telephony.Sms.Inbox.CONTENT_URI, values)
        }
        Notifier.notifyNewSms(context, sender, body)
    }
}
