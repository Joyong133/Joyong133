package io.github.joyong133.datalock.core

import io.github.joyong133.datalock.ui.niceMax
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId

class FormatAndStatsTest {

    private val seoul: ZoneId = ZoneId.of("Asia/Seoul")
    private val minute = 60_000L
    private val hour = 60 * minute

    private fun at(text: String): Long = LocalDateTime.parse(text).atZone(seoul).toInstant().toEpochMilli()

    private fun record(start: String, minutes: Long, reason: EndReason = EndReason.HOLD_RELEASE, timer: Boolean = false): SessionRecord {
        val s = at(start)
        return SessionRecord(
            startedAt = s,
            endedAt = s + minutes * minute,
            plannedEnd = if (timer) s + minutes * minute else 0L,
            mode = BlockMode.MOBILE_ONLY,
            reason = reason,
            blockedAttempts = 10,
        )
    }

    @Test
    fun durationsReadNaturally() {
        assertEquals("0초", Format.duration(0))
        assertEquals("45초", Format.duration(45_000))
        assertEquals("1분", Format.duration(minute))
        assertEquals("1시간 30분", Format.duration(90 * minute))
        assertEquals("2시간", Format.duration(2 * hour + 30_000))
    }

    @Test
    fun clocksAndTimerLabels() {
        assertEquals("1:02:03", Format.clock(hour + 2 * minute + 3_000))
        assertEquals("01:05", Format.clock(65_000))
        assertEquals("00:00", Format.clock(-5))
        assertEquals("없음", Format.timer(0))
        assertEquals("1분", Format.timer(1))
        assertEquals("30분", Format.timer(30))
        assertEquals("1시간", Format.timer(60))
        assertEquals("1시간 30분", Format.timer(90))
        assertEquals("8시간", Format.timer(480))
        assertEquals("1,234,567", Format.count(1_234_567))
    }

    @Test
    fun datesAreKorean() {
        assertEquals("11월 28일 (토) 오후 2:05", Format.dateTime(at("2026-11-28T14:05:00"), seoul))
        assertEquals("오전 9:30", Format.timeOfDay(at("2026-11-28T09:30:00"), seoul))
        assertEquals("토", Format.weekday(LocalDate.of(2026, 11, 28)))
        assertEquals("30분", Format.shortHours(30 * minute))
        assertEquals("1시간", Format.shortHours(hour))
        assertEquals("1.5시간", Format.shortHours(90 * minute))
    }

    @Test
    fun sessionsAcrossMidnightCountOnBothDays() {
        val stats = StatsCalculator.compute(
            listOf(record("2026-11-27T23:00:00", 120)),
            now = at("2026-11-28T12:00:00"),
            zone = seoul,
        )
        assertEquals(7, stats.lastWeek.size)
        assertEquals(LocalDate.of(2026, 11, 28), stats.lastWeek.last().date)
        assertEquals(hour, stats.lastWeek[5].ms)
        assertEquals(hour, stats.lastWeek[6].ms)
        assertEquals(hour, stats.todayMs)
        assertEquals(2 * hour, stats.totalMs)
        assertEquals(2, stats.streakDays)
    }

    @Test
    fun streaksSurviveUntilTheDayIsOverAndBreakOnAGap() {
        val records = listOf(
            record("2026-11-27T10:00:00", 30),
            record("2026-11-26T10:00:00", 30),
            record("2026-11-24T10:00:00", 30), // gap on the 25th
        )
        val noSessionToday = StatsCalculator.compute(records, now = at("2026-11-28T08:00:00"), zone = seoul)
        assertEquals(2, noSessionToday.streakDays)

        val brokenYesterday = StatsCalculator.compute(records, now = at("2026-11-29T08:00:00"), zone = seoul)
        assertEquals(0, brokenYesterday.streakDays)
    }

    @Test
    fun timerGoalsAndTotals() {
        val records = listOf(
            record("2026-11-28T09:00:00", 60, EndReason.TIMER_DONE, timer = true),
            record("2026-11-28T11:00:00", 20, EndReason.HOLD_RELEASE, timer = true),
            record("2026-11-28T13:00:00", 15, EndReason.INTERRUPTED),
        )
        val stats = StatsCalculator.compute(records, now = at("2026-11-28T20:00:00"), zone = seoul)
        assertEquals(3, stats.sessions)
        assertEquals(2, stats.timerSessions)
        assertEquals(1, stats.timerCompleted)
        assertEquals(60 * minute, stats.longestMs)
        assertEquals(30L, stats.blockedAttempts)
    }

    @Test
    fun chartAxisUsesCleanMaxima() {
        assertEquals(30 * minute, niceMax(0))
        assertEquals(hour, niceMax(45 * minute))
        assertEquals(2 * hour, niceMax(2 * hour))
        assertEquals(24 * hour, niceMax(30 * hour))
    }
}
