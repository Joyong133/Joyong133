package io.github.joyong133.datalock.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import io.github.joyong133.datalock.core.BlockController
import io.github.joyong133.datalock.core.BlockState
import io.github.joyong133.datalock.core.EndReason
import io.github.joyong133.datalock.core.Store
import io.github.joyong133.datalock.core.TimerAlarm

/** The auto-unlock alarm. Ends the session, or re-arms itself if it fired early. */
class TimerReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val session = BlockState.status.value.session ?: Store.get(context).activeSession() ?: return
        if (!session.hasTimer) return
        val now = System.currentTimeMillis()
        if (now + EARLY_TOLERANCE_MS >= session.endsAt) {
            BlockController.finishSession(context, EndReason.TIMER_DONE, endedAt = maxOf(now, session.endsAt))
        } else {
            TimerAlarm.schedule(context, session.endsAt)
        }
    }

    private companion object {
        const val EARLY_TOLERANCE_MS = 1_000L
    }
}
