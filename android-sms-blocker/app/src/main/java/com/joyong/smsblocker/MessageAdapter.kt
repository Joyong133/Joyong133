package com.joyong.smsblocker

import android.text.format.DateUtils
import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.joyong.smsblocker.databinding.ItemMessageBinding

class MessageAdapter : RecyclerView.Adapter<MessageAdapter.VH>() {

    private val items = mutableListOf<Msg>()

    fun submit(list: List<Msg>) {
        items.clear()
        items.addAll(list)
        notifyDataSetChanged()
    }

    inner class VH(val b: ItemMessageBinding) : RecyclerView.ViewHolder(b.root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val b = ItemMessageBinding.inflate(
            LayoutInflater.from(parent.context), parent, false
        )
        return VH(b)
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val m = items[position]
        holder.b.tvAddress.text = m.address.ifEmpty { "(번호 없음)" }
        holder.b.tvBody.text = m.body
        holder.b.tvDate.text = DateUtils.getRelativeTimeSpanString(m.date)
    }

    override fun getItemCount() = items.size
}
