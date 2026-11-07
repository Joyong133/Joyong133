package com.joyong.smsblocker

import android.content.Context

/**
 * Persists the blocked-number list (shared by SMS and calls) and blocked
 * keywords in this app's private SharedPreferences. Nothing from blocked
 * senders is ever stored.
 */
object BlockStore {
    private const val PREFS = "sms_blocker"
    private const val KEY_BLOCKED = "blocked_numbers"
    private const val KEY_KEYWORDS = "blocked_keywords"
    private const val KEY_LOG = "blocked_log"
    private const val KEY_CALL_LOG = "blocked_call_log"
    private const val KEY_BLOCK_HIDDEN = "block_hidden_numbers"

    private fun prefs(ctx: Context) =
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun getSet(ctx: Context, key: String): Set<String> =
        prefs(ctx).getStringSet(key, emptySet()) ?: emptySet()

    private fun putSet(ctx: Context, key: String, set: Set<String>) {
        prefs(ctx).edit().putStringSet(key, HashSet(set)).apply()
    }

    /** Digits only, so "+82 10-1234-5678", "010-1234-5678" etc. compare equal. */
    fun normalize(number: String): String = number.filter { it.isDigit() }

    // ---- numbers / sender names ----

    fun getBlocked(ctx: Context): List<String> = getSet(ctx, KEY_BLOCKED).sorted()

    fun addBlocked(ctx: Context, number: String) {
        val n = number.trim()
        if (n.isEmpty()) return
        putSet(ctx, KEY_BLOCKED, getSet(ctx, KEY_BLOCKED) + n)
    }

    fun removeBlocked(ctx: Context, number: String) {
        putSet(ctx, KEY_BLOCKED, getSet(ctx, KEY_BLOCKED) - number)
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
        return getSet(ctx, KEY_BLOCKED).any { matches(sender, it) }
    }

    /** Remove every blocked entry that matches [number]. */
    fun unblockMatching(ctx: Context, number: String) {
        putSet(ctx, KEY_BLOCKED, getSet(ctx, KEY_BLOCKED).filterNot { matches(number, it) }.toSet())
    }

    // ---- keywords ----

    private fun squash(s: String) = s.filterNot { it.isWhitespace() }.lowercase()

    fun getKeywords(ctx: Context): List<String> = getSet(ctx, KEY_KEYWORDS).sorted()

    fun addKeyword(ctx: Context, keyword: String) {
        val k = keyword.trim()
        if (squash(k).isEmpty()) return
        putSet(ctx, KEY_KEYWORDS, getSet(ctx, KEY_KEYWORDS) + k)
    }

    fun removeKeyword(ctx: Context, keyword: String) {
        putSet(ctx, KEY_KEYWORDS, getSet(ctx, KEY_KEYWORDS) - keyword)
    }

    /** Spaces are ignored on both sides, so "대 출" still matches the keyword "대출". */
    fun containsBlockedKeyword(ctx: Context, body: String): Boolean {
        val text = squash(body)
        if (text.isEmpty()) return false
        return getSet(ctx, KEY_KEYWORDS).any { kw ->
            val k = squash(kw)
            k.isNotEmpty() && text.contains(k)
        }
    }

    /** Should an incoming SMS be dropped without a trace? */
    fun shouldDropSms(ctx: Context, sender: String, body: String): Boolean =
        isBlocked(ctx, sender) || containsBlockedKeyword(ctx, body)

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
