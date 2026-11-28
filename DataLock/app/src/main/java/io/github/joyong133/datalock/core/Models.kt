package io.github.joyong133.datalock.core

/** What gets cut off while a session runs. */
enum class BlockMode {
    /** Only the phone's own mobile data; Wi-Fi keeps working. */
    MOBILE_ONLY,

    /** Every network, Wi-Fi included. */
    ALL_NETWORKS,
}

/** Why a session ended. */
enum class EndReason {
    /** The auto-unlock timer ran out. */
    TIMER_DONE,

    /** The user held the release button for the full 30 seconds. */
    HOLD_RELEASE,

    /** The VPN was disconnected from system settings or taken over by another VPN app. */
    INTERRUPTED,
}

/** Choices the user makes before pressing start. */
data class Settings(
    val mode: BlockMode = BlockMode.MOBILE_ONLY,
    val timerMinutes: Int = 0,
    val allowedPackages: Set<String> = emptySet(),
    /** How long the release button must be held: 30 or 60 seconds. */
    val holdSeconds: Int = DEFAULT_HOLD_SECONDS,
    /** The user opted in to blocking uninstall (via device admin) while blocking. */
    val preventUninstall: Boolean = false,
)

const val DEFAULT_HOLD_SECONDS = 30
val HOLD_CHOICES = listOf(30, 60)

/** A running session. It is persisted, so it survives reboots and the app being killed. */
data class ActiveSession(
    val startedAt: Long,
    /** Wall-clock time the timer ends, or 0 when the session only ends with the 30-second hold. */
    val endsAt: Long,
    val mode: BlockMode,
    val allowedPackages: Set<String>,
    /** Fixed when the session starts, so it can't be shortened mid-session. */
    val holdSeconds: Int = DEFAULT_HOLD_SECONDS,
) {
    val hasTimer: Boolean get() = endsAt > 0
}

/** A finished session, shown in the history screen. */
data class SessionRecord(
    val startedAt: Long,
    val endedAt: Long,
    /** The timer's end time, or 0 when no timer was set. */
    val plannedEnd: Long,
    val mode: BlockMode,
    val reason: EndReason,
    val blockedAttempts: Long,
) {
    val durationMs: Long get() = (endedAt - startedAt).coerceAtLeast(0)
}
