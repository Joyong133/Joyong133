package io.github.joyong133.datalock.ui

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.LruCache
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.graphics.drawable.toBitmap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.text.Collator
import java.util.Locale

private const val PLAY_SERVICES = "com.google.android.gms"

private data class AppEntry(val packageName: String, val label: String)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppsScreen(
    locked: Boolean,
    selected: Set<String>,
    onToggle: (String, Boolean) -> Unit,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val apps by produceState<List<AppEntry>?>(initialValue = null) {
        value = withContext(Dispatchers.IO) { loadLaunchableApps(context) }
    }
    val playServicesInstalled = remember { isInstalled(context, PLAY_SERVICES) }
    var query by rememberSaveable { mutableStateOf("") }

    // Sorted once: apps that were allowed when the screen opened come first, so rows don't
    // jump around while they are being ticked.
    val initiallySelected = remember { selected }
    val sorted = remember(apps) {
        val collator = Collator.getInstance(Locale.KOREAN)
        apps?.sortedWith(
            compareByDescending<AppEntry> { it.packageName in initiallySelected }.thenBy(collator) { it.label },
        )
    }
    val needle = query.trim()
    val visible = remember(sorted, needle) {
        if (needle.isEmpty()) {
            sorted
        } else {
            sorted?.filter { it.label.contains(needle, ignoreCase = true) || it.packageName.contains(needle, ignoreCase = true) }
        }
    }
    val showPlayServices = playServicesInstalled &&
        (needle.isEmpty() || listOf("google", "play", "구글", "푸시", "알림").any { it.contains(needle, ignoreCase = true) || needle.contains(it, ignoreCase = true) })

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("허용할 앱") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "뒤로")
                    }
                },
            )
        },
    ) { padding ->
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(
                top = padding.calculateTopPadding(),
                bottom = padding.calculateBottomPadding() + 24.dp,
            ),
        ) {
            item {
                Column(
                    Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    if (locked) LockedBanner()
                    Text(
                        "여기서 고른 앱은 차단 중에도 인터넷을 쓸 수 있어요. 꼭 필요한 앱만 골라 주세요.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    OutlinedTextField(
                        value = query,
                        onValueChange = { query = it },
                        modifier = Modifier.fillMaxWidth(),
                        placeholder = { Text("앱 이름으로 찾기") },
                        leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = null) },
                        trailingIcon = {
                            if (query.isNotEmpty()) {
                                IconButton(onClick = { query = "" }) {
                                    Icon(Icons.Rounded.Close, contentDescription = "검색어 지우기")
                                }
                            }
                        },
                        singleLine = true,
                        shape = RoundedCornerShape(16.dp),
                    )
                }
            }
            if (showPlayServices) {
                item(key = PLAY_SERVICES) {
                    AppRow(
                        packageName = PLAY_SERVICES,
                        title = "Google Play 서비스 (푸시 알림)",
                        subtitle = "허용하면 다른 앱의 푸시 알림(새 메시지 알림 등)이 계속 올 수 있어요. 알림을 눌러 앱을 열어도 인터넷은 여전히 안 돼요.",
                        checked = PLAY_SERVICES in selected,
                        enabled = !locked,
                        onToggle = onToggle,
                        subtitleLines = 3,
                    )
                }
            }
            val list = visible
            when {
                list == null -> item {
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .padding(32.dp),
                        contentAlignment = Alignment.Center,
                    ) { CircularProgressIndicator() }
                }
                list.isEmpty() -> item {
                    Text(
                        "찾는 앱이 없어요.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 24.dp),
                    )
                }
                else -> items(list, key = { it.packageName }) { app ->
                    AppRow(
                        packageName = app.packageName,
                        title = app.label,
                        subtitle = app.packageName,
                        checked = app.packageName in selected,
                        enabled = !locked,
                        onToggle = onToggle,
                    )
                }
            }
        }
    }
}

@Composable
private fun LockedBanner() {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.secondaryContainer)
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Rounded.Lock, contentDescription = null, tint = MaterialTheme.colorScheme.onSecondaryContainer)
        Spacer(Modifier.width(10.dp))
        Text(
            "차단 중에는 바꿀 수 없어요. 30초 꾹 눌러 푼 다음에 바꿔 주세요.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSecondaryContainer,
            fontWeight = FontWeight.Medium,
        )
    }
}

@Composable
private fun AppRow(
    packageName: String,
    title: String,
    subtitle: String,
    checked: Boolean,
    enabled: Boolean,
    onToggle: (String, Boolean) -> Unit,
    subtitleLines: Int = 1,
) {
    ListItem(
        headlineContent = { Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        supportingContent = {
            Text(
                subtitle,
                maxLines = subtitleLines,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.bodySmall,
            )
        },
        leadingContent = { AppIcon(packageName) },
        trailingContent = { Checkbox(checked = checked, onCheckedChange = null, enabled = enabled) },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier
            .padding(horizontal = 4.dp)
            .toggleable(
                value = checked,
                enabled = enabled,
                role = Role.Checkbox,
                onValueChange = { onToggle(packageName, it) },
            ),
    )
}

@Composable
private fun AppIcon(packageName: String) {
    val context = LocalContext.current
    val icon by produceState(IconCache.get(packageName), packageName) {
        if (value == null) value = withContext(Dispatchers.IO) { IconCache.load(context, packageName) }
    }
    Box(Modifier.size(40.dp), contentAlignment = Alignment.Center) {
        icon?.let { Image(it, contentDescription = null, modifier = Modifier.size(40.dp)) }
    }
}

private object IconCache {
    private val cache = LruCache<String, ImageBitmap>(256)

    fun get(packageName: String): ImageBitmap? = cache.get(packageName)

    fun load(context: Context, packageName: String): ImageBitmap? = try {
        context.packageManager.getApplicationIcon(packageName)
            .toBitmap(width = 96, height = 96)
            .asImageBitmap()
            .also { cache.put(packageName, it) }
    } catch (_: PackageManager.NameNotFoundException) {
        null
    }
}

private fun isInstalled(context: Context, packageName: String): Boolean = try {
    context.packageManager.getApplicationInfo(packageName, 0)
    true
} catch (_: PackageManager.NameNotFoundException) {
    false
}

private fun loadLaunchableApps(context: Context): List<AppEntry> {
    val pm = context.packageManager
    val launcher = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
    val resolved = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        pm.queryIntentActivities(launcher, PackageManager.ResolveInfoFlags.of(0L))
    } else {
        @Suppress("DEPRECATION")
        pm.queryIntentActivities(launcher, 0)
    }
    return resolved.asSequence()
        .map { it.activityInfo.applicationInfo }
        // Play services has its own row above the list (and a duplicate key would crash it).
        .filter { it.packageName != context.packageName && it.packageName != PLAY_SERVICES }
        .distinctBy { it.packageName }
        .map { AppEntry(it.packageName, it.loadLabel(pm).toString()) }
        .toList()
}
