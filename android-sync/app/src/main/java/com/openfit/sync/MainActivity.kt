package com.openfit.sync

import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.text.InputType
import android.view.View
import android.widget.*
import androidx.activity.ComponentActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.PermissionController
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.UUID

class MainActivity : ComponentActivity() {
    private lateinit var vault: Vault
    private lateinit var state: JSONObject
    private lateinit var content: LinearLayout
    private lateinit var statusText: TextView
    private val controls = mutableListOf<View>()
    private var busy = false
    private var syncJob: Job? = null
    private var permissions = emptySet<String>()
    private val ink = Color.rgb(240, 244, 246)
    private val muted = Color.rgb(152, 165, 176)
    private val accent = Color.rgb(155, 223, 191)
    private val permissionRequest = registerForActivityResult(PermissionController.createRequestPermissionResultContract()) {
        refreshPermissions()
    }
    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
    private fun save() = vault.save(state)
    private fun paired() = state.optString("token").isNotEmpty()
    private fun available() = HealthConnectClient.getSdkStatus(this) == HealthConnectClient.SDK_AVAILABLE

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        vault = Vault(this)
        state = try { vault.read() } catch (_: Exception) {
            vault.clear()
            JSONObject().put("notice", "Saved pairing could not be unlocked. Pair your VM again.")
        }
        if (!state.has("deviceId")) { state.put("deviceId", UUID.randomUUID().toString()); save() }
        render()
    }
    override fun onResume() { super.onResume(); if (::state.isInitialized && !busy) refreshPermissions() }
    override fun onStop() { syncJob?.cancel(); super.onStop() }
    private fun refreshPermissions() {
        lifecycleScope.launch {
            permissions = if (available()) runCatching { HealthConnectClient.getOrCreate(this@MainActivity).permissionController.getGrantedPermissions() }.getOrDefault(emptySet()) else emptySet()
            if (!busy) render()
        }
    }
    private fun text(value: String, size: Float = 14f, color: Int = ink, bold: Boolean = false) = TextView(this).apply {
        text = value; textSize = size; setTextColor(color)
        if (bold) setTypeface(typeface, Typeface.BOLD)
        setLineSpacing(dp(3).toFloat(), 1f)
    }
    private fun shape(fill: Int, radius: Int = 16) = GradientDrawable().apply {
        setColor(fill); cornerRadius = dp(radius).toFloat(); setStroke(dp(1), Color.rgb(43, 52, 61))
    }
    private fun column(parent: LinearLayout, card: Boolean = true) = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        if (card) { background = shape(Color.rgb(20, 26, 33)); setPadding(dp(18), dp(18), dp(18), dp(18)) }
        parent.addView(this, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(16) })
    }
    private fun LinearLayout.label(value: String, size: Float = 14f, color: Int = ink, bold: Boolean = false): TextView {
        val view = text(value, size, color, bold)
        addView(view, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(10) })
        return view
    }
    private fun LinearLayout.action(value: String, primary: Boolean = false, onClick: () -> Unit) = Button(this@MainActivity).apply {
        text = value; isAllCaps = false; textSize = 14f; minHeight = dp(48)
        setTextColor(if (primary) Color.rgb(15, 28, 23) else ink)
        background = shape(if (primary) accent else Color.rgb(31, 39, 48), 10)
        setPadding(dp(12), dp(10), dp(12), dp(10))
        setOnClickListener { onClick() }
        this@action.addView(this, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(8) })
        controls.add(this)
    }
    private fun LinearLayout.input(hint: String, value: String, type: Int): EditText = EditText(this@MainActivity).apply {
        this.hint = hint; setText(value); inputType = type; textSize = 15f; setTextColor(ink); setHintTextColor(muted)
        background = shape(Color.rgb(11, 17, 23), 8); setPadding(dp(12), dp(12), dp(12), dp(12)); setSingleLine(true)
        this@input.addView(this, LinearLayout.LayoutParams(-1, dp(52)).apply { bottomMargin = dp(12) })
        controls.add(this)
    }
    private fun setBusy(value: Boolean) { busy = value; controls.forEach { it.isEnabled = !value && (it.tag != "sync" || (available() && HealthSync.metrics.any { metric -> metric.permission in permissions })) } }
    private fun message(value: String, error: Boolean = false) { statusText.text = value; statusText.setTextColor(if (error) Color.rgb(255, 166, 166) else accent) }
    private fun render() {
        controls.clear()
        val scroll = ScrollView(this).apply { setBackgroundColor(Color.rgb(11, 14, 18)); isFillViewport = true }
        content = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(22), dp(26), dp(22), dp(24)) }
        scroll.addView(content)
        ViewCompat.setOnApplyWindowInsetsListener(scroll) { view, insets ->
            val safe = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            view.setPadding(safe.left, safe.top, safe.right, safe.bottom); insets
        }
        setContentView(scroll)
        content.label("OPENFIT  /  ANDROID", 11f, accent, true)
        content.label("Health, connected.", 29f, ink, true)
        content.label("Your phone → your private OpenFit VM", 14f, muted)
        val status = column(content)
        status.label(if (paired()) "Ready to sync" else "Connect your VM", 18f, ink, true)
        val lastSync = state.optString("lastSyncAt").takeIf { it.isNotEmpty() }?.let {
            runCatching { DateTimeFormatter.ofPattern("MMM d · h:mm a").withZone(ZoneId.systemDefault()).format(Instant.parse(it)) }.getOrDefault(it)
        }
        statusText = status.label(state.optString("notice").ifEmpty { if (lastSync != null) "Last synced $lastSync" else "Pair your VM, then allow Health Connect access." }, 13f, accent)
        if (paired()) {
            status.label(state.optString("name", "Your workspace"), 14f, muted)
            status.action("Sync now", true) { sync() }.apply { tag = "sync"; isEnabled = available() && HealthSync.metrics.any { it.permission in permissions } }
            status.label("Keep this screen open until sync finishes.", 12f, muted)
        }
        if (!paired()) {
            val card = column(content)
            card.label("1. Pair with OpenFit", 17f, ink, true)
            card.label("In Open Gym, open Settings → Account → Pair the mobile app. Enter that code here.", 13f, muted)
            card.action("Open pairing settings") { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://gym.129-225-66-175.sslip.io"))) }
            card.label("OpenFit API address", 12f, muted)
            val address = card.input("https://api.example.com", state.optString("apiUrl", "https://api.129-225-66-175.sslip.io"), InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI)
            card.label("Pairing code", 12f, muted)
            val code = card.input("Pairing code", "", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS)
            card.action("Pair VM", true) { pair(address.text.toString(), code.text.toString()) }
        }
        val access = column(content)
        access.label("${if (paired()) "Health Connect" else "2. Health Connect access"}", 17f, ink, true)
        access.label("Read-only access. You choose which measurements to share.", 13f, muted)
        val sdkStatus = HealthConnectClient.getSdkStatus(this)
        if (sdkStatus != HealthConnectClient.SDK_AVAILABLE) {
            access.label(if (sdkStatus == HealthConnectClient.SDK_UNAVAILABLE) "This device does not support Health Connect." else "Install or update Health Connect to continue.", 13f, muted)
            access.action("Get Health Connect") { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata"))) }
        } else {
            val counts = state.optJSONObject("summary")?.optJSONObject("counts")
            HealthSync.metrics.forEach { metric ->
                val granted = metric.permission in permissions
                val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; setPadding(0, dp(7), 0, dp(7)) }
                row.addView(text(metric.label, 14f), LinearLayout.LayoutParams(0, -2, 1f))
                row.addView(text(if (granted) "${counts?.optInt(metric.name) ?: 0} on VM" else "Not allowed", 12f, if (granted) accent else muted))
                access.addView(row)
            }
            access.action("Allow measurements") { permissionRequest.launch(HealthSync.metrics.map { it.permission }.toSet()) }
            val supportsHistory = HealthConnectClient.getOrCreate(this).features.getFeatureStatus(HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_HISTORY) == HealthConnectFeatures.FEATURE_STATUS_AVAILABLE
            if (supportsHistory && HealthSync.HISTORY !in permissions) {
                access.action("Also allow older history") { permissionRequest.launch(setOf(HealthSync.HISTORY)) }
            }
            access.label(if (HealthSync.HISTORY in permissions) "Older history enabled. Only available records are synced." else "First sync reads the last 29 days. Allow older history to backfill earlier records.", 12f, muted)
        }
        val footer = column(content, false)
        footer.action("Privacy & data use") { startActivity(Intent(this, PrivacyActivity::class.java)) }
        if (available()) footer.action("Manage Health Connect access") {
            val intent = if (android.os.Build.VERSION.SDK_INT >= 34) Intent("android.health.connect.action.HEALTH_HOME_SETTINGS") else Intent("androidx.health.ACTION_HEALTH_CONNECT_SETTINGS").setPackage("com.google.android.apps.healthdata")
            runCatching { startActivity(intent) }.onFailure { message("Open Android Settings → Health Connect to manage access.") }
        }
        if (paired()) footer.action("Disconnect this phone") {
            android.app.AlertDialog.Builder(this).setTitle("Disconnect this phone?").setMessage("Pairing credentials will be removed. Records already saved on your VM remain there.")
                .setNegativeButton("Cancel", null).setPositiveButton("Disconnect") { _, _ -> vault.clear(); state = JSONObject().put("deviceId", UUID.randomUUID().toString()); save(); render() }.show()
        }
        footer.label("OpenFit Sync 0.1 · Manual sync", 11f, muted)
    }
    private fun pair(address: String, code: String) {
        lifecycleScope.launch {
            setBusy(true)
            try {
                val url = VmApi.address(address)
                require(code.trim().length in 4..32) { "Enter the active pairing code from Open Gym." }
                // Save the destination only once a valid pair has been established.
                val candidate = JSONObject().put("apiUrl", url)
                val result = VmApi(candidate) {}.request("/v1/pair", JSONObject().put("code", code.trim().uppercase()), false)
                val token = result.getString("token")
                require(token.isNotBlank()) { "VM returned an empty pairing token." }
                state.put("apiUrl", url).put("token", token).put("name", result.optJSONObject("user")?.optString("name", "Your workspace"))
                state.remove("notice"); save(); render(); message("VM paired. Allow measurements, then tap Sync now.")
            } catch (error: Exception) { message(error.message ?: "Could not pair with your VM.", true) }
            finally { setBusy(false) }
        }
    }
    private fun sync() {
        syncJob = lifecycleScope.launch {
            setBusy(true)
            try {
                HealthSync(this@MainActivity, state, ::save).sync { message(it) }
                render(); message("Synced to your VM. Open the Body page in OpenFit to see your measurements.")
            } catch (_: CancellationException) { message("Sync paused. Tap Sync now to resume.") }
            catch (error: Exception) { message(error.message ?: "Sync could not finish. Tap Sync now to retry.", true) }
            finally { setBusy(false) }
        }
    }
}
