package com.openfit.sync

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL

class VmApi(private val state: JSONObject, private val save: () -> Unit) {
    companion object {
        fun address(value: String): String {
            val uri = URI(value.trim())
            require(uri.scheme == "https" && !uri.host.isNullOrEmpty() && uri.userInfo == null && uri.query == null && uri.fragment == null && (uri.path.isNullOrEmpty() || uri.path == "/")) { "Enter your HTTPS OpenFit API address." }
            return value.trim().trimEnd('/')
        }
    }
    suspend fun request(path: String, payload: JSONObject? = null, authenticated: Boolean = true): JSONObject = withContext(Dispatchers.IO) {
        val connection = URL(address(state.getString("apiUrl")) + path).openConnection() as HttpURLConnection
        connection.instanceFollowRedirects = false // Never forward credentials to another host.
        connection.connectTimeout = 20000
        connection.readTimeout = 45000
        connection.setRequestProperty("Accept", "application/json")
        if (authenticated) connection.setRequestProperty("Authorization", "Bearer " + state.getString("token"))
        try {
            if (payload != null) {
                connection.requestMethod = "POST"
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
            }
            val code = connection.responseCode
            val text = (if (code in 200..299) connection.inputStream else connection.errorStream)?.bufferedReader()?.use { it.readText() } ?: "{}"
            val result = runCatching { JSONObject(text) }.getOrDefault(JSONObject())
            if (code !in 200..299) throw IllegalStateException(if (code == 401) "Pairing expired. Disconnect and pair again." else result.optString("error", "VM returned HTTP $code."))
            connection.getHeaderField("x-open-gym-token")?.takeIf { it.isNotBlank() }?.let { state.put("token", it); save() }
            result
        } finally { connection.disconnect() }
    }
}
