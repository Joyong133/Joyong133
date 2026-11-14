package com.joyong.smsblocker

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.view.MenuItem
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.isVisible
import androidx.recyclerview.widget.LinearLayoutManager
import com.joyong.smsblocker.databinding.ActivityBlockedBinding

/** Manage blocked numbers and number patterns (SMS + calls), blocked keywords and call blocking. */
class BlockedActivity : AppCompatActivity() {

    private lateinit var b: ActivityBlockedBinding
    private lateinit var blockedAdapter: BlockedAdapter
    private lateinit var keywordAdapter: BlockedAdapter
    private lateinit var patternAdapter: BlockedAdapter

    private val callRoleLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
            if (CallBlock.roleHeld(this)) {
                askCallLogPermission()
            } else {
                Ui.showRestrictedHelp(this, "전화 차단 앱")
            }
            refresh()
        }

    private val callLogPermLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
            if (CallBlock.logPermsGranted(this)) {
                CallLogCleaner.cleanAsync(this)
            } else {
                AlertDialog.Builder(this)
                    .setMessage("통화 기록에서 차단 전화를 지우려면 '통화 기록' 권한이 필요해요.\n앱 정보 → 권한 → 통화 기록 → 허용")
                    .setPositiveButton("앱 정보 열기") { _, _ -> openAppInfo() }
                    .setNegativeButton("닫기", null)
                    .show()
            }
            refresh()
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityBlockedBinding.inflate(layoutInflater)
        setContentView(b.root)
        setSupportActionBar(b.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)

        blockedAdapter = BlockedAdapter { number ->
            BlockStore.removeBlocked(this, number)
            refresh()
        }
        b.rvBlocked.layoutManager = LinearLayoutManager(this)
        b.rvBlocked.adapter = blockedAdapter

        keywordAdapter = BlockedAdapter { keyword ->
            BlockStore.removeKeyword(this, keyword)
            refresh()
        }
        b.rvKeywords.layoutManager = LinearLayoutManager(this)
        b.rvKeywords.adapter = keywordAdapter

        b.btnAddKeyword.setOnClickListener {
            val kw = b.etKeyword.text?.toString()?.trim().orEmpty()
            if (kw.isEmpty()) {
                Ui.toast(this, "문구를 입력하세요")
                return@setOnClickListener
            }
            if (kw.filterNot { it.isWhitespace() }.length < 2) {
                Ui.toast(this, "너무 짧은 문구는 다른 문자까지 막을 수 있어요. 2글자 이상 입력하세요")
                return@setOnClickListener
            }
            BlockStore.addKeyword(this, kw)
            b.etKeyword.setText("")
            Ui.toast(this, "'$kw' 문구를 차단했습니다")
            refresh()
        }

        patternAdapter = BlockedAdapter(label = BlockStore::patternLabel) { raw ->
            BlockStore.removePattern(this, raw)
            refresh()
        }
        b.rvPatterns.layoutManager = LinearLayoutManager(this)
        b.rvPatterns.adapter = patternAdapter

        b.btnAddPattern.setOnClickListener {
            val input = b.etPattern.text?.toString().orEmpty()
            if (BlockStore.normalize(input).length < BlockStore.MIN_PATTERN_DIGITS) {
                Ui.toast(this, "숫자 ${BlockStore.MIN_PATTERN_DIGITS}자리 이상 입력하세요 (예: 070)")
                return@setOnClickListener
            }
            b.etPattern.setText("")
            addPattern(input, b.cbPrefixOnly.isChecked)
        }

        b.btnAdd.setOnClickListener {
            val num = b.etNumber.text?.toString()?.trim().orEmpty()
            if (num.isEmpty()) {
                Ui.toast(this, "번호를 입력하세요")
                return@setOnClickListener
            }
            // A short run of digits like "070" isn't a whole number: offer a pattern instead.
            val digits = BlockStore.normalize(num)
            val onlyDigits = num.all { it.isDigit() || it == '-' || it == ' ' }
            if (onlyDigits && digits.length in BlockStore.MIN_PATTERN_DIGITS..6) {
                b.etNumber.setText("")
                askPatternMode(digits)
                return@setOnClickListener
            }
            BlockStore.addBlocked(this, num)
            val removed = if (Ui.isDefaultSmsApp(this)) SmsRepo.deleteFromAddress(this, num) else 0
            CallLogCleaner.cleanAsync(this)
            b.etNumber.setText("")
            Ui.toast(this, if (removed > 0) "차단했습니다 · 기존 문자 ${removed}건 삭제" else "차단했습니다")
            refresh()
        }

        b.btnCallSetup.setOnClickListener { setUpCallBlocking() }

        b.swHidden.setOnCheckedChangeListener { _, checked ->
            BlockStore.setBlockHidden(this, checked)
        }
    }

    override fun onResume() {
        super.onResume()
        refresh()
        CallLogCleaner.cleanAsync(this)
    }

    private fun setUpCallBlocking() {
        if (!CallBlock.supported()) {
            Ui.toast(this, "전화 차단은 Android 10 이상에서만 지원됩니다")
            return
        }
        if (!CallBlock.roleHeld(this)) {
            val intent = CallBlock.roleRequestIntent(this)
            if (intent == null) {
                Ui.toast(this, "이 휴대폰에서는 전화 차단 앱을 설정할 수 없어요")
            } else {
                callRoleLauncher.launch(intent)
            }
            return
        }
        askCallLogPermission()
    }

    private fun askPatternMode(digits: String) {
        AlertDialog.Builder(this)
            .setTitle("'$digits' 번호 패턴")
            .setMessage("'$digits'는 전체 번호가 아니에요. 어떻게 차단할까요?")
            .setPositiveButton("$digits 들어간 번호 모두") { _, _ -> addPattern(digits, prefixOnly = false) }
            .setNeutralButton("$digits 로 시작만") { _, _ -> addPattern(digits, prefixOnly = true) }
            .setNegativeButton("취소", null)
            .show()
    }

    /** Add a number pattern, clean the call log, and offer to delete matching stored messages. */
    private fun addPattern(input: String, prefixOnly: Boolean) {
        val raw = BlockStore.addPattern(this, input, prefixOnly) ?: return
        val label = BlockStore.patternLabel(raw)
        CallLogCleaner.cleanAsync(this)
        refresh()
        if (!Ui.isDefaultSmsApp(this)) {
            Ui.toast(this, "'$label' 차단을 추가했어요")
            return
        }
        Ui.load(this, { SmsRepo.countWhere(this) { BlockStore.patternMatches(it, raw) } }) { n ->
            if (n == 0) {
                Ui.toast(this, "'$label' 차단을 추가했어요")
            } else {
                AlertDialog.Builder(this)
                    .setTitle("'$label' 차단을 추가했어요")
                    .setMessage("이미 받은 문자 중 이 패턴에 맞는 번호의 문자가 ${n}건 있어요. 대화 목록에서는 벌써 숨겨졌어요.\n\n휴대폰에서 아예 지울까요?")
                    .setPositiveButton("지우기") { _, _ ->
                        Ui.load(this, { SmsRepo.deleteWhere(this) { BlockStore.patternMatches(it, raw) } }) { d ->
                            Ui.toast(this, "${d}건 삭제했어요")
                        }
                    }
                    .setNegativeButton("그대로 두기", null)
                    .show()
            }
        }
    }

    private fun askCallLogPermission() {
        if (!CallBlock.logPermsGranted(this)) callLogPermLauncher.launch(CallBlock.LOG_PERMISSIONS)
    }

    private fun openAppInfo() {
        startActivity(
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                .setData(Uri.fromParts("package", packageName, null))
        )
    }

    private fun refresh() {
        refreshCallCard()

        val blocked = BlockStore.getBlocked(this)
        blockedAdapter.submit(blocked)
        b.tvBlockedEmpty.isVisible = blocked.isEmpty()

        val patterns = BlockStore.getPatterns(this)
        patternAdapter.submit(patterns)
        b.tvPatternsEmpty.isVisible = patterns.isEmpty()

        val keywords = BlockStore.getKeywords(this)
        keywordAdapter.submit(keywords)
        b.tvKeywordsEmpty.isVisible = keywords.isEmpty()
    }

    private fun refreshCallCard() {
        val supported = CallBlock.supported()
        val role = CallBlock.roleHeld(this)
        val perms = CallBlock.logPermsGranted(this)

        b.tvCallStatus.text = when {
            !supported -> "Android 10 이상에서만 지원됩니다."
            !role -> "꺼짐 — 켜면 차단 번호의 전화가 울리지 않고 바로 끊깁니다."
            !perms -> "켜짐 · 최근 통화 기록에서도 지우려면 '통화 기록' 권한을 허용하세요."
            else -> "켜짐 — 차단 번호의 전화는 울리지 않고, 알림과 최근 통화 기록에도 남지 않습니다."
        }
        b.btnCallSetup.isVisible = supported && !(role && perms)
        b.btnCallSetup.text = if (!role) "전화 차단 켜기" else "통화 기록 권한 허용"

        b.swHidden.isVisible = supported
        b.swHidden.isEnabled = role
        b.swHidden.isChecked = BlockStore.blockHidden(this)
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        if (item.itemId == android.R.id.home) {
            finish()
            return true
        }
        return super.onOptionsItemSelected(item)
    }
}
