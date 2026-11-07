package com.joyong.smsblocker

import android.Manifest
import android.app.role.RoleManager
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.provider.Telephony
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import com.joyong.smsblocker.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {

    private lateinit var b: ActivityMainBinding
    private lateinit var blockedAdapter: BlockedAdapter
    private val messageAdapter = MessageAdapter()
    private var showingInbox = true

    private val roleLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { refresh() }

    private val permLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { refresh() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityMainBinding.inflate(layoutInflater)
        setContentView(b.root)

        blockedAdapter = BlockedAdapter { number ->
            BlockStore.removeBlocked(this, number)
            refresh()
        }
        b.rvBlocked.layoutManager = LinearLayoutManager(this)
        b.rvBlocked.adapter = blockedAdapter
        b.rvMessages.layoutManager = LinearLayoutManager(this)
        b.rvMessages.adapter = messageAdapter

        b.btnDefault.setOnClickListener { requestDefaultAndPermissions() }

        b.btnAdd.setOnClickListener {
            val num = b.etNumber.text?.toString()?.trim().orEmpty()
            if (num.isEmpty()) {
                toast("번호를 입력하세요")
                return@setOnClickListener
            }
            BlockStore.addBlocked(this, num)
            val removed = deleteExistingFrom(num)
            b.etNumber.setText("")
            refresh()
            toast(if (removed > 0) "차단 추가 · 기존 문자 ${removed}건 삭제" else "차단에 추가했습니다")
        }

        b.btnInbox.setOnClickListener { showingInbox = true; refresh() }
        b.btnLog.setOnClickListener { showingInbox = false; refresh() }

        b.tvListTitle.setOnLongClickListener {
            if (!showingInbox) {
                AlertDialog.Builder(this)
                    .setMessage("차단 기록을 모두 지울까요?")
                    .setPositiveButton("지우기") { _, _ ->
                        BlockStore.clearBlockedLog(this); refresh()
                    }
                    .setNegativeButton("취소", null)
                    .show()
            }
            true
        }
    }

    override fun onResume() {
        super.onResume()
        refresh()
    }

    private fun isDefaultSmsApp(): Boolean =
        Telephony.Sms.getDefaultSmsPackage(this) == packageName

    private fun requestDefaultAndPermissions() {
        if (!isDefaultSmsApp()) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val rm = getSystemService(RoleManager::class.java)
                if (rm != null && rm.isRoleAvailable(RoleManager.ROLE_SMS)) {
                    roleLauncher.launch(rm.createRequestRoleIntent(RoleManager.ROLE_SMS))
                    return
                }
            }
            @Suppress("DEPRECATION")
            val intent = Intent(Telephony.Sms.Intents.ACTION_CHANGE_DEFAULT)
                .putExtra(Telephony.Sms.Intents.EXTRA_PACKAGE_NAME, packageName)
            startActivity(intent)
        } else {
            requestRuntimePermissions()
        }
    }

    private fun requestRuntimePermissions() {
        val needed = mutableListOf(
            Manifest.permission.RECEIVE_SMS,
            Manifest.permission.READ_SMS,
            Manifest.permission.SEND_SMS
        )
        if (Build.VERSION.SDK_INT >= 33) needed.add(Manifest.permission.POST_NOTIFICATIONS)
        permLauncher.launch(needed.toTypedArray())
    }

    /** Delete any already-received messages from a number the user just blocked. */
    private fun deleteExistingFrom(number: String): Int {
        if (!isDefaultSmsApp()) return 0
        var count = 0
        runCatching {
            contentResolver.query(
                Telephony.Sms.CONTENT_URI,
                arrayOf(Telephony.Sms._ID, Telephony.Sms.ADDRESS),
                null, null, null
            )?.use { c ->
                val idIdx = c.getColumnIndexOrThrow(Telephony.Sms._ID)
                val addrIdx = c.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)
                val target = BlockStore.normalize(number)
                while (c.moveToNext()) {
                    val addr = c.getString(addrIdx) ?: continue
                    val a = BlockStore.normalize(addr)
                    val match = a == target ||
                        (minOf(a.length, target.length) >= 8 &&
                            (a.endsWith(target) || target.endsWith(a)))
                    if (match) {
                        val id = c.getLong(idIdx)
                        count += contentResolver.delete(
                            Telephony.Sms.CONTENT_URI,
                            "${Telephony.Sms._ID}=?",
                            arrayOf(id.toString())
                        )
                    }
                }
            }
        }
        return count
    }

    private fun readInbox(): List<Msg> {
        val out = mutableListOf<Msg>()
        runCatching {
            contentResolver.query(
                Telephony.Sms.Inbox.CONTENT_URI,
                arrayOf(Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE),
                null, null, "${Telephony.Sms.DATE} DESC"
            )?.use { c ->
                val a = c.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)
                val body = c.getColumnIndexOrThrow(Telephony.Sms.BODY)
                val d = c.getColumnIndexOrThrow(Telephony.Sms.DATE)
                while (c.moveToNext() && out.size < 200) {
                    out.add(Msg(c.getString(a) ?: "", c.getString(body) ?: "", c.getLong(d)))
                }
            }
        }
        return out
    }

    private fun refresh() {
        val isDefault = isDefaultSmsApp()
        b.tvStatus.text = if (isDefault)
            "✅ 기본 메시지 앱으로 설정됨 — 차단 번호 문자는 저장되지 않습니다."
        else
            "⚠️ 아직 기본 메시지 앱이 아닙니다. 아래 버튼으로 설정하세요."
        b.btnDefault.text = if (isDefault) "권한 다시 확인" else "기본 메시지 앱으로 설정"

        blockedAdapter.submit(BlockStore.getBlocked(this))

        if (showingInbox) {
            b.btnInbox.alpha = 1f; b.btnLog.alpha = 0.5f
            b.tvListTitle.text = "받은 문자"
            messageAdapter.submit(readInbox())
        } else {
            b.btnInbox.alpha = 0.5f; b.btnLog.alpha = 1f
            val log = BlockStore.getBlockedLog(this)
            b.tvListTitle.text = "차단된 문자 (${log.size}) · 길게 눌러 기록 삭제"
            messageAdapter.submit(log)
        }
    }

    private fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
}
