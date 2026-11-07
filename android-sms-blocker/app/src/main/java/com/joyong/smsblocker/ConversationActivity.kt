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
import android.view.Menu
import android.view.MenuItem
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.isVisible
import androidx.recyclerview.widget.LinearLayoutManager
import com.joyong.smsblocker.databinding.ActivityConversationBinding

/** One conversation: chat bubbles + reply box. Also handles sms:/smsto: links. */
class ConversationActivity : AppCompatActivity() {

    companion object {
        private const val EXTRA_ADDRESS = "address"
        private const val EXTRA_THREAD = "thread_id"

        /** Address of the conversation on screen, so we don't notify for it. */
        @Volatile
        var visibleAddress: String? = null

        fun intent(ctx: Context, address: String, threadId: Long = -1L): Intent =
            Intent(ctx, ConversationActivity::class.java)
                .putExtra(EXTRA_ADDRESS, address)
                .putExtra(EXTRA_THREAD, threadId)
    }

    private lateinit var b: ActivityConversationBinding
    private val adapter = ChatAdapter { text -> copy(text) }
    private var address = ""
    @Volatile
    private var threadId = -1L
    private var resumed = false

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

        handleIntent(intent)
    }

    private fun handleIntent(i: Intent) {
        var addr = i.getStringExtra(EXTRA_ADDRESS).orEmpty()
        var body = i.getStringExtra("sms_body").orEmpty()
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

        if (body.isNotEmpty()) b.etMessage.setText(body)

        if (addr.isEmpty()) {
            Ui.askNumber(this, onOk = { n -> open(n) }, onCancel = { finish() })
        } else {
            open(addr)
        }
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
            !Ui.isDefaultSmsApp(this) -> "기본 메시지 앱으로 설정해야 문자를 보낼 수 있어요."
            address.isNotEmpty() && BlockStore.isBlocked(this, address) ->
                "차단한 번호예요. 이 번호에서 오는 문자는 저장되지 않습니다."
            else -> null
        }
        b.tvBanner.isVisible = text != null
        b.tvBanner.text = text.orEmpty()
    }

    private fun load() {
        val addr = address
        if (addr.isEmpty()) return
        Ui.load(this, {
            if (threadId < 0) threadId = SmsRepo.threadIdFor(this, addr)
            val msgs = SmsRepo.messages(this, threadId)
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

    private fun send() {
        val text = b.etMessage.text?.toString()?.trim().orEmpty()
        if (text.isEmpty() || address.isEmpty()) return
        if (!Ui.isDefaultSmsApp(this)) {
            Ui.toast(this, "기본 메시지 앱으로 설정해야 보낼 수 있어요")
            return
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.SEND_SMS)
            != PackageManager.PERMISSION_GRANTED
        ) {
            Ui.toast(this, "문자 보내기 권한이 필요해요. 메인 화면에서 권한을 허용하세요.")
            return
        }
        b.etMessage.setText("")
        val addr = address
        Ui.load(this, { SmsSender.send(this, addr, text) }) { ok ->
            if (!ok) Ui.toast(this, "전송에 실패했어요")
            load()
        }
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
                    Ui.toast(this, "차단을 해제했습니다")
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
