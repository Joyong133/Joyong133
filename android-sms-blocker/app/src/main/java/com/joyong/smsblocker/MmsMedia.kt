package com.joyong.smsblocker

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.LruCache
import android.widget.ImageView
import java.io.File
import java.util.concurrent.Executors

/** Thumbnails for MMS photos and "open attachment" support. */
object MmsMedia {
    private val pool = Executors.newFixedThreadPool(2)
    private val cache = object : LruCache<String, Bitmap>(16 * 1024 * 1024) {
        override fun sizeOf(key: String, value: Bitmap) = value.byteCount
    }

    /** Decode [uri] scaled to about [maxPx] and show it in [view] (async, recycling-safe). */
    fun load(view: ImageView, uri: Uri, maxPx: Int = 720) {
        val key = "$uri@$maxPx"
        view.tag = key
        cache.get(key)?.let { view.setImageBitmap(it); return }
        view.setImageDrawable(null)
        val ctx = view.context.applicationContext
        pool.execute {
            val bmp = decode(ctx, uri, maxPx) ?: return@execute
            cache.put(key, bmp)
            view.post { if (view.tag == key) view.setImageBitmap(bmp) }
        }
    }

    fun decode(ctx: Context, uri: Uri, maxPx: Int): Bitmap? = runCatching {
        val cr = ctx.contentResolver
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        cr.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        var sample = 1
        while (bounds.outWidth / (sample * 2) >= maxPx || bounds.outHeight / (sample * 2) >= maxPx) sample *= 2
        cr.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample })
        }
    }.getOrNull()

    /**
     * Open an attachment in another app. MMS parts aren't readable by other
     * apps, so copy it to our cache and share that copy read-only.
     */
    fun open(activity: Activity, part: StoredPart) {
        val app = activity.applicationContext
        pool.execute {
            val shared = runCatching {
                val dir = File(app.cacheDir, "shared").apply { mkdirs() }
                val safe = (part.name ?: "file").replace(Regex("[\\\\/:\"*?<>|]"), "_")
                val f = File(dir, "${part.id}_$safe")
                if (!f.exists()) {
                    app.contentResolver.openInputStream(part.uri)?.use { i -> f.outputStream().use { i.copyTo(it) } }
                }
                MmsSender.shareUri(app, f)
            }.getOrNull()
            activity.runOnUiThread {
                if (activity.isFinishing || activity.isDestroyed) return@runOnUiThread
                if (shared == null) {
                    Ui.toast(activity, "파일을 열 수 없어요")
                    return@runOnUiThread
                }
                val view = Intent(Intent.ACTION_VIEW)
                    .setDataAndType(shared, part.contentType)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                try {
                    activity.startActivity(view)
                } catch (e: ActivityNotFoundException) {
                    Ui.toast(activity, "이 파일을 열 수 있는 앱이 없어요")
                }
            }
        }
    }
}
