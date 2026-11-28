package io.github.joyong133.datalock.core

import java.text.NumberFormat
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/** Korean text for durations, clocks and dates. */
object Format {
    private val korean: Locale = Locale.KOREAN

    /** "1시간 20분", "45분", "30초". */
    fun duration(ms: Long): String {
        val totalSeconds = (ms / 1000).coerceAtLeast(0)
        val hours = totalSeconds / 3600
        val minutes = (totalSeconds % 3600) / 60
        val seconds = totalSeconds % 60
        return when {
            hours > 0 && minutes > 0 -> "${hours}시간 ${minutes}분"
            hours > 0 -> "${hours}시간"
            minutes > 0 -> "${minutes}분"
            else -> "${seconds}초"
        }
    }

    /** "1:02:03" or "02:03". */
    fun clock(ms: Long): String {
        val totalSeconds = (ms / 1000).coerceAtLeast(0)
        val hours = totalSeconds / 3600
        val minutes = (totalSeconds % 3600) / 60
        val seconds = totalSeconds % 60
        return if (hours > 0) {
            String.format(Locale.ROOT, "%d:%02d:%02d", hours, minutes, seconds)
        } else {
            String.format(Locale.ROOT, "%02d:%02d", minutes, seconds)
        }
    }

    /** Chip label for a timer length: "없음", "30분", "2시간", "1시간 30분". */
    fun timer(minutes: Int): String = when {
        minutes <= 0 -> "없음"
        minutes % 60 == 0 -> "${minutes / 60}시간"
        minutes > 60 -> "${minutes / 60}시간 ${minutes % 60}분"
        else -> "${minutes}분"
    }

    /** "1,234". */
    fun count(value: Long): String = NumberFormat.getIntegerInstance(Locale.KOREA).format(value)

    /** "11월 28일 (토) 오후 2:05". */
    fun dateTime(epochMs: Long, zone: ZoneId = ZoneId.systemDefault()): String =
        DateTimeFormatter.ofPattern("M월 d일 (E) a h:mm", korean)
            .format(Instant.ofEpochMilli(epochMs).atZone(zone))

    /** "오후 2:05". */
    fun timeOfDay(epochMs: Long, zone: ZoneId = ZoneId.systemDefault()): String =
        DateTimeFormatter.ofPattern("a h:mm", korean)
            .format(Instant.ofEpochMilli(epochMs).atZone(zone))

    /** One-letter weekday: "월". */
    fun weekday(date: java.time.LocalDate): String =
        DateTimeFormatter.ofPattern("E", korean).format(date)

    /** Compact hours for a chart axis: "2시간", "1.5시간", "40분". */
    fun shortHours(ms: Long): String {
        val minutes = ms / 60_000
        return when {
            minutes < 60 -> "${minutes}분"
            minutes % 60 == 0L -> "${minutes / 60}시간"
            else -> String.format(Locale.ROOT, "%.1f시간", minutes / 60.0)
        }
    }
}
