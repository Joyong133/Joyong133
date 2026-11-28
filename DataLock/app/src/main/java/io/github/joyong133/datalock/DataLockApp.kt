package io.github.joyong133.datalock

import android.app.Application
import io.github.joyong133.datalock.core.BlockState
import io.github.joyong133.datalock.core.Notifications
import io.github.joyong133.datalock.core.Store

class DataLockApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Notifications.createChannels(this)
        BlockState.init(Store.get(this))
    }
}
