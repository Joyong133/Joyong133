package com.joyong.smsblocker

import android.content.res.ColorStateList
import android.graphics.Typeface
import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.core.view.isVisible
import androidx.recyclerview.widget.RecyclerView
import com.joyong.smsblocker.databinding.ItemConversationBinding

class ConversationAdapter(
    private val onClick: (Conversation) -> Unit,
    private val onLongClick: (Conversation) -> Unit
) : RecyclerView.Adapter<ConversationAdapter.VH>() {

    private val items = mutableListOf<Conversation>()

    fun submit(list: List<Conversation>) {
        items.clear()
        items.addAll(list)
        notifyDataSetChanged()
    }

    class VH(val b: ItemConversationBinding) : RecyclerView.ViewHolder(b.root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) =
        VH(ItemConversationBinding.inflate(LayoutInflater.from(parent.context), parent, false))

    override fun onBindViewHolder(holder: VH, position: Int) {
        val c = items[position]
        val ctx = holder.itemView.context
        val b = holder.b
        val title = c.name ?: c.address.ifEmpty { "(번호 없음)" }

        b.tvName.text = title
        b.tvSnippet.text = if (c.lastOutgoing) "나: ${c.snippet}" else c.snippet
        b.tvTime.text = Ui.listTime(ctx, c.date)

        b.avatar.backgroundTintList = ColorStateList.valueOf(Ui.avatarColor(c.address))
        val initial = c.name?.firstOrNull()?.takeIf { it.isLetter() }
        b.tvInitial.text = initial?.toString().orEmpty()
        b.tvInitial.isVisible = initial != null
        b.ivPerson.isVisible = initial == null

        val unread = c.unread > 0
        b.tvName.setTypeface(null, if (unread) Typeface.BOLD else Typeface.NORMAL)
        b.tvSnippet.setTypeface(null, if (unread) Typeface.BOLD else Typeface.NORMAL)
        b.tvBadge.isVisible = unread
        b.tvBadge.text = if (c.unread > 99) "99+" else c.unread.toString()

        holder.itemView.setOnClickListener { onClick(c) }
        holder.itemView.setOnLongClickListener { onLongClick(c); true }
    }

    override fun getItemCount() = items.size
}
