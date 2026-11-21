package com.joyong.smsblocker

import android.content.res.ColorStateList
import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.core.view.isVisible
import androidx.recyclerview.widget.RecyclerView
import com.joyong.smsblocker.databinding.ItemSuggestionBinding

/** A recipient candidate while typing a new message. */
data class Suggestion(val name: String?, val number: String)

class SuggestionAdapter(
    private val onPick: (Suggestion) -> Unit
) : RecyclerView.Adapter<SuggestionAdapter.VH>() {

    private val items = mutableListOf<Suggestion>()

    fun submit(list: List<Suggestion>) {
        items.clear()
        items.addAll(list)
        notifyDataSetChanged()
    }

    class VH(val b: ItemSuggestionBinding) : RecyclerView.ViewHolder(b.root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) =
        VH(ItemSuggestionBinding.inflate(LayoutInflater.from(parent.context), parent, false))

    override fun onBindViewHolder(holder: VH, position: Int) {
        val s = items[position]
        val b = holder.b
        b.tvSugName.text = s.name ?: s.number
        b.tvSugNumber.text = s.number
        b.tvSugNumber.isVisible = s.name != null
        b.avatar.backgroundTintList = ColorStateList.valueOf(Ui.avatarColor(s.number))
        val initial = s.name?.firstOrNull()?.takeIf { it.isLetter() }
        b.tvInitial.text = initial?.toString().orEmpty()
        b.tvInitial.isVisible = initial != null
        b.ivPerson.isVisible = initial == null
        holder.itemView.setOnClickListener { onPick(s) }
    }

    override fun getItemCount() = items.size
}
