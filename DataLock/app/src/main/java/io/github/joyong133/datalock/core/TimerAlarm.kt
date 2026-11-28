package io.github.joyong133.datalock.core

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import io.github.joyong133.datalock.receiver.TimerReceiver

/** Wakes the phone when an auto-unlock timer ends, even in Doze. */
object TimerAlarm {
    private const val REQUEST_CODE = 41

    fun schedule(context: Context, at: Long) {
        val alarms = context.getSystemService(AlarmManager::class.java) ?: return
        val operation = pendingIntent(context, PendingIntent.FLAG_UPDATE_CURRENT) ?: return
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarms.canScheduleExactAlarms()) {
            try {
                alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, operation)
                return
            } catch (_: SecurityException) {
                // Exact alarms were revoked; an inexact one is still better than nothing.
            }
        }
        alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, operation)
    }

    fun cancel(context: Context) {
        val operation = pendingIntent(context, PendingIntent.FLAG_NO_CREATE) ?: return
        context.getSystemService(AlarmManager::class.java)?.cancel(operation)
        operation.cancel()
    }

    private fun pendingIntent(context: Context, flags: Int): PendingIntent? =
        PendingIntent.getBroadcast(
            context,
            REQUEST_CODE,
            Intent(context, TimerReceiver::class.java),
            flags or PendingIntent.FLAG_IMMUTABLE,
        )
}
