package com.joyong.smsblocker

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.RecyclerView
import com.joyong.smsblocker.databinding.ItemDayBinding
import com.joyong.smsblocker.databinding.ItemMsgInBinding
import com.joyong.smsblocker.databinding.ItemMsgOutBinding

/** Chat bubbles (incoming left, outgoing right) with a date header per day. */
class ChatAdapter(
    private val onLongPress: (String) -> Unit
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
                holder.b.tvTime.text = Ui.bubbleTime(ctx, m.date)
                holder.b.tvBody.setOnLongClickListener { onLongPress(m.body); true }
            }
            is OutVH -> {
                val m = (rows[position] as Row.Bubble).m
                holder.b.tvBody.text = m.body
                holder.b.tvTime.text = when (m.status) {
                    ChatMsg.SENDING -> "전송 중…"
                    ChatMsg.FAILED -> "전송 실패"
                    else -> Ui.bubbleTime(ctx, m.date)
                }
                holder.b.tvTime.setTextColor(
                    ContextCompat.getColor(
                        ctx, if (m.status == ChatMsg.FAILED) R.color.error else R.color.text_secondary
                    )
                )
                holder.b.tvBody.setOnLongClickListener { onLongPress(m.body); true }
            }
        }
    }

    override fun getItemCount() = rows.size

    private companion object {
        const val TYPE_DAY = 0
        const val TYPE_IN = 1
        const val TYPE_OUT = 2
    }
}
