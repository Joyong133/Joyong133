package io.github.joyong133.datalock.vpn

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Handler
import android.os.Looper
import android.util.Log

/** The network the phone would really use for app traffic. */
enum class Uplink {
    /** No network at all. */
    NONE,

    /** The phone's own mobile data (or something we can't identify: we stay blocked then). */
    MOBILE,

    /** Wi-Fi, Ethernet or another network that doesn't use this phone's data plan. */
    WIFI,
}

/**
 * Follows the phone's default network. Our own app is excluded from the VPN, so the default
 * network we see is always the physical one underneath the tunnel.
 */
internal class NetworkWatcher(context: Context, private val onChange: (Uplink) -> Unit) {
    private val connectivity = context.getSystemService(ConnectivityManager::class.java)
    private var last: Uplink? = null
    private var registered = false

    private val callback = object : ConnectivityManager.NetworkCallback() {
        override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
            deliver(uplinkOf(capabilities))
        }

        override fun onLost(network: Network) {
            deliver(Uplink.NONE)
        }
    }

    fun start() {
        if (registered) return
        try {
            connectivity.registerDefaultNetworkCallback(callback, Handler(Looper.getMainLooper()))
            registered = true
        } catch (e: RuntimeException) {
            // Too many callbacks or a missing permission: blocking simply stays engaged.
            Log.w("NetworkWatcher", "cannot watch networks", e)
        }
    }

    fun stop() {
        if (!registered) return
        registered = false
        try {
            connectivity.unregisterNetworkCallback(callback)
        } catch (_: IllegalArgumentException) {
        }
    }

    private fun deliver(uplink: Uplink) {
        if (!registered || uplink == last) return
        last = uplink
        onChange(uplink)
    }

    companion object {
        fun current(context: Context): Uplink {
            val connectivity = context.getSystemService(ConnectivityManager::class.java) ?: return Uplink.NONE
            val network = connectivity.activeNetwork ?: return Uplink.NONE
            val capabilities = connectivity.getNetworkCapabilities(network) ?: return Uplink.NONE
            return uplinkOf(capabilities)
        }

        fun uplinkOf(capabilities: NetworkCapabilities): Uplink = when {
            // Someone else's VPN: we can't tell what is underneath, so keep blocking.
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN) -> Uplink.MOBILE
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> Uplink.MOBILE
            else -> Uplink.WIFI
        }
    }
}
