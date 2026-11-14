package com.joyong.smsblocker

import android.content.Context

/**
 * Persists blocked numbers and number patterns (shared by SMS and calls) and
 * blocked keywords in this app's private SharedPreferences. Nothing from
 * blocked senders is ever stored.
 */
object BlockStore {
    private const val PREFS = "sms_blocker"
    private const val KEY_BLOCKED = "blocked_numbers"
    private const val KEY_KEYWORDS = "blocked_keywords"
    private const val KEY_PATTERNS = "blocked_number_patterns"
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

    /** True if [sender] matches any blocked number or any number pattern. */
    fun isBlocked(ctx: Context, sender: String): Boolean {
        if (sender.isBlank()) return false
        return getSet(ctx, KEY_BLOCKED).any { matches(sender, it) } ||
            blockingPattern(ctx, sender) != null
    }

    // ---- number patterns: "070" blocks every number containing (or starting with) 070 ----
    // Stored as "070" (anywhere in the number) or "^070" (only at the start).

    private const val PREFIX_MARK = "^"
    const val MIN_PATTERN_DIGITS = 3

    /** Domestic digits: "+82 70-1234-5678" / "0082…" → "07012345678", so prefixes like 070 match. */
    fun localDigits(number: String): String {
        val t = number.trim()
        val d = normalize(t)
        val intl = when {
            t.startsWith("+82") && d.startsWith("82") -> d.drop(2)
            d.startsWith("0082") -> d.drop(4)
            else -> return d
        }
        return if (intl.startsWith("0")) intl else "0$intl"
    }

    fun getPatterns(ctx: Context): List<String> =
        getSet(ctx, KEY_PATTERNS).sortedBy { it.removePrefix(PREFIX_MARK) }

    /** Adds a pattern and returns its stored form, or null if it has too few digits. */
    fun addPattern(ctx: Context, input: String, prefixOnly: Boolean): String? {
        val digits = normalize(input)
        if (digits.length < MIN_PATTERN_DIGITS) return null
        val raw = if (prefixOnly) PREFIX_MARK + digits else digits
        putSet(ctx, KEY_PATTERNS, getSet(ctx, KEY_PATTERNS) + raw)
        return raw
    }

    fun removePattern(ctx: Context, raw: String) {
        putSet(ctx, KEY_PATTERNS, getSet(ctx, KEY_PATTERNS) - raw)
    }

    fun patternLabel(raw: String): String =
        if (raw.startsWith(PREFIX_MARK)) "${raw.removePrefix(PREFIX_MARK)} · 앞자리"
        else "$raw · 포함"

    fun patternMatches(number: String, raw: String): Boolean {
        val prefixOnly = raw.startsWith(PREFIX_MARK)
        val p = raw.removePrefix(PREFIX_MARK)
        if (p.length < MIN_PATTERN_DIGITS) return false
        val n = localDigits(number)
        if (n.isEmpty()) return false
        return if (prefixOnly) n.startsWith(p) else n.contains(p)
    }

    /** The stored pattern that blocks [number], if any. */
    fun blockingPattern(ctx: Context, number: String): String? =
        getSet(ctx, KEY_PATTERNS).firstOrNull { patternMatches(number, it) }

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
