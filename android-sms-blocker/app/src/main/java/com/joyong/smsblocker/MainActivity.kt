package com.joyong.smsblocker

import android.Manifest
import android.app.role.RoleManager
import android.content.Intent
import android.content.pm.PackageManager
import android.database.ContentObserver
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Telephony
import android.view.Menu
import android.view.MenuItem
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.widget.SearchView
import androidx.core.content.ContextCompat
import androidx.core.view.isVisible
import androidx.recyclerview.widget.LinearLayoutManager
import com.joyong.smsblocker.databinding.ActivityMainBinding

/** Conversation list. */
class MainActivity : AppCompatActivity() {

    private lateinit var b: ActivityMainBinding
    private lateinit var adapter: ConversationAdapter
    private var askedPermissions = false

    private var all: List<Conversation> = emptyList()
    private var query = ""
    private var bodyMatches: Set<Long> = emptySet()

    private val roleLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
            if (Ui.isDefaultSmsApp(this)) askPermissions() else Ui.showRestrictedHelp(this)
            refresh()
        }

    private val permLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { refresh() }

    private val pickContact =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
            Ui.phoneFromPick(this, r.data?.data)?.let { n ->
                startActivity(ConversationActivity.intent(this, n))
            }
        }

    private val observer = object : ContentObserver(Handler(Looper.getMainLooper())) {
        override fun onChange(selfChange: Boolean) = refresh()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityMainBinding.inflate(layoutInflater)
        setContentView(b.root)
        setSupportActionBar(b.toolbar)
        BlockStore.purgeLegacyLog(this)

        adapter = ConversationAdapter(
            onClick = { c ->
                startActivity(ConversationActivity.intent(this, c.address, c.threadId))
            },
            onLongClick = { c -> showConversationOptions(c) }
        )
        b.rvConversations.layoutManager = LinearLayoutManager(this)
        b.rvConversations.adapter = adapter

        b.btnDefault.setOnClickListener { requestDefault() }
        b.btnHelp.setOnClickListener { Ui.showRestrictedHelp(this) }
        b.fabNew.setOnClickListener { newMessage() }
    }

    override fun onResume() {
        super.onResume()
        runCatching {
            contentResolver.registerContentObserver(Telephony.Sms.CONTENT_URI, true, observer)
        }
        if (Ui.isDefaultSmsApp(this) && !askedPermissions) askPermissions()
        refresh()
    }

    override fun onPause() {
        super.onPause()
        runCatching { contentResolver.unregisterContentObserver(observer) }
    }

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menuInflater.inflate(R.menu.menu_main, menu)
        (menu.findItem(R.id.action_search)?.actionView as? SearchView)?.apply {
            queryHint = "이름·번호·내용 검색"
            setOnQueryTextListener(object : SearchView.OnQueryTextListener {
                override fun onQueryTextSubmit(text: String?): Boolean {
                    clearFocus()
                    return true
                }

                override fun onQueryTextChange(text: String?): Boolean {
                    onSearchChanged(text.orEmpty())
                    return true
                }
            })
        }
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean = when (item.itemId) {
        R.id.action_read_all -> {
            markAllRead(); true
        }
        R.id.action_blocked -> {
            startActivity(Intent(this, BlockedActivity::class.java)); true
        }
        R.id.action_help -> {
            Ui.showRestrictedHelp(this); true
        }
        else -> super.onOptionsItemSelected(item)
    }

    private fun newMessage() {
        Ui.askNumber(
            this,
            onOk = { n -> startActivity(ConversationActivity.intent(this, n)) },
            onPickContact = {
                runCatching { pickContact.launch(Ui.pickPhoneIntent()) }
                    .onFailure { Ui.toast(this, "연락처 앱을 열 수 없어요") }
            }
        )
    }

    private fun markAllRead() {
        if (!Ui.isDefaultSmsApp(this)) {
            Ui.toast(this, "기본 메시지 앱으로 설정해야 할 수 있어요")
            return
        }
        Ui.load(this, { SmsRepo.markAllRead(this) }) { n ->
            Ui.toast(this, if (n > 0) "${n}개를 읽음으로 표시했어요" else "안 읽은 문자가 없어요")
            refresh()
        }
    }

    private fun requestDefault() {
        if (Ui.isDefaultSmsApp(this)) {
            askPermissions()
            return
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val rm = getSystemService(RoleManager::class.java)
            if (rm != null && rm.isRoleAvailable(RoleManager.ROLE_SMS)) {
                roleLauncher.launch(rm.createRequestRoleIntent(RoleManager.ROLE_SMS))
                return
            }
        }
        @Suppress("DEPRECATION")
        roleLauncher.launch(
            Intent(Telephony.Sms.Intents.ACTION_CHANGE_DEFAULT)
                .putExtra(Telephony.Sms.Intents.EXTRA_PACKAGE_NAME, packageName)
        )
    }

    private fun askPermissions() {
        askedPermissions = true
        val wanted = mutableListOf(
            Manifest.permission.RECEIVE_SMS,
            Manifest.permission.READ_SMS,
            Manifest.permission.SEND_SMS,
            Manifest.permission.READ_CONTACTS
        )
        if (Build.VERSION.SDK_INT >= 33) wanted.add(Manifest.permission.POST_NOTIFICATIONS)
        val missing = wanted.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isNotEmpty()) permLauncher.launch(missing.toTypedArray())
    }

    private fun onSearchChanged(text: String) {
        query = text.trim()
        if (query.isEmpty()) {
            bodyMatches = emptySet()
            applyFilter()
            return
        }
        val q = query
        Ui.load(this, { SmsRepo.searchThreadIds(this, q) }) { ids ->
            if (q == query) {
                bodyMatches = ids
                applyFilter()
            }
        }
    }

    private fun refresh() {
        val isDefault = Ui.isDefaultSmsApp(this)
        b.cardBanner.isVisible = !isDefault
        Ui.load(this, { SmsRepo.conversations(this) }) { list ->
            all = list
            applyFilter()
        }
    }

    private fun applyFilter() {
        val q = query
        val digits = BlockStore.normalize(q)
        val shown = if (q.isEmpty()) all else all.filter { c ->
            (c.name?.contains(q, ignoreCase = true) == true) ||
                c.address.contains(q, ignoreCase = true) ||
                (digits.isNotEmpty() && BlockStore.normalize(c.address).contains(digits)) ||
                c.snippet.contains(q, ignoreCase = true) ||
                c.threadId in bodyMatches
        }
        adapter.submit(shown)
        b.tvEmpty.isVisible = shown.isEmpty()
        b.tvEmpty.text = when {
            q.isNotEmpty() -> "검색 결과가 없습니다"
            Ui.isDefaultSmsApp(this) -> "대화가 없습니다"
            else -> "기본 메시지 앱으로 설정하면\n문자가 여기에 표시됩니다"
        }
    }

    private fun showConversationOptions(c: Conversation) {
        AlertDialog.Builder(this)
            .setTitle(c.name ?: c.address)
            .setItems(arrayOf("이 번호 차단", "대화 삭제")) { _, which ->
                when (which) {
                    0 -> Ui.confirmBlock(this, c.address) { refresh() }
                    1 -> confirmDelete(c)
                }
            }
            .show()
    }

    private fun confirmDelete(c: Conversation) {
        if (!Ui.isDefaultSmsApp(this)) {
            Ui.toast(this, "기본 메시지 앱으로 설정해야 삭제할 수 있어요")
            return
        }
        AlertDialog.Builder(this)
            .setMessage("${c.name ?: c.address} 대화를 삭제할까요?")
            .setPositiveButton("삭제") { _, _ ->
                SmsRepo.deleteThread(this, c.threadId)
                refresh()
            }
            .setNegativeButton("취소", null)
            .show()
    }
}
