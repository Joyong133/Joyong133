package com.joyong.smsblocker

import android.content.Context

/**
 * Persists the blocked-number list (shared by SMS and calls) in this app's
 * private SharedPreferences. Nothing from blocked senders is ever stored.
 */
object BlockStore {
    private const val PREFS = "sms_blocker"
    private const val KEY_BLOCKED = "blocked_numbers"
    private const val KEY_LOG = "blocked_log"
    private const val KEY_CALL_LOG = "blocked_call_log"
    private const val KEY_BLOCK_HIDDEN = "block_hidden_numbers"

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

    /** Older versions kept a copy of blocked messages/calls; erase it. */
    fun purgeLegacyLog(ctx: Context) {
        prefs(ctx).edit().remove(KEY_LOG).remove(KEY_CALL_LOG).apply()
    }
}
