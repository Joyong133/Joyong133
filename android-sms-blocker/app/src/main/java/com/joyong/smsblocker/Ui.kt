package com.joyong.smsblocker

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.provider.ContactsContract
import android.provider.Settings
import android.provider.Telephony
import android.text.InputType
import android.text.format.DateUtils
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import java.util.Calendar
import java.util.concurrent.Executors

object Ui {
    private val bg = Executors.newSingleThreadExecutor()

    /** Run [work] off the main thread, then [done] on it if the activity is still alive. */
    fun <T : Any> load(activity: Activity, work: () -> T, done: (T) -> Unit) {
        bg.execute {
            val result = runCatching { work() }.getOrNull() ?: return@execute
            activity.runOnUiThread {
                if (!activity.isFinishing && !activity.isDestroyed) done(result)
            }
        }
    }

    fun isDefaultSmsApp(ctx: Context): Boolean =
        Telephony.Sms.getDefaultSmsPackage(ctx) == ctx.packageName

    fun toast(ctx: Context, msg: String) = Toast.makeText(ctx, msg, Toast.LENGTH_SHORT).show()

    // ---- time formatting ----

    fun sameDay(a: Long, b: Long): Boolean {
        val x = Calendar.getInstance().apply { timeInMillis = a }
        val y = Calendar.getInstance().apply { timeInMillis = b }
        return x.get(Calendar.YEAR) == y.get(Calendar.YEAR) &&
            x.get(Calendar.DAY_OF_YEAR) == y.get(Calendar.DAY_OF_YEAR)
    }

    fun listTime(ctx: Context, t: Long): String {
        val year = { ms: Long -> Calendar.getInstance().apply { timeInMillis = ms }.get(Calendar.YEAR) }
        val flags = when {
            DateUtils.isToday(t) -> DateUtils.FORMAT_SHOW_TIME
            year(t) == year(System.currentTimeMillis()) ->
                DateUtils.FORMAT_SHOW_DATE or DateUtils.FORMAT_NO_YEAR or DateUtils.FORMAT_ABBREV_MONTH
            else -> DateUtils.FORMAT_SHOW_DATE or DateUtils.FORMAT_NUMERIC_DATE
        }
        return DateUtils.formatDateTime(ctx, t, flags)
    }

    fun bubbleTime(ctx: Context, t: Long): String =
        DateUtils.formatDateTime(ctx, t, DateUtils.FORMAT_SHOW_TIME)

    fun dayHeader(ctx: Context, t: Long): String =
        DateUtils.formatDateTime(
            ctx, t,
            DateUtils.FORMAT_SHOW_DATE or DateUtils.FORMAT_SHOW_WEEKDAY or DateUtils.FORMAT_SHOW_YEAR
        )

    // ---- avatars ----

    private val palette = intArrayOf(
        Color.parseColor("#4F7DF3"), Color.parseColor("#E8743B"), Color.parseColor("#19A979"),
        Color.parseColor("#9B5DE5"), Color.parseColor("#D64570"), Color.parseColor("#2A9DB5"),
        Color.parseColor("#C08A1E"), Color.parseColor("#5C6BC0")
    )

    fun avatarColor(key: String): Int = palette[Math.floorMod(key.hashCode(), palette.size)]

    // ---- contacts ----

    /** System contact picker for phone numbers (needs no contacts permission). */
    fun pickPhoneIntent(): Intent =
        Intent(Intent.ACTION_PICK, ContactsContract.CommonDataKinds.Phone.CONTENT_URI)

    fun phoneFromPick(ctx: Context, uri: Uri?): String? {
        if (uri == null) return null
        return runCatching {
            ctx.contentResolver.query(
                uri, arrayOf(ContactsContract.CommonDataKinds.Phone.NUMBER), null, null, null
            )?.use { c -> if (c.moveToFirst()) c.getString(0) else null }
        }.getOrNull()?.trim()?.takeIf { it.isNotEmpty() }
    }

    // ---- dialogs ----

    /**
     * Ask for a recipient. [onPickContact], if given, adds a "연락처" button;
     * the caller launches the picker and handles the result.
     */
    fun askNumber(
        activity: Activity,
        title: String = "새 메시지",
        onOk: (String) -> Unit,
        onCancel: (() -> Unit)? = null,
        onPickContact: (() -> Unit)? = null
    ) {
        val input = EditText(activity).apply {
            inputType = InputType.TYPE_CLASS_PHONE
            hint = "받는 사람 전화번호"
        }
        val pad = (20 * activity.resources.displayMetrics.density).toInt()
        val box = FrameLayout(activity).apply {
            setPadding(pad, pad / 2, pad, 0)
            addView(input)
        }
        val builder = AlertDialog.Builder(activity)
            .setTitle(title)
            .setView(box)
            .setPositiveButton("확인") { _, _ ->
                val n = input.text.toString().trim()
                if (n.isNotEmpty()) onOk(n) else onCancel?.invoke()
            }
            .setNegativeButton("취소") { _, _ -> onCancel?.invoke() }
            .setOnCancelListener { onCancel?.invoke() }
        if (onPickContact != null) {
            builder.setNeutralButton("연락처") { _, _ -> onPickContact() }
        }
        builder.show()
    }

    fun confirmBlock(activity: Activity, address: String, done: () -> Unit) {
        AlertDialog.Builder(activity)
            .setTitle("$address 차단")
            .setMessage("이 번호와 주고받은 문자가 모두 삭제되고, 앞으로 오는 문자와 전화는 어디에도 나타나지 않습니다.")
            .setPositiveButton("차단") { _, _ ->
                BlockStore.addBlocked(activity, address)
                val removed = if (isDefaultSmsApp(activity)) SmsRepo.deleteFromAddress(activity, address) else 0
                CallLogCleaner.cleanAsync(activity)
                toast(activity, if (removed > 0) "차단했습니다 · 기존 문자 ${removed}건 삭제" else "차단했습니다")
                done()
            }
            .setNegativeButton("취소", null)
            .show()
    }

    /**
     * Android 13+ blocks sideloaded apps (installed from a file) from taking
     * "restricted" roles such as the default SMS app until the user allows
     * restricted settings for the app in App info.
     */
    fun showRestrictedHelp(activity: Activity, what: String = "기본 메시지 앱") {
        AlertDialog.Builder(activity)
            .setTitle("설정이 막혔나요?")
            .setMessage(
                "파일로 직접 설치한 앱은 안드로이드 보안 정책 때문에 '제한된 설정'을 먼저 허용해야 " +
                    "${what}이 될 수 있어요.\n\n" +
                    "1. 아래 [앱 정보 열기]를 누르세요\n" +
                    "2. 오른쪽 위 ⋮ 메뉴 → '제한된 설정 허용'\n" +
                    "3. 본인 인증 후 이 앱으로 돌아와 설정 버튼을 다시 누르세요\n\n" +
                    "※ ⋮ 메뉴에 항목이 없으면, 이 앱에서 설정을 한 번 시도해 거부 안내를 본 뒤 다시 확인하세요."
            )
            .setPositiveButton("앱 정보 열기") { _, _ ->
                activity.startActivity(
                    Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                        .setData(Uri.fromParts("package", activity.packageName, null))
                )
            }
            .setNegativeButton("닫기", null)
            .show()
    }
}
