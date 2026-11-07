package com.joyong.smsblocker

import android.Manifest
import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.app.role.RoleManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.CallLog
import android.telecom.Call
import android.telecom.CallScreeningService
import android.telecom.TelecomManager
import androidx.core.content.ContextCompat

/** Role + permission helpers for call blocking (Android 10+). */
object CallBlock {
    fun supported(): Boolean = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q

    fun roleHeld(ctx: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return false
        val rm = ctx.getSystemService(RoleManager::class.java) ?: return false
        return rm.isRoleHeld(RoleManager.ROLE_CALL_SCREENING)
    }

    fun roleRequestIntent(ctx: Context): Intent? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return null
        val rm = ctx.getSystemService(RoleManager::class.java) ?: return null
        if (!rm.isRoleAvailable(RoleManager.ROLE_CALL_SCREENING)) return null
        return rm.createRequestRoleIntent(RoleManager.ROLE_CALL_SCREENING)
    }

    val LOG_PERMISSIONS = arrayOf(Manifest.permission.READ_CALL_LOG, Manifest.permission.WRITE_CALL_LOG)

    fun logPermsGranted(ctx: Context): Boolean = LOG_PERMISSIONS.all {
        ContextCompat.checkSelfPermission(ctx, it) == PackageManager.PERMISSION_GRANTED
    }
}

/**
 * The system asks this service about every incoming call before it rings.
 * Blocked numbers are rejected silently: no ringing, no notification, and we
 * ask Telecom not to log them. Telecom may still log them as "blocked", so
 * CallLogCleaner removes those entries from the call log shortly after.
 */
class CallBlockService : CallScreeningService() {

    override fun onScreenCall(details: Call.Details) {
        val incoming = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q ||
            details.callDirection == Call.Details.DIRECTION_INCOMING

        val number = details.handle?.schemeSpecificPart.orEmpty().trim()
        val hidden = number.isEmpty() ||
            details.handlePresentation != TelecomManager.PRESENTATION_ALLOWED

        val block = incoming && if (hidden) {
            BlockStore.blockHidden(this)
        } else {
            BlockStore.isBlocked(this, number)
        }

        val response = if (block) {
            CallResponse.Builder()
                .setDisallowCall(true)
                .setRejectCall(true)
                .setSkipCallLog(true)
                .setSkipNotification(true)
                .build()
        } else {
            CallResponse.Builder().build()
        }
        respondToCall(details, response)

        if (block) CallLogCleaner.schedule(this)
    }
}

/** Deletes blocked callers' entries from the system call log ("최근 기록"). */
object CallLogCleaner {
    private val NEVER_CONNECTED = setOf(
        CallLog.Calls.MISSED_TYPE,
        CallLog.Calls.REJECTED_TYPE,
        CallLog.Calls.BLOCKED_TYPE
    )

    /** Run a cleanup a few seconds after a blocked call, once the system has written its log entry. */
    fun schedule(ctx: Context) {
        val js = ctx.getSystemService(JobScheduler::class.java) ?: return
        val component = ComponentName(ctx, CallLogCleanJob::class.java)
        for ((id, delay) in listOf(7101 to 3_000L, 7102 to 20_000L)) {
            runCatching {
                js.schedule(
                    JobInfo.Builder(id, component)
                        .setMinimumLatency(delay)
                        .setOverrideDeadline(delay + 10_000L)
                        .build()
                )
            }
        }
    }

    fun cleanAsync(ctx: Context) {
        val app = ctx.applicationContext
        Thread { clean(app) }.start()
    }

    /**
     * Remove never-connected calls (missed / rejected / blocked) from blocked
     * numbers — and from hidden numbers, if that option is on. Calls the user
     * actually talked on, and outgoing calls, are left alone.
     */
    fun clean(ctx: Context): Int {
        if (!CallBlock.logPermsGranted(ctx)) return 0
        val blockHidden = BlockStore.blockHidden(ctx)
        val ids = mutableListOf<Long>()
        runCatching {
            ctx.contentResolver.query(
                CallLog.Calls.CONTENT_URI,
                arrayOf(
                    CallLog.Calls._ID, CallLog.Calls.NUMBER,
                    CallLog.Calls.TYPE, CallLog.Calls.NUMBER_PRESENTATION
                ),
                null, null, null
            )?.use { c ->
                val iI = c.getColumnIndexOrThrow(CallLog.Calls._ID)
                val iN = c.getColumnIndexOrThrow(CallLog.Calls.NUMBER)
                val iT = c.getColumnIndexOrThrow(CallLog.Calls.TYPE)
                val iP = c.getColumnIndexOrThrow(CallLog.Calls.NUMBER_PRESENTATION)
                while (c.moveToNext()) {
                    val type = c.getInt(iT)
                    if (type !in NEVER_CONNECTED) continue
                    val number = c.getString(iN).orEmpty()
                    val isHidden = number.isBlank() ||
                        c.getInt(iP) != CallLog.Calls.PRESENTATION_ALLOWED
                    val remove = if (isHidden) {
                        // Only the ones we rejected; earlier missed hidden calls stay.
                        blockHidden && type != CallLog.Calls.MISSED_TYPE
                    } else {
                        BlockStore.isBlocked(ctx, number)
                    }
                    if (remove) ids.add(c.getLong(iI))
                }
            }
        }
        var removed = 0
        for (id in ids) {
            removed += runCatching {
                ctx.contentResolver.delete(
                    CallLog.Calls.CONTENT_URI, "${CallLog.Calls._ID}=?", arrayOf(id.toString())
                )
            }.getOrDefault(0)
        }
        return removed
    }
}

class CallLogCleanJob : JobService() {
    override fun onStartJob(params: JobParameters): Boolean {
        Thread {
            CallLogCleaner.clean(applicationContext)
            jobFinished(params, false)
        }.start()
        return true
    }

    override fun onStopJob(params: JobParameters): Boolean = false
}
