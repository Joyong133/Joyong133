package com.joyong.smsblocker

import android.os.Bundle
import android.view.MenuItem
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.isVisible
import androidx.recyclerview.widget.LinearLayoutManager
import com.joyong.smsblocker.databinding.ActivityBlockedBinding

/** Manage blocked numbers and review the private log of dropped messages. */
class BlockedActivity : AppCompatActivity() {

    private lateinit var b: ActivityBlockedBinding
    private lateinit var blockedAdapter: BlockedAdapter
    private val logAdapter = MessageAdapter()

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
            b.etNumber.setText("")
            Ui.toast(this, if (removed > 0) "차단했습니다 · 기존 문자 ${removed}건 삭제" else "차단했습니다")
            refresh()
        }

        b.btnClearLog.setOnClickListener {
            AlertDialog.Builder(this)
                .setMessage("차단된 문자 기록을 모두 지울까요?")
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
    }

    private fun refresh() {
        val blocked = BlockStore.getBlocked(this)
        blockedAdapter.submit(blocked)
        b.tvBlockedEmpty.isVisible = blocked.isEmpty()

        val log = BlockStore.getBlockedLog(this)
        logAdapter.submit(log)
        b.tvLogTitle.text = "숨겨진 문자 (${log.size})"
        b.tvLogEmpty.isVisible = log.isEmpty()
        b.btnClearLog.isVisible = log.isNotEmpty()
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        if (item.itemId == android.R.id.home) {
            finish()
            return true
        }
        return super.onOptionsItemSelected(item)
    }
}
