package com.joyong.smsblocker

import android.view.LayoutInflater
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat
import androidx.core.view.isVisible
import androidx.recyclerview.widget.RecyclerView
import com.joyong.smsblocker.databinding.ItemDayBinding
import com.joyong.smsblocker.databinding.ItemMsgInBinding
import com.joyong.smsblocker.databinding.ItemMsgOutBinding

/** Chat bubbles (incoming left, outgoing right) with a date header per day. */
class ChatAdapter(
    private val onLongPress: (ChatMsg) -> Unit,
    private val onFailedTap: (ChatMsg) -> Unit,
    private val onOpenPart: (StoredPart) -> Unit
) : RecyclerView.Adapter<RecyclerView.ViewHolder>() {

    private sealed class Row {
        class Day(val date: Long) : Row()
        class Bubble(val m: ChatMsg) : Row()
    }

    private val rows = mutableListOf<Row>()

    fun submit(msgs: List<ChatMsg>) {
        rows.clear()
        var last = 0L
        for (m in msgs) {
            if (rows.isEmpty() || !Ui.sameDay(last, m.date)) rows.add(Row.Day(m.date))
            rows.add(Row.Bubble(m))
            last = m.date
        }
        notifyDataSetChanged()
    }

    private class DayVH(val b: ItemDayBinding) : RecyclerView.ViewHolder(b.root)
    private class InVH(val b: ItemMsgInBinding) : RecyclerView.ViewHolder(b.root)
    private class OutVH(val b: ItemMsgOutBinding) : RecyclerView.ViewHolder(b.root)

    override fun getItemViewType(position: Int): Int = when (val r = rows[position]) {
        is Row.Day -> TYPE_DAY
        is Row.Bubble -> if (r.m.outgoing) TYPE_OUT else TYPE_IN
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RecyclerView.ViewHolder {
        val inf = LayoutInflater.from(parent.context)
        return when (viewType) {
            TYPE_DAY -> DayVH(ItemDayBinding.inflate(inf, parent, false))
            TYPE_IN -> InVH(ItemMsgInBinding.inflate(inf, parent, false))
            else -> OutVH(ItemMsgOutBinding.inflate(inf, parent, false))
        }
    }

    override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
        val ctx = holder.itemView.context
        when (holder) {
            is DayVH -> holder.b.tvDay.text = Ui.dayHeader(ctx, (rows[position] as Row.Day).date)
            is InVH -> {
                val m = (rows[position] as Row.Bubble).m
                holder.b.tvBody.text = m.body
                holder.b.tvBody.isVisible = m.body.isNotEmpty()
                holder.b.tvTime.text = Ui.bubbleTime(ctx, m.date)
                holder.b.tvBody.setOnLongClickListener { onLongPress(m); true }
                bindAttachments(holder.b.attachments, m)
            }
            is OutVH -> {
                val m = (rows[position] as Row.Bubble).m
                val failed = m.status == ChatMsg.FAILED
                holder.b.tvBody.text = m.body
                holder.b.tvBody.isVisible = m.body.isNotEmpty()
                bindAttachments(holder.b.attachments, m)
                holder.b.tvTime.text = when (m.status) {
                    ChatMsg.SENDING -> "전송 중…"
                    ChatMsg.FAILED -> if (m.mms) "전송 실패" else "전송 실패 · 눌러서 다시 보내기"
                    else -> Ui.bubbleTime(ctx, m.date)
                }
                holder.b.tvTime.setTextColor(
                    ContextCompat.getColor(ctx, if (failed) R.color.error else R.color.text_secondary)
                )
                holder.b.tvBody.alpha = if (failed) 0.6f else 1f
                holder.b.tvBody.setOnLongClickListener { onLongPress(m); true }
                if (failed && !m.mms) {
                    holder.b.tvBody.setOnClickListener { onFailedTap(m) }
                    holder.b.tvTime.setOnClickListener { onFailedTap(m) }
                } else {
                    holder.b.tvBody.setOnClickListener(null)
                    holder.b.tvTime.setOnClickListener(null)
                }
            }
        }
    }

    /** Photos as thumbnails, other files as tappable "📎 name" chips. */
    private fun bindAttachments(box: LinearLayout, m: ChatMsg) {
        box.removeAllViews()
        box.isVisible = m.parts.isNotEmpty()
        val ctx = box.context
        val dp = ctx.resources.displayMetrics.density
        for (part in m.parts) {
            val v = if (part.isImage) {
                ImageView(ctx).apply {
                    adjustViewBounds = true
                    maxWidth = (220 * dp).toInt()
                    maxHeight = (300 * dp).toInt()
                    minimumWidth = (80 * dp).toInt()
                    minimumHeight = (80 * dp).toInt()
                    scaleType = ImageView.ScaleType.FIT_CENTER
                    contentDescription = "사진"
                    MmsMedia.load(this, part.uri)
                }
            } else {
                TextView(ctx).apply {
                    text = "📎 ${part.name ?: "파일"}"
                    textSize = 14f
                    setBackgroundResource(R.drawable.bg_day)
                    setPadding((12 * dp).toInt(), (8 * dp).toInt(), (12 * dp).toInt(), (8 * dp).toInt())
                }
            }
            v.setOnClickListener { onOpenPart(part) }
            v.setOnLongClickListener { onLongPress(m); true }
            box.addView(
                v,
                LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply { bottomMargin = (4 * dp).toInt() }
            )
        }
    }

    override fun getItemCount() = rows.size

    private companion object {
        const val TYPE_DAY = 0
        const val TYPE_IN = 1
        const val TYPE_OUT = 2
    }
}
