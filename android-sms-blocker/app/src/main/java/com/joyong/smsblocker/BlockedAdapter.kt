package com.joyong.smsblocker

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.joyong.smsblocker.databinding.ItemBlockedBinding

class BlockedAdapter(
    private val onDelete: (String) -> Unit
) : RecyclerView.Adapter<BlockedAdapter.VH>() {

    private val items = mutableListOf<String>()

    fun submit(list: List<String>) {
        items.clear()
        items.addAll(list)
        notifyDataSetChanged()
    }

    inner class VH(val b: ItemBlockedBinding) : RecyclerView.ViewHolder(b.root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val b = ItemBlockedBinding.inflate(
            LayoutInflater.from(parent.context), parent, false
        )
        return VH(b)
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val number = items[position]
        holder.b.tvNumber.text = number
        holder.b.btnDelete.setOnClickListener { onDelete(number) }
    }

    override fun getItemCount() = items.size
}
