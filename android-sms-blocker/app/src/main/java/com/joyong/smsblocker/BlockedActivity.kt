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

/** Manage blocked numbers (SMS + calls), call blocking, and the hidden log. */
class BlockedActivity : AppCompatActivity() {

    private lateinit var b: ActivityBlockedBinding
    private lateinit var blockedAdapter: BlockedAdapter
    private val logAdapter = MessageAdapter()

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
        b.rvLog.layoutManager = LinearLayoutManager(this)
        b.rvLog.adapter = logAdapter

        b.btnAdd.setOnClickListener {
            val num = b.etNumber.text?.toString()?.trim().orEmpty()
            if (num.isEmpty()) {
                Ui.toast(this, "번호를 입력하세요")
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

        b.btnClearLog.setOnClickListener {
            AlertDialog.Builder(this)
                .setMessage("숨겨진 문자·전화 기록을 모두 지울까요?")
                .setPositiveButton("지우기") { _, _ ->
                    BlockStore.clearBlockedLog(this)
                    refresh()
                }
                .setNegativeButton("취소", null)
                .show()
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

        val log = BlockStore.getHiddenLog(this)
        logAdapter.submit(log)
        b.tvLogTitle.text = "숨겨진 기록 (${log.size})"
        b.tvLogEmpty.isVisible = log.isEmpty()
        b.btnClearLog.isVisible = log.isNotEmpty()
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
