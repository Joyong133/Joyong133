package com.joyong.smsblocker

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** Stored message (used for lists and the hidden "blocked" log). */
data class Msg(val address: String, val body: String, val date: Long)

/**
 * Persists the blocked-number list (shared by SMS and calls) and a private
 * log of what was silently dropped. Everything lives in this app's private
 * SharedPreferences — nothing in the system SMS or call-log databases.
 */
object BlockStore {
    private const val PREFS = "sms_blocker"
    private const val KEY_BLOCKED = "blocked_numbers"
    private const val KEY_LOG = "blocked_log"
    private const val KEY_CALL_LOG = "blocked_call_log"
    private const val KEY_BLOCK_HIDDEN = "block_hidden_numbers"
    private const val LOG_LIMIT = 300

    const val HIDDEN_NUMBER_LABEL = "발신번호 표시 제한"

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

    /**
     * Same number? Digits compared exactly, or on the trailing 8+ digits to
     * forgive country-code differences (+82 10… vs 010…). Non-numeric sender
     * names (e.g. "KT") compare case-insensitively.
     */
    fun matches(a: String, b: String): Boolean {
        val x = normalize(a)
        val y = normalize(b)
        if (x.isEmpty() || y.isEmpty()) {
            return x.isEmpty() && y.isEmpty() && a.isNotBlank() && a.trim().equals(b.trim(), ignoreCase = true)
        }
        if (x == y) return true
        return minOf(x.length, y.length) >= 8 && (x.endsWith(y) || y.endsWith(x))
    }

    /** True if [sender] matches any blocked entry. */
    fun isBlocked(ctx: Context, sender: String): Boolean {
        if (sender.isBlank()) return false
        return prefs(ctx).getStringSet(KEY_BLOCKED, emptySet())!!.any { matches(sender, it) }
    }

    /** Remove every blocked entry that matches [number]. */
    fun unblockMatching(ctx: Context, number: String) {
        val set = prefs(ctx).getStringSet(KEY_BLOCKED, emptySet())!!
            .filterNot { matches(number, it) }.toSet()
        prefs(ctx).edit().putStringSet(KEY_BLOCKED, set).apply()
    }

    // ---- "발신번호 표시 제한" (private / unknown number) calls ----

    fun blockHidden(ctx: Context): Boolean = prefs(ctx).getBoolean(KEY_BLOCK_HIDDEN, false)

    fun setBlockHidden(ctx: Context, on: Boolean) {
        prefs(ctx).edit().putBoolean(KEY_BLOCK_HIDDEN, on).apply()
    }

    // ---- private log of hidden messages / calls ----

    @Synchronized
    private fun append(ctx: Context, key: String, address: String, body: String, date: Long) {
        val arr = JSONArray(prefs(ctx).getString(key, "[]"))
        val out = JSONArray().put(JSONObject().put("a", address).put("b", body).put("d", date))
        for (i in 0 until minOf(arr.length(), LOG_LIMIT - 1)) out.put(arr.get(i))
        prefs(ctx).edit().putString(key, out.toString()).apply()
    }

    private fun read(ctx: Context, key: String): List<Msg> {
        val arr = JSONArray(prefs(ctx).getString(key, "[]"))
        return (0 until arr.length()).map {
            val o = arr.getJSONObject(it)
            Msg(o.optString("a"), o.optString("b"), o.optLong("d"))
        }
    }

    fun logBlocked(ctx: Context, address: String, body: String, date: Long) =
        append(ctx, KEY_LOG, address, body, date)

    fun logBlockedCall(ctx: Context, number: String, date: Long) =
        append(ctx, KEY_CALL_LOG, number, "📞 차단된 전화", date)

    /** Hidden messages and calls, newest first. */
    fun getHiddenLog(ctx: Context): List<Msg> =
        (read(ctx, KEY_LOG) + read(ctx, KEY_CALL_LOG)).sortedByDescending { it.date }

    fun clearBlockedLog(ctx: Context) {
        prefs(ctx).edit().putString(KEY_LOG, "[]").putString(KEY_CALL_LOG, "[]").apply()
    }
}
