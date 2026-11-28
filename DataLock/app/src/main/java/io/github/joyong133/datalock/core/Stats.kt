package io.github.joyong133.datalock.core

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlin.math.min

data class DayTotal(val date: LocalDate, val ms: Long)

data class Stats(
    val totalMs: Long,
    val sessions: Int,
    val longestMs: Long,
    val todayMs: Long,
    /** Days in a row (up to today) with at least a minute of blocking. */
    val streakDays: Int,
    val timerSessions: Int,
    val timerCompleted: Int,
    val blockedAttempts: Long,
    /** The last seven days, oldest first, ending today. */
    val lastWeek: List<DayTotal>,
)

object StatsCalculator {
    private const val STREAK_MIN_MS = 60_000L

    fun compute(records: List<SessionRecord>, now: Long, zone: ZoneId = ZoneId.systemDefault()): Stats {
        val perDay = HashMap<LocalDate, Long>()
        for (record in records) {
            splitByDay(record.startedAt, record.endedAt, zone) { date, ms ->
                perDay[date] = (perDay[date] ?: 0L) + ms
            }
        }
        val today = Instant.ofEpochMilli(now).atZone(zone).toLocalDate()
        val lastWeek = (6 downTo 0).map { back ->
            val date = today.minusDays(back.toLong())
            DayTotal(date, perDay[date] ?: 0L)
        }

        // A streak survives until the end of today even if today has no session yet.
        var day = if ((perDay[today] ?: 0L) >= STREAK_MIN_MS) today else today.minusDays(1)
        var streak = 0
        while ((perDay[day] ?: 0L) >= STREAK_MIN_MS) {
            streak++
            day = day.minusDays(1)
        }

        val timed = records.filter { it.plannedEnd > 0 }
        return Stats(
            totalMs = records.sumOf { it.durationMs },
            sessions = records.size,
            longestMs = records.maxOfOrNull { it.durationMs } ?: 0L,
            todayMs = perDay[today] ?: 0L,
            streakDays = streak,
            timerSessions = timed.size,
            timerCompleted = timed.count { it.reason == EndReason.TIMER_DONE },
            blockedAttempts = records.sumOf { it.blockedAttempts },
            lastWeek = lastWeek,
        )
    }

    /** Splits the interval [start, end) at local midnights. */
    internal inline fun splitByDay(start: Long, end: Long, zone: ZoneId, add: (LocalDate, Long) -> Unit) {
        var cursor = start
        while (cursor < end) {
            val date = Instant.ofEpochMilli(cursor).atZone(zone).toLocalDate()
            val nextMidnight = date.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli()
            val sliceEnd = min(end, nextMidnight)
            add(date, sliceEnd - cursor)
            cursor = sliceEnd
        }
    }
}
