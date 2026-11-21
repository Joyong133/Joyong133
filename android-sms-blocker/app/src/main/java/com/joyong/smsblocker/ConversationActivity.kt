package com.joyong.smsblocker

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.database.ContentObserver
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Telephony
import android.telephony.SmsMessage
import android.view.Menu
import android.view.MenuItem
import android.view.WindowManager
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.isVisible
import androidx.core.widget.doAfterTextChanged
import androidx.recyclerview.widget.LinearLayoutManager
import com.joyong.smsblocker.databinding.ActivityConversationBinding

/** One conversation: chat bubbles + reply box. Also handles sms:/smsto: links. */
class ConversationActivity : AppCompatActivity() {

    companion object {
        private const val EXTRA_ADDRESS = "address"
        private const val EXTRA_THREAD = "thread_id"
        const val EXTRA_BODY = "sms_body"

        /** Address of the conversation on screen, so we don't notify for it. */
        @Volatile
        var visibleAddress: String? = null

        fun intent(ctx: Context, address: String, threadId: Long = -1L, body: String? = null): Intent =
            Intent(ctx, ConversationActivity::class.java)
                .putExtra(EXTRA_ADDRESS, address)
                .putExtra(EXTRA_THREAD, threadId)
                .apply { if (!body.isNullOrEmpty()) putExtra(EXTRA_BODY, body) }
    }

    private lateinit var b: ActivityConversationBinding
    private val adapter = ChatAdapter(
        onLongPress = { m -> showMessageOptions(m) },
        onFailedTap = { m -> resend(m) },
        onOpenPart = { part -> MmsMedia.open(this, part) }
    )

    /** File picked to send with the next message (MMS). */
    private var attachment: Attachment? = null
    private val pickFile =
        registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
            if (uri != null) prepareAttachment(uri)
        }
    private var address = ""
    @Volatile
    private var threadId = -1L
    private var resumed = false

    private val defaultLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
            if (Ui.isDefaultSmsApp(this)) {
                Ui.toast(this, "기본 메시지 앱으로 설정됐어요. 다시 보내 보세요")
            } else {
                Ui.showRestrictedHelp(this)
            }
            updateBanner()
        }

    private val pickContact =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
            Ui.phoneFromPick(this, r.data?.data)?.let { n -> chooseRecipient(n) }
        }

    /** New-message mode: the recipient is typed at the top and the matching conversation shows live. */
    private var composeMode = false
    private var knownConversations: List<Conversation> = emptyList()
    private var suggestQuery = ""
    private val suggestAdapter = SuggestionAdapter { s -> chooseRecipient(s.number) }

    private val observer = object : ContentObserver(Handler(Looper.getMainLooper())) {
        override fun onChange(selfChange: Boolean) = load()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityConversationBinding.inflate(layoutInflater)
        setContentView(b.root)
        setSupportActionBar(b.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)

        b.rvChat.layoutManager = LinearLayoutManager(this).apply { stackFromEnd = true }
        b.rvChat.adapter = adapter
        b.btnSend.setOnClickListener { send() }
        b.etMessage.doAfterTextChanged { updateCounter() }
        b.btnAttach.setOnClickListener {
            runCatching { pickFile.launch("*/*") }.onFailure { Ui.toast(this, "파일을 고를 수 없어요") }
        }
        b.btnAttachRemove.setOnClickListener { clearAttachment() }
        b.tvBanner.setOnClickListener { if (!Ui.isDefaultSmsApp(this)) showNotDefaultDialog() }

        b.rvSuggest.layoutManager = LinearLayoutManager(this)
        b.rvSuggest.adapter = suggestAdapter
        b.etRecipient.doAfterTextChanged { onRecipientChanged() }
        b.btnPickContact.setOnClickListener {
            runCatching { pickContact.launch(Ui.pickPhoneIntent()) }
                .onFailure { Ui.toast(this, "연락처 앱을 열 수 없어요") }
        }

        handleIntent(intent)
    }

    private fun handleIntent(i: Intent) {
        var addr = i.getStringExtra(EXTRA_ADDRESS).orEmpty()
        var body = i.getStringExtra(EXTRA_BODY).orEmpty()
        threadId = i.getLongExtra(EXTRA_THREAD, -1L)

        val data = i.data
        if (addr.isEmpty() && data != null) {
            // sms:010-1234-5678?body=hello  /  smsto:01012345678
            val ssp = data.schemeSpecificPart.orEmpty()
            addr = ssp.substringBefore('?').removePrefix("//")
                .split(',', ';').firstOrNull().orEmpty()
            ssp.substringAfter('?', "").split('&')
                .firstOrNull { it.startsWith("body=") }
                ?.let { body = Uri.decode(it.removePrefix("body=")) }
        }
        addr = Uri.decode(addr).trim()

        if (body.isNotEmpty()) {
            b.etMessage.setText(body)
            b.etMessage.setSelection(b.etMessage.length())
        }

        if (addr.isEmpty()) enterCompose() else open(addr)
    }

    // ---- new message: recipient field at the top ----

    private fun enterCompose() {
        composeMode = true
        address = ""
        threadId = -1L
        supportActionBar?.title = "새 메시지"
        supportActionBar?.subtitle = null
        b.recipientBar.isVisible = true
        b.etRecipient.requestFocus()
        window.setSoftInputMode(
            WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE or WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
        )
        showComposeHint()
        Ui.load(this, { SmsRepo.conversations(this) }) { list ->
            knownConversations = list
            onRecipientChanged()
        }
    }

    private fun onRecipientChanged() {
        if (!composeMode) return
        val q = b.etRecipient.text?.toString()?.trim().orEmpty()
        val digits = BlockStore.normalize(q)

        // Already talked with this number? Show that conversation right away.
        val match = if (digits.length >= 8) {
            knownConversations.firstOrNull { BlockStore.matches(it.address, q) }
        } else null
        if (match != null) {
            address = match.address
            threadId = match.threadId
            supportActionBar?.subtitle = match.name ?: match.address
            b.tvComposeHint.isVisible = false
            showSuggestions(emptyList())
            updateBanner()
            invalidateOptionsMenu()
            load()
            return
        }

        address = if (digits.length >= 3) q else ""
        threadId = -1L
        supportActionBar?.subtitle = null
        adapter.submit(emptyList())
        showComposeHint()
        updateBanner()
        invalidateOptionsMenu()

        suggestQuery = q
        if (q.isEmpty()) {
            showSuggestions(emptyList())
            return
        }
        val fromThreads = knownConversations.filter { c ->
            c.name?.contains(q, ignoreCase = true) == true ||
                (digits.isNotEmpty() && BlockStore.normalize(c.address).contains(digits))
        }.map { Suggestion(it.name, it.address) }
        showSuggestions(fromThreads)
        Ui.load(this, { SmsRepo.searchContacts(this, q) }) { contacts ->
            if (composeMode && suggestQuery == q) showSuggestions(mergeSuggestions(fromThreads, contacts))
        }
    }

    private fun mergeSuggestions(a: List<Suggestion>, b2: List<Suggestion>): List<Suggestion> {
        val seen = HashSet<String>()
        return (a + b2).filter { s ->
            val key = BlockStore.normalize(s.number).takeLast(10).ifEmpty { s.number }
            seen.add(key)
        }.take(30)
    }

    private fun showSuggestions(list: List<Suggestion>) {
        suggestAdapter.submit(list)
        b.rvSuggest.isVisible = list.isNotEmpty()
    }

    private fun showComposeHint() {
        b.tvComposeHint.isVisible = true
        b.tvComposeHint.text =
            if (address.isEmpty()) "받는 사람 번호를 입력하세요" else "새 대화예요. 메시지를 입력해 보내세요"
    }

    /** Picked from suggestions or contacts: fill it in and move to the message box. */
    private fun chooseRecipient(number: String) {
        if (!composeMode) return
        b.etRecipient.setText(number)
        b.etRecipient.setSelection(b.etRecipient.length())
        showSuggestions(emptyList())
        b.etMessage.requestFocus()
    }

    /** Lock in the recipient when the first message is sent. */
    private fun finishCompose(): Boolean {
        val q = b.etRecipient.text?.toString()?.trim().orEmpty()
        if (BlockStore.normalize(q).length < 3) {
            Ui.toast(this, "받는 사람 번호를 입력하세요")
            b.etRecipient.requestFocus()
            return false
        }
        if (address.isEmpty()) address = q
        composeMode = false
        b.recipientBar.isVisible = false
        b.tvComposeHint.isVisible = false
        showSuggestions(emptyList())
        supportActionBar?.subtitle = null
        open(address)
        return true
    }

    private fun open(addr: String) {
        address = addr
        supportActionBar?.title = addr
        Ui.load(this, { SmsRepo.contactName(this, addr).orEmpty() }) { name ->
            if (name.isNotEmpty()) {
                supportActionBar?.title = name
                supportActionBar?.subtitle = addr
            }
        }
        if (resumed) visibleAddress = addr
        updateBanner()
        invalidateOptionsMenu()
        load()
    }

    override fun onResume() {
        super.onResume()
        resumed = true
        if (address.isNotEmpty()) {
            visibleAddress = address
            Notifier.cancel(this, address)
        }
        runCatching {
            contentResolver.registerContentObserver(Telephony.Sms.CONTENT_URI, true, observer)
            contentResolver.registerContentObserver(Telephony.Mms.CONTENT_URI, true, observer)
        }
        updateBanner()
        invalidateOptionsMenu()
        load()
    }

    override fun onPause() {
        super.onPause()
        resumed = false
        visibleAddress = null
        runCatching { contentResolver.unregisterContentObserver(observer) }
    }

    private fun updateBanner() {
        val text = when {
            !Ui.isDefaultSmsApp(this) -> "기본 메시지 앱이 아니라서 보낼 수 없어요. 여기를 눌러 설정하세요."
            address.isNotEmpty() && BlockStore.isBlocked(this, address) ->
                "차단한 번호예요. 이 번호에서 오는 문자와 전화는 나타나지 않습니다."
            else -> null
        }
        b.tvBanner.isVisible = text != null
        b.tvBanner.text = text.orEmpty()
    }

    private fun smsSegments(text: String): Int =
        runCatching { SmsMessage.calculateLength(text, false)[0] }.getOrDefault(1)

    /** "12자", or "85자 · 장문(LMS)" when it won't fit in one SMS. */
    private fun updateCounter() {
        val text = b.etMessage.text?.toString().orEmpty()
        if (text.isEmpty()) {
            b.tvCounter.isVisible = false
            return
        }
        b.tvCounter.text = when {
            attachment != null -> "${text.length}자 · 파일과 함께 MMS로 보내요"
            smsSegments(text) > 1 -> "${text.length}자 · 장문(LMS)으로 보내요"
            else -> "${text.length}자"
        }
        b.tvCounter.isVisible = true
    }

    // ---- attachments ----

    private fun prepareAttachment(uri: Uri) {
        Ui.toast(this, "파일 준비 중…")
        Ui.load(this, { MmsSender.prepareAttachment(this, uri) }) { (result, att) ->
            when {
                result == MmsSender.Result.OK && att != null -> setAttachment(att)
                result == MmsSender.Result.TOO_LARGE -> Ui.toast(
                    this, "파일이 너무 커요. 문자로 보낼 수 있는 크기는 약 ${MmsSender.maxMessageSize(this) / 1024}KB예요"
                )
                else -> Ui.toast(this, "파일을 불러올 수 없어요")
            }
        }
    }

    private fun setAttachment(a: Attachment) {
        attachment = a
        b.attachBar.isVisible = true
        b.tvAttachName.text = "${a.name} · ${maxOf(1L, a.file.length() / 1024)}KB"
        if (a.isImage) MmsMedia.load(b.ivAttachThumb, Uri.fromFile(a.file), 200)
        else {
            b.ivAttachThumb.tag = null
            b.ivAttachThumb.setImageResource(R.drawable.ic_attach)
        }
        updateCounter()
    }

    private fun clearAttachment() {
        attachment = null
        b.attachBar.isVisible = false
        updateCounter()
    }

    private fun load() {
        val addr = address
        if (addr.isEmpty()) return
        Ui.load(this, {
            // While composing, only preview existing conversations; don't create a thread per keystroke.
            if (threadId < 0 && !composeMode) threadId = SmsRepo.threadIdFor(this, addr)
            val msgs = if (threadId < 0) emptyList() else SmsRepo.messages(this, threadId)
            // Only touch the provider when something is actually unread,
            // otherwise the update would re-trigger our own observer forever.
            if (Ui.isDefaultSmsApp(this) && msgs.any { !it.outgoing && !it.read }) {
                SmsRepo.markRead(this, threadId)
            }
            msgs
        }) { msgs ->
            adapter.submit(msgs)
            if (adapter.itemCount > 0) b.rvChat.scrollToPosition(adapter.itemCount - 1)
        }
    }

    private fun canSend(): Boolean {
        if (!Ui.isDefaultSmsApp(this)) {
            showNotDefaultDialog()
            return false
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.SEND_SMS)
            != PackageManager.PERMISSION_GRANTED
        ) {
            Ui.toast(this, "문자 보내기 권한이 필요해요. 메인 화면에서 권한을 허용하세요.")
            return false
        }
        return true
    }

    /** Explain, show which app the phone treats as default, and offer to fix it right here. */
    private fun showNotDefaultDialog() {
        val current = Ui.currentDefaultSmsLabel(this)
        AlertDialog.Builder(this)
            .setTitle("기본 메시지 앱이 아니에요")
            .setMessage(
                "문자를 보내려면 안심메시지가 기본 메시지 앱이어야 해요.\n\n" +
                    "지금 휴대폰이 알려주는 기본 메시지 앱: ${current ?: "없음"}\n\n" +
                    "앱을 지웠다 다시 깔았다면 기본 앱 설정이 풀려요. 아래 버튼으로 다시 설정하세요."
            )
            .setPositiveButton("기본 앱으로 설정") { _, _ ->
                runCatching { defaultLauncher.launch(Ui.defaultSmsRequestIntent(this)) }
                    .onFailure { Ui.showRestrictedHelp(this) }
            }
            .setNeutralButton("설정이 안 돼요?") { _, _ -> Ui.showRestrictedHelp(this) }
            .setNegativeButton("닫기", null)
            .show()
    }

    private fun send() {
        val text = b.etMessage.text?.toString()?.trim().orEmpty()
        val att = attachment
        if (text.isEmpty() && att == null) return
        if (composeMode && !finishCompose()) return
        if (address.isEmpty() || !canSend()) return
        if (att != null || smsSegments(text) > 1) {
            // Files, and texts too long for one SMS (LMS), go out as MMS like on other Korean phones.
            sendMms(text, att)
        } else {
            b.etMessage.setText("")
            sendText(address, text)
        }
    }

    private fun sendMms(text: String, att: Attachment?) {
        b.etMessage.setText("")
        clearAttachment()
        val to = address
        Ui.load(this, { MmsSender.send(this, to, text, listOfNotNull(att)) }) { result ->
            if (result != MmsSender.Result.OK) {
                // Give the message back so nothing typed is lost.
                if (b.etMessage.text.isNullOrEmpty()) b.etMessage.setText(text)
                if (att != null && attachment == null) setAttachment(att)
                Ui.toast(
                    this,
                    if (result == MmsSender.Result.TOO_LARGE) "너무 커서 보낼 수 없어요 (최대 약 ${MmsSender.maxMessageSize(this) / 1024}KB)"
                    else "전송에 실패했어요"
                )
            }
            load()
        }
    }

    private fun sendText(to: String, text: String) {
        Ui.load(this, { SmsSender.send(this, to, text) }) { ok ->
            if (!ok) Ui.toast(this, "전송에 실패했어요")
            load()
        }
    }

    private fun resend(m: ChatMsg) {
        if (!canSend()) return
        AlertDialog.Builder(this)
            .setMessage("이 문자를 다시 보낼까요?")
            .setPositiveButton("다시 보내기") { _, _ ->
                SmsRepo.deleteMessage(this, m.id)
                sendText(address, m.body)
            }
            .setNegativeButton("취소", null)
            .show()
    }

    private fun showMessageOptions(m: ChatMsg) {
        val options = mutableListOf("복사", "전달", "삭제")
        if (m.outgoing && m.status == ChatMsg.FAILED && !m.mms) options.add(0, "다시 보내기")
        if (m.body.isEmpty()) options.remove("복사")
        AlertDialog.Builder(this)
            .setItems(options.toTypedArray()) { _, which ->
                when (options[which]) {
                    "다시 보내기" -> resend(m)
                    "복사" -> copy(m.body)
                    "전달" -> forward(m.body)
                    "삭제" -> deleteMessage(m)
                }
            }
            .show()
    }

    /** Open a new-message screen with the text ready; pick the recipient at the top. */
    private fun forward(body: String) {
        startActivity(ConversationActivity.intent(this, "", body = body))
    }

    private fun deleteMessage(m: ChatMsg) {
        if (!Ui.isDefaultSmsApp(this)) {
            Ui.toast(this, "기본 메시지 앱으로 설정해야 삭제할 수 있어요")
            return
        }
        AlertDialog.Builder(this)
            .setMessage("이 문자를 삭제할까요?")
            .setPositiveButton("삭제") { _, _ ->
                SmsRepo.deleteMessage(m, this)
                load()
            }
            .setNegativeButton("취소", null)
            .show()
    }

    private fun copy(text: String) {
        val cm = getSystemService(ClipboardManager::class.java) ?: return
        cm.setPrimaryClip(ClipData.newPlainText("message", text))
        // Android 13+ shows its own "copied" confirmation.
        if (Build.VERSION.SDK_INT < 33) Ui.toast(this, "복사했습니다")
    }

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menuInflater.inflate(R.menu.menu_conversation, menu)
        return true
    }

    override fun onPrepareOptionsMenu(menu: Menu): Boolean {
        for (i in 0 until menu.size()) menu.getItem(i).isVisible = address.isNotEmpty()
        val blocked = address.isNotEmpty() && BlockStore.isBlocked(this, address)
        menu.findItem(R.id.action_block)?.title = if (blocked) "차단 해제" else "이 번호 차단"
        return super.onPrepareOptionsMenu(menu)
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean = when (item.itemId) {
        android.R.id.home -> {
            finish(); true
        }
        R.id.action_call -> {
            if (address.isNotEmpty()) {
                runCatching { startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$address"))) }
            }
            true
        }
        R.id.action_block -> {
            if (address.isNotEmpty()) {
                if (BlockStore.isBlocked(this, address)) {
                    BlockStore.unblockMatching(this, address)
                    val pattern = BlockStore.blockingPattern(this, address)
                    if (pattern != null) {
                        Ui.toast(
                            this,
                            "번호 패턴 '${BlockStore.patternLabel(pattern)}' 때문에 계속 차단돼요. ⋮ → 차단 관리에서 패턴을 지우세요."
                        )
                    } else {
                        Ui.toast(this, "차단을 해제했습니다")
                    }
                    updateBanner()
                    invalidateOptionsMenu()
                } else {
                    Ui.confirmBlock(this, address) { finish() }
                }
            }
            true
        }
        R.id.action_delete -> {
            confirmDelete(); true
        }
        else -> super.onOptionsItemSelected(item)
    }

    private fun confirmDelete() {
        if (!Ui.isDefaultSmsApp(this)) {
            Ui.toast(this, "기본 메시지 앱으로 설정해야 삭제할 수 있어요")
            return
        }
        AlertDialog.Builder(this)
            .setMessage("이 대화를 삭제할까요?")
            .setPositiveButton("삭제") { _, _ ->
                if (threadId >= 0) SmsRepo.deleteThread(this, threadId)
                finish()
            }
            .setNegativeButton("취소", null)
            .show()
    }
}
