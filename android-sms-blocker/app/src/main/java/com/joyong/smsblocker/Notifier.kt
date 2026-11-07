package com.joyong.smsblocker

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.RemoteInput
import androidx.core.app.TaskStackBuilder
import androidx.core.content.ContextCompat

object Notifier {
    private const val CHANNEL_ID = "incoming_sms"
    const val ACTION_REPLY = "com.joyong.smsblocker.action.REPLY"
    const val ACTION_MARK_READ = "com.joyong.smsblocker.action.MARK_READ"
    const val EXTRA_ADDRESS = "address"
    const val KEY_REPLY = "reply_text"

    /** One notification per sender. */
    fun idFor(address: String): Int {
        val digits = BlockStore.normalize(address)
        return (if (digits.isNotEmpty()) digits.takeLast(10) else address.trim().lowercase()).hashCode()
    }

    fun notifyNewSms(ctx: Context, sender: String, body: String) {
        // Already looking at this conversation: the screen updates itself.
        val visible = ConversationActivity.visibleAddress
        if (visible != null && idFor(visible) == idFor(sender)) return

        val nm = ctx.getSystemService(NotificationManager::class.java) ?: return
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "새 문자", NotificationManager.IMPORTANCE_HIGH)
        )
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED
        ) return

        val id = idFor(sender)
        val title = SmsRepo.contactName(ctx, sender) ?: sender.ifEmpty { "새 문자" }

        val open = TaskStackBuilder.create(ctx)
            .addNextIntentWithParentStack(ConversationActivity.intent(ctx, sender))
            .getPendingIntent(id, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

        // Reply straight from the notification. RemoteInput needs a mutable
        // PendingIntent; it is explicit (our own receiver) so that is safe.
        val replyPi = PendingIntent.getBroadcast(
            ctx, id,
            Intent(ctx, NotificationActionReceiver::class.java)
                .setAction(ACTION_REPLY)
                .putExtra(EXTRA_ADDRESS, sender),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        )
        val replyAction = NotificationCompat.Action.Builder(R.drawable.ic_send, "답장", replyPi)
            .addRemoteInput(RemoteInput.Builder(KEY_REPLY).setLabel("답장 입력").build())
            .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_REPLY)
            .setShowsUserInterface(false)
            .build()

        val readPi = PendingIntent.getBroadcast(
            ctx, id,
            Intent(ctx, NotificationActionReceiver::class.java)
                .setAction(ACTION_MARK_READ)
                .putExtra(EXTRA_ADDRESS, sender),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val readAction = NotificationCompat.Action.Builder(R.drawable.ic_stat_message, "읽음", readPi)
            .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_MARK_AS_READ)
            .setShowsUserInterface(false)
            .build()

        val n = NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_message)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(open)
            .addAction(replyAction)
            .addAction(readAction)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()
        runCatching { NotificationManagerCompat.from(ctx).notify(id, n) }
    }

    fun cancel(ctx: Context, address: String) {
        runCatching { NotificationManagerCompat.from(ctx).cancel(idFor(address)) }
    }
}

/** Handles the notification's 답장 / 읽음 buttons. */
class NotificationActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val address = intent.getStringExtra(Notifier.EXTRA_ADDRESS) ?: return
        val app = context.applicationContext
        val replyText = RemoteInput.getResultsFromIntent(intent)
            ?.getCharSequence(Notifier.KEY_REPLY)?.toString()?.trim().orEmpty()
        val action = intent.action
        val pending = goAsync()
        Thread {
            try {
                if (action == Notifier.ACTION_REPLY && replyText.isNotEmpty() && Ui.isDefaultSmsApp(app)) {
                    SmsSender.send(app, address, replyText)
                }
                if (action == Notifier.ACTION_REPLY || action == Notifier.ACTION_MARK_READ) {
                    SmsRepo.markRead(app, SmsRepo.threadIdFor(app, address))
                }
                Notifier.cancel(app, address)
            } finally {
                pending.finish()
            }
        }.start()
    }
}
