package io.github.joyong133.datalock.core

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

/** Everything the app remembers: settings, the running session and the history. */
class Store private constructor(context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences("datalock", Context.MODE_PRIVATE)

    private val _settings = MutableStateFlow(readSettings())
    val settings: StateFlow<Settings> = _settings.asStateFlow()

    private val _history = MutableStateFlow(decodeHistory(prefs.getString(K_HISTORY, null)))
    val history: StateFlow<List<SessionRecord>> = _history.asStateFlow()

    fun updateSettings(transform: (Settings) -> Settings) {
        val next = transform(_settings.value)
        _settings.value = next
        prefs.edit {
            putString(K_MODE, next.mode.name)
            putInt(K_TIMER, next.timerMinutes)
            putStringSet(K_ALLOWED, HashSet(next.allowedPackages))
            putInt(K_HOLD, next.holdSeconds)
            putBoolean(K_PREVENT_UNINSTALL, next.preventUninstall)
        }
    }

    fun activeSession(): ActiveSession? {
        if (!prefs.getBoolean(K_ACTIVE, false)) return null
        return ActiveSession(
            startedAt = prefs.getLong(K_S_START, 0L),
            endsAt = prefs.getLong(K_S_END, 0L),
            mode = enumOr(prefs.getString(K_S_MODE, null), BlockMode.MOBILE_ONLY),
            allowedPackages = prefs.getStringSet(K_S_ALLOWED, null)?.toSet().orEmpty(),
            holdSeconds = holdOrDefault(prefs.getInt(K_S_HOLD, DEFAULT_HOLD_SECONDS)),
        )
    }

    /** Written synchronously: a session must not be lost if the process dies right after. */
    fun saveActiveSession(session: ActiveSession) {
        prefs.edit(commit = true) {
            putBoolean(K_ACTIVE, true)
            putLong(K_S_START, session.startedAt)
            putLong(K_S_END, session.endsAt)
            putString(K_S_MODE, session.mode.name)
            putStringSet(K_S_ALLOWED, HashSet(session.allowedPackages))
            putInt(K_S_HOLD, session.holdSeconds)
            putLong(K_S_BLOCKED, 0L)
        }
    }

    fun clearActiveSession() {
        prefs.edit(commit = true) {
            putBoolean(K_ACTIVE, false)
            remove(K_S_START)
            remove(K_S_END)
            remove(K_S_MODE)
            remove(K_S_ALLOWED)
            remove(K_S_HOLD)
            remove(K_S_BLOCKED)
        }
    }

    var sessionBlockedCount: Long
        get() = prefs.getLong(K_S_BLOCKED, 0L)
        set(value) = prefs.edit { putLong(K_S_BLOCKED, value) }

    fun addRecord(record: SessionRecord) {
        val next = (listOf(record) + _history.value).take(MAX_HISTORY)
        _history.value = next
        prefs.edit { putString(K_HISTORY, encodeHistory(next)) }
    }

    fun clearHistory() {
        _history.value = emptyList()
        prefs.edit { remove(K_HISTORY) }
    }

    var vpnIntroSeen: Boolean
        get() = prefs.getBoolean(K_INTRO, false)
        set(value) = prefs.edit { putBoolean(K_INTRO, value) }

    var askedNotificationPermission: Boolean
        get() = prefs.getBoolean(K_ASKED_NOTIF, false)
        set(value) = prefs.edit { putBoolean(K_ASKED_NOTIF, value) }

    private fun readSettings() = Settings(
        mode = enumOr(prefs.getString(K_MODE, null), BlockMode.MOBILE_ONLY),
        timerMinutes = prefs.getInt(K_TIMER, 0).coerceAtLeast(0),
        allowedPackages = prefs.getStringSet(K_ALLOWED, null)?.toSet().orEmpty(),
        holdSeconds = holdOrDefault(prefs.getInt(K_HOLD, DEFAULT_HOLD_SECONDS)),
        preventUninstall = prefs.getBoolean(K_PREVENT_UNINSTALL, false),
    )

    companion object {
        private const val MAX_HISTORY = 300

        private const val K_MODE = "mode"
        private const val K_TIMER = "timer_minutes"
        private const val K_ALLOWED = "allowed_packages"
        private const val K_HOLD = "hold_seconds"
        private const val K_PREVENT_UNINSTALL = "prevent_uninstall"
        private const val K_S_HOLD = "session_hold_seconds"

        private fun holdOrDefault(value: Int) = if (value in HOLD_CHOICES) value else DEFAULT_HOLD_SECONDS
        private const val K_ACTIVE = "session_active"
        private const val K_S_START = "session_start"
        private const val K_S_END = "session_end"
        private const val K_S_MODE = "session_mode"
        private const val K_S_ALLOWED = "session_allowed"
        private const val K_S_BLOCKED = "session_blocked"
        private const val K_HISTORY = "history"
        private const val K_INTRO = "vpn_intro_seen"
        private const val K_ASKED_NOTIF = "asked_notification_permission"

        @Volatile
        private var instance: Store? = null

        fun get(context: Context): Store =
            instance ?: synchronized(this) {
                instance ?: Store(context.applicationContext).also { instance = it }
            }

        private inline fun <reified T : Enum<T>> enumOr(name: String?, fallback: T): T =
            enumValues<T>().firstOrNull { it.name == name } ?: fallback

        private fun encodeHistory(records: List<SessionRecord>): String {
            val array = JSONArray()
            for (r in records) {
                array.put(
                    JSONObject()
                        .put("s", r.startedAt)
                        .put("e", r.endedAt)
                        .put("p", r.plannedEnd)
                        .put("m", r.mode.name)
                        .put("r", r.reason.name)
                        .put("b", r.blockedAttempts),
                )
            }
            return array.toString()
        }

        private fun decodeHistory(json: String?): List<SessionRecord> {
            if (json.isNullOrEmpty()) return emptyList()
            return try {
                val array = JSONArray(json)
                List(array.length()) { i ->
                    val o = array.getJSONObject(i)
                    SessionRecord(
                        startedAt = o.getLong("s"),
                        endedAt = o.getLong("e"),
                        plannedEnd = o.optLong("p", 0L),
                        mode = enumOr(o.optString("m"), BlockMode.MOBILE_ONLY),
                        reason = enumOr(o.optString("r"), EndReason.HOLD_RELEASE),
                        blockedAttempts = o.optLong("b", 0L),
                    )
                }
            } catch (_: JSONException) {
                emptyList()
            }
        }
    }
}
