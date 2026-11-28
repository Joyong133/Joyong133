package io.github.joyong133.datalock.core

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import io.github.joyong133.datalock.MainActivity
import io.github.joyong133.datalock.R

object Notifications {
    private const val CHANNEL_STATUS = "status"
    private const val CHANNEL_EVENTS = "events"

    const val ID_ONGOING = 1
    private const val ID_EVENT = 2

    private const val BRAND_COLOR = 0xFF5B4CF0.toInt()

    fun createChannels(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        val status = NotificationChannel(
            CHANNEL_STATUS,
            context.getString(R.string.channel_status),
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = context.getString(R.string.channel_status_desc)
            setShowBadge(false)
        }
        val events = NotificationChannel(
            CHANNEL_EVENTS,
            context.getString(R.string.channel_events),
            NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
            description = context.getString(R.string.channel_events_desc)
        }
        manager.createNotificationChannels(listOf(status, events))
    }

    fun openAppIntent(context: Context): PendingIntent =
        PendingIntent.getActivity(
            context,
            0,
            Intent(context, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )

    /** The persistent notification of the foreground service. It has no "stop" button on purpose. */
    fun ongoing(context: Context, status: BlockStatus): Notification {
        val session = status.session
        val title = when {
            session == null -> context.getString(R.string.app_name)
            status.onWifi && !status.engaged -> "Wi-Fi 사용 중 · 모바일 데이터 감시 중"
            session.mode == BlockMode.ALL_NETWORKS -> "인터넷 전체 차단 중"
            else -> "모바일 데이터 차단 중"
        }
        val text = when {
            session == null -> ""
            status.onWifi && !status.engaged -> "모바일 데이터로 바뀌는 순간 바로 막아요."
            session.hasTimer -> "타이머가 끝나면 자동으로 풀려요. 지금 풀려면 앱에서 버튼을 30초 동안 꾹 누르세요."
            else -> "풀려면 앱에서 버튼을 30초 동안 꾹 누르세요."
        }
        val builder = NotificationCompat.Builder(context, CHANNEL_STATUS)
            .setSmallIcon(R.drawable.ic_stat_lock)
            .setColor(BRAND_COLOR)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setContentIntent(openAppIntent(context))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
        if (session != null) {
            // A live clock: counts down to the timer, or up from the start.
            builder.setShowWhen(true)
                .setUsesChronometer(true)
                .setWhen(if (session.hasTimer) session.endsAt else session.startedAt)
                .setChronometerCountDown(session.hasTimer)
        }
        return builder.build()
    }

    fun updateOngoing(context: Context, status: BlockStatus) {
        post(context, ID_ONGOING, ongoing(context, status))
    }

    fun sessionEnded(context: Context, record: SessionRecord) {
        val (title, text) = when (record.reason) {
            EndReason.TIMER_DONE ->
                "목표 달성! 🎉" to "${Format.duration(record.durationMs)} 동안 잘 참았어요. 이제 데이터가 다시 연결돼요."
            EndReason.INTERRUPTED ->
                "데이터 차단이 풀렸어요" to "VPN 연결이 설정이나 다른 VPN 앱 때문에 끊겼어요. 다시 막으려면 눌러서 앱을 여세요."
            // The user is looking at the app when they finish the 30-second hold.
            EndReason.HOLD_RELEASE -> return
        }
        post(context, ID_EVENT, event(context, title, text))
    }

    fun needsAttention(context: Context) {
        post(
            context,
            ID_EVENT,
            event(context, "데이터 차단을 다시 켜지 못했어요", "눌러서 앱을 열고 VPN 연결을 허용해 주세요."),
        )
    }

    private fun event(context: Context, title: String, text: String): Notification =
        NotificationCompat.Builder(context, CHANNEL_EVENTS)
            .setSmallIcon(R.drawable.ic_stat_lock)
            .setColor(BRAND_COLOR)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setContentIntent(openAppIntent(context))
            .setAutoCancel(true)
            .build()

    private fun post(context: Context, id: Int, notification: Notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        try {
            NotificationManagerCompat.from(context).notify(id, notification)
        } catch (_: SecurityException) {
            // Notifications were turned off in the meantime.
        }
    }
}
