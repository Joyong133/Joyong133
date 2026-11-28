package io.github.joyong133.datalock.tile

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import io.github.joyong133.datalock.MainActivity
import io.github.joyong133.datalock.R
import io.github.joyong133.datalock.core.BlockState

/**
 * Quick Settings tile. Tapping it while off starts blocking; tapping it while on only opens the
 * app, because turning blocking off always takes the 30-second hold.
 */
class BlockTileService : TileService() {

    override fun onStartListening() {
        super.onStartListening()
        refresh()
    }

    override fun onClick() {
        super.onClick()
        val active = BlockState.status.value.session != null
        val intent = Intent(this, MainActivity::class.java)
            .setAction(if (active) Intent.ACTION_MAIN else MainActivity.ACTION_QUICK_START)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        val launch = Runnable {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                startActivityAndCollapse(
                    PendingIntent.getActivity(
                        this,
                        1,
                        intent,
                        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
                    ),
                )
            } else {
                launchBeforeAndroid14(intent)
            }
        }
        if (isLocked) unlockAndRun(launch) else launch.run()
    }

    /** The PendingIntent overload only exists from Android 14; older versions need this one. */
    @SuppressLint("StartActivityAndCollapseDeprecated")
    @Suppress("DEPRECATION")
    private fun launchBeforeAndroid14(intent: Intent) {
        startActivityAndCollapse(intent)
    }

    private fun refresh() {
        val tile = qsTile ?: return
        val active = BlockState.status.value.session != null
        tile.state = if (active) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
        tile.label = getString(R.string.tile_label)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            tile.subtitle = if (active) "차단 중" else "꺼짐"
        }
        tile.updateTile()
    }

    companion object {
        fun requestRefresh(context: Context) {
            try {
                requestListeningState(context, ComponentName(context, BlockTileService::class.java))
            } catch (_: RuntimeException) {
                // The tile is not added; it refreshes itself when the panel opens.
            }
        }
    }
}
