package com.joyong.smsblocker

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.TaskStackBuilder
import androidx.core.content.ContextCompat

object Notifier {
    private const val CHANNEL_ID = "incoming_sms"

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

        val title = SmsRepo.contactName(ctx, sender) ?: sender.ifEmpty { "새 문자" }
        val open = TaskStackBuilder.create(ctx)
            .addNextIntentWithParentStack(ConversationActivity.intent(ctx, sender))
            .getPendingIntent(
                idFor(sender),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )

        val n = NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_message)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(open)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()
        runCatching { NotificationManagerCompat.from(ctx).notify(idFor(sender), n) }
    }

    fun cancel(ctx: Context, address: String) {
        runCatching { NotificationManagerCompat.from(ctx).cancel(idFor(address)) }
    }
}
