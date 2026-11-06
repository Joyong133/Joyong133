package com.joyong.onefocus

import android.app.Activity
import android.app.AlertDialog
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.drawable.Drawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.text.Editable
import android.text.TextWatcher
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.BaseAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ListView
import android.widget.ProgressBar
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.TextView
import android.widget.Toast

class MainActivity : Activity() {

    companion object {
        const val EXTRA_DONE = "done"
    }

    private data class AppEntry(val pkg: String, val label: String, val icon: Drawable)

    private val handler = Handler(Looper.getMainLooper())

    private lateinit var permStatus: TextView
    private lateinit var permHelp: TextView
    private lateinit var permBtn: Button
    private lateinit var restrictBtn: Button
    private lateinit var setupCard: View
    private lateinit var appIcon: ImageView
    private lateinit var appName: TextView
    private lateinit var modeGroup: RadioGroup
    private lateinit var modeTaps: RadioButton
    private lateinit var modeTimer: RadioButton
    private lateinit var tapsRow: View
    private lateinit var timerRow: View
    private lateinit var tapsInput: EditText
    private lateinit var minutesInput: EditText
    private lateinit var startBtn: Button
    private lateinit var activeCard: View
    private lateinit var activeText: TextView

    private var selectedPkg: String? = null
    private var selectedLabel: String? = null

    private val uiTicker = object : Runnable {
        override fun run() {
            updateUi()
            handler.postDelayed(this, 1000)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        permStatus = findViewById(R.id.permStatus)
        permHelp = findViewById(R.id.permHelp)
        permBtn = findViewById(R.id.permBtn)
        restrictBtn = findViewById(R.id.restrictBtn)
        setupCard = findViewById(R.id.setupCard)
        appIcon = findViewById(R.id.appIcon)
        appName = findViewById(R.id.appName)
        modeGroup = findViewById(R.id.modeGroup)
        modeTaps = findViewById(R.id.modeTaps)
        modeTimer = findViewById(R.id.modeTimer)
        tapsRow = findViewById(R.id.tapsRow)
        timerRow = findViewById(R.id.timerRow)
        tapsInput = findViewById(R.id.tapsInput)
        minutesInput = findViewById(R.id.minutesInput)
        startBtn = findViewById(R.id.startBtn)
        activeCard = findViewById(R.id.activeCard)
        activeText = findViewById(R.id.activeText)

        // 지난번 설정 불러오기
        Session.target(this)?.let { pkg ->
            if (packageManager.getLaunchIntentForPackage(pkg) != null) setSelected(pkg, Session.label(this))
        }
        tapsInput.setText(Session.goalTaps(this).toString())
        minutesInput.setText(Session.minutes(this).toString())
        if (Session.mode(this) == Session.MODE_TIMER) modeTimer.isChecked = true else modeTaps.isChecked = true
        applyModeRows()

        modeGroup.setOnCheckedChangeListener { _, _ -> applyModeRows() }
        findViewById<View>(R.id.pickRow).setOnClickListener { showAppPicker() }
        permBtn.setOnClickListener {
            try {
                startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
            } catch (_: Exception) {
                startActivity(Intent(Settings.ACTION_SETTINGS))
            }
        }
        restrictBtn.setOnClickListener {
            startActivity(
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", packageName, null))
            )
        }
        startBtn.setOnClickListener { confirmStart() }
        findViewById<View>(R.id.returnBtn).setOnClickListener {
            FocusService.instance?.launchTarget(force = true)
        }

        handleDone(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleDone(intent)
    }

    override fun onResume() {
        super.onResume()
        handler.post(uiTicker)
    }

    override fun onPause() {
        super.onPause()
        handler.removeCallbacks(uiTicker)
    }

    private fun handleDone(intent: Intent?) {
        if (intent?.getBooleanExtra(EXTRA_DONE, false) != true) return
        intent.removeExtra(EXTRA_DONE)
        AlertDialog.Builder(this)
            .setTitle("🎉 집중 완료!")
            .setMessage("목표를 다 채웠어요. 이제 다른 앱을 자유롭게 쓸 수 있습니다.")
            .setPositiveButton("확인", null)
            .show()
    }

    private fun applyModeRows() {
        val taps = modeTaps.isChecked
        tapsRow.visibility = if (taps) View.VISIBLE else View.GONE
        timerRow.visibility = if (taps) View.GONE else View.VISIBLE
    }

    private fun isServiceEnabled(): Boolean {
        if (FocusService.instance != null) return true
        val enabled = Settings.Secure.getString(contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
        val me = ComponentName(this, FocusService::class.java)
        return enabled.split(':').any { ComponentName.unflattenFromString(it) == me }
    }

    private fun updateUi() {
        val enabled = isServiceEnabled()
        if (enabled) {
            permStatus.text = "✅ 잠금 기능(접근성) 켜짐"
            permHelp.text = "준비 완료! 아래에서 앱과 조건을 고르고 시작하세요."
            permBtn.visibility = View.GONE
            restrictBtn.visibility = View.GONE
        } else {
            permStatus.text = "⚠️ 잠금 기능(접근성)을 켜야 해요"
            val sb = StringBuilder()
            sb.append("① ‘접근성 설정 열기’ → 설치된 앱(또는 설치된 서비스) → ‘원앱 집중 잠금’을 켜세요.")
            if (Build.VERSION.SDK_INT >= 33) {
                sb.append("\n\n‘제한된 설정’이라며 켜지지 않으면: ‘앱 정보 열기’ → 오른쪽 위 ⋮ → ‘제한된 설정 허용’을 누른 뒤 다시 켜세요.")
            }
            permHelp.text = sb.toString()
            permBtn.visibility = View.VISIBLE
            restrictBtn.visibility = if (Build.VERSION.SDK_INT >= 33) View.VISIBLE else View.GONE
        }

        val active = Session.isActive(this)
        setupCard.visibility = if (active) View.GONE else View.VISIBLE
        activeCard.visibility = if (active) View.VISIBLE else View.GONE
        if (active) {
            activeText.text = "🔒 「${Session.label(this)}」 집중 중\n${Session.progressText(this)}"
        }
    }

    private fun setSelected(pkg: String, label: String) {
        selectedPkg = pkg
        selectedLabel = label
        appName.text = label
        try {
            appIcon.setImageDrawable(packageManager.getApplicationIcon(pkg))
        } catch (_: PackageManager.NameNotFoundException) {
        }
    }

    // ───────────────────────── 앱 선택 ─────────────────────────

    private fun dp(v: Float): Int =
        TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, resources.displayMetrics).toInt()

    private fun showAppPicker() {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16f), dp(8f), dp(16f), 0)
        }
        val search = EditText(this).apply {
            hint = "🔍 앱 이름 검색"
            setSingleLine()
        }
        val loading = ProgressBar(this)
        val list = ListView(this)
        root.addView(search)
        root.addView(loading, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { gravity = Gravity.CENTER; topMargin = dp(24f); bottomMargin = dp(24f) })
        root.addView(list, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(420f)))
        list.visibility = View.GONE

        val dialog = AlertDialog.Builder(this)
            .setTitle("집중할 앱 선택")
            .setView(root)
            .setNegativeButton("취소", null)
            .create()

        val all = ArrayList<AppEntry>()
        val shown = ArrayList<AppEntry>()
        val adapter = object : BaseAdapter() {
            override fun getCount() = shown.size
            override fun getItem(position: Int) = shown[position]
            override fun getItemId(position: Int) = position.toLong()
            override fun getView(position: Int, convertView: View?, parent: ViewGroup?): View {
                val row = (convertView as? LinearLayout) ?: LinearLayout(this@MainActivity).apply {
                    orientation = LinearLayout.HORIZONTAL
                    gravity = Gravity.CENTER_VERTICAL
                    setPadding(dp(4f), dp(8f), dp(4f), dp(8f))
                    addView(ImageView(context), LinearLayout.LayoutParams(dp(40f), dp(40f)))
                    addView(TextView(context).apply {
                        textSize = 16f
                        setPadding(dp(14f), 0, 0, 0)
                        setTextColor(0xFF1D1B24.toInt())
                    })
                }
                val e = shown[position]
                (row.getChildAt(0) as ImageView).setImageDrawable(e.icon)
                (row.getChildAt(1) as TextView).text = e.label
                return row
            }
        }
        list.adapter = adapter
        list.setOnItemClickListener { _, _, position, _ ->
            val e = shown[position]
            setSelected(e.pkg, e.label)
            Session.remember(this, e.pkg, e.label)
            dialog.dismiss()
        }

        fun filter() {
            val q = search.text.toString().trim().lowercase()
            shown.clear()
            shown.addAll(if (q.isEmpty()) all else all.filter { it.label.lowercase().contains(q) || it.pkg.contains(q) })
            adapter.notifyDataSetChanged()
        }
        search.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) = filter()
        })

        dialog.show()

        Thread {
            val pm = packageManager
            val query = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
            @Suppress("DEPRECATION")
            val apps = pm.queryIntentActivities(query, 0)
                .asSequence()
                .filter { it.activityInfo.packageName != packageName }
                .distinctBy { it.activityInfo.packageName }
                .map { AppEntry(it.activityInfo.packageName, it.loadLabel(pm).toString(), it.loadIcon(pm)) }
                .sortedBy { it.label.lowercase() }
                .toList()
            runOnUiThread {
                all.clear()
                all.addAll(apps)
                loading.visibility = View.GONE
                list.visibility = View.VISIBLE
                filter()
            }
        }.start()
    }

    // ───────────────────────── 시작 ─────────────────────────

    private fun confirmStart() {
        val pkg = selectedPkg
        val label = selectedLabel
        if (pkg == null || label == null) {
            Toast.makeText(this, "먼저 집중할 앱을 선택하세요.", Toast.LENGTH_SHORT).show()
            showAppPicker()
            return
        }
        if (FocusService.instance == null) {
            Toast.makeText(this, "먼저 접근성 설정에서 ‘원앱 집중 잠금’을 켜 주세요.", Toast.LENGTH_LONG).show()
            return
        }
        if (packageManager.getLaunchIntentForPackage(pkg) == null) {
            Toast.makeText(this, "이 앱을 실행할 수 없어요. 다른 앱을 골라 주세요.", Toast.LENGTH_LONG).show()
            return
        }

        val mode = if (modeTaps.isChecked) Session.MODE_TAPS else Session.MODE_TIMER
        val goalTaps = tapsInput.text.toString().toIntOrNull() ?: 0
        val minutes = minutesInput.text.toString().toIntOrNull() ?: 0
        if (mode == Session.MODE_TAPS && goalTaps !in 1..100000) {
            Toast.makeText(this, "탭 횟수는 1 ~ 100000 사이로 입력하세요.", Toast.LENGTH_SHORT).show()
            return
        }
        if (mode == Session.MODE_TIMER && minutes !in 1..1440) {
            Toast.makeText(this, "시간은 1 ~ 1440분(24시간) 사이로 입력하세요.", Toast.LENGTH_SHORT).show()
            return
        }

        val goalText = if (mode == Session.MODE_TAPS) "화면을 ${goalTaps}번 탭할 때까지" else "${minutes}분 동안"
        AlertDialog.Builder(this)
            .setTitle("집중을 시작할까요?")
            .setMessage(
                "$goalText 「$label」만 쓸 수 있어요.\n\n" +
                    "• 홈, 최근 앱, 다른 앱 실행이 막힙니다\n" +
                    "• 앱을 나가면 바로 다시 열립니다\n" +
                    "• 중간에 멈출 수 없습니다"
            )
            .setNegativeButton("취소", null)
            .setPositiveButton("시작") { _, _ ->
                Session.start(
                    this, pkg, label, mode,
                    if (mode == Session.MODE_TAPS) goalTaps else Session.goalTaps(this),
                    if (mode == Session.MODE_TIMER) minutes else Session.minutes(this),
                )
                FocusService.instance?.refresh()
                updateUi()
            }
            .show()
    }
}
