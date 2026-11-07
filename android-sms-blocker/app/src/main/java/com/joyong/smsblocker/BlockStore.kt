package com.joyong.smsblocker

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** Stored message (used both for the inbox preview and the hidden "blocked" log). */
data class Msg(val address: String, val body: String, val date: Long)

/**
 * Persists the blocked-number list and a private log of messages that were
 * silently dropped. Everything lives in SharedPreferences, nothing in the
 * system SMS database — so blocked messages never surface anywhere else.
 */
object BlockStore {
    private const val PREFS = "sms_blocker"
    private const val KEY_BLOCKED = "blocked_numbers"
    private const val KEY_LOG = "blocked_log"
    private const val LOG_LIMIT = 300

    private fun prefs(ctx: Context) =
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** Digits only, so "+82 10-1234-5678", "010-1234-5678" etc. compare equal. */
    fun normalize(number: String): String = number.filter { it.isDigit() }

    fun getBlocked(ctx: Context): List<String> =
        prefs(ctx).getStringSet(KEY_BLOCKED, emptySet())!!.sorted()

    fun addBlocked(ctx: Context, number: String) {
        val n = number.trim()
        if (n.isEmpty()) return
        val set = prefs(ctx).getStringSet(KEY_BLOCKED, emptySet())!!.toMutableSet()
        set.add(n)
        prefs(ctx).edit().putStringSet(KEY_BLOCKED, set).apply()
    }

    fun removeBlocked(ctx: Context, number: String) {
        val set = prefs(ctx).getStringSet(KEY_BLOCKED, emptySet())!!.toMutableSet()
        set.remove(number)
        prefs(ctx).edit().putStringSet(KEY_BLOCKED, set).apply()
    }

    /** True if [sender] matches any blocked entry (exact or trailing-digits match). */
    fun isBlocked(ctx: Context, sender: String): Boolean {
        val s = normalize(sender)
        if (s.isEmpty()) return false
        for (raw in prefs(ctx).getStringSet(KEY_BLOCKED, emptySet())!!) {
            val b = normalize(raw)
            if (b.isEmpty()) continue
            if (s == b) return true
            // Forgive country-code differences: match on the last 8+ digits.
            val min = minOf(s.length, b.length)
            if (min >= 8 && (s.endsWith(b) || b.endsWith(s))) return true
        }
        return false
    }

    fun logBlocked(ctx: Context, address: String, body: String, date: Long) {
        val arr = JSONArray(prefs(ctx).getString(KEY_LOG, "[]"))
        val obj = JSONObject()
            .put("a", address)
            .put("b", body)
            .put("d", date)
        // newest first, capped
        val out = JSONArray().put(obj)
        for (i in 0 until minOf(arr.length(), LOG_LIMIT - 1)) out.put(arr.get(i))
        prefs(ctx).edit().putString(KEY_LOG, out.toString()).apply()
    }

    fun getBlockedLog(ctx: Context): List<Msg> {
        val arr = JSONArray(prefs(ctx).getString(KEY_LOG, "[]"))
        return (0 until arr.length()).map {
            val o = arr.getJSONObject(it)
            Msg(o.optString("a"), o.optString("b"), o.optLong("d"))
        }
    }

    fun clearBlockedLog(ctx: Context) {
        prefs(ctx).edit().putString(KEY_LOG, "[]").apply()
    }
}
