package com.openfit.sync

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.changes.DeletionChange
import androidx.health.connect.client.changes.UpsertionChange
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.*
import androidx.health.connect.client.request.ChangesTokenRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit
import kotlin.reflect.KClass

data class Metric(val label: String, val type: KClass<out Record>) {
    val permission get() = HealthPermission.getReadPermission(type)
    val name get() = type.simpleName!!.removeSuffix("Record")
}

class HealthSync(context: Context, private val state: JSONObject, private val save: () -> Unit) {
    companion object {
        val metrics = listOf(
            Metric("Weight", WeightRecord::class), Metric("Body fat", BodyFatRecord::class),
            Metric("Body water mass", BodyWaterMassRecord::class), Metric("Bone mass", BoneMassRecord::class),
            Metric("Lean body mass", LeanBodyMassRecord::class), Metric("Height", HeightRecord::class),
            Metric("Basal metabolic rate", BasalMetabolicRateRecord::class), Metric("Heart rate", HeartRateRecord::class)
        )
        const val HISTORY = "android.permission.health.READ_HEALTH_DATA_HISTORY"
    }
    private val client = HealthConnectClient.getOrCreate(context)
    private val api = VmApi(state, save)
    private val tokens = state.optJSONObject("cursors") ?: JSONObject().also { state.put("cursors", it) }
    private fun row(record: Record): JSONObject {
        val (time, offset) = when (record) {
            is WeightRecord -> record.time to record.zoneOffset
            is BodyFatRecord -> record.time to record.zoneOffset
            is BodyWaterMassRecord -> record.time to record.zoneOffset
            is BoneMassRecord -> record.time to record.zoneOffset
            is LeanBodyMassRecord -> record.time to record.zoneOffset
            is HeightRecord -> record.time to record.zoneOffset
            is BasalMetabolicRateRecord -> record.time to record.zoneOffset
            is HeartRateRecord -> record.startTime to record.startZoneOffset
            else -> error("Unsupported record.")
        }
        val result = JSONObject().put("id", record.metadata.id).put("type", record::class.simpleName!!.removeSuffix("Record"))
            .put("origin", record.metadata.dataOrigin.packageName).put("time", time.toString())
            .put("modifiedAt", record.metadata.lastModifiedTime.toString())
            .put("offsetMinutes", (offset ?: ZoneId.systemDefault().rules.getOffset(time)).totalSeconds / 60)
        when (record) {
            is WeightRecord -> result.put("value", record.weight.inKilograms)
            is BodyFatRecord -> result.put("value", record.percentage.value)
            is BodyWaterMassRecord -> result.put("value", record.mass.inKilograms)
            is BoneMassRecord -> result.put("value", record.mass.inKilograms)
            is LeanBodyMassRecord -> result.put("value", record.mass.inKilograms)
            is HeightRecord -> result.put("value", record.height.inMeters * 100)
            is BasalMetabolicRateRecord -> result.put("value", record.basalMetabolicRate.inKilocaloriesPerDay)
            is HeartRateRecord -> result.put("endTime", record.endTime.toString()).put("samples", JSONArray(record.samples.map { JSONObject().put("time", it.time.toString()).put("bpm", it.beatsPerMinute) }))
        }
        return result
    }
    private suspend fun upload(records: List<Record> = emptyList(), deletions: List<String> = emptyList(), window: JSONObject? = null): JSONObject {
        val payload = JSONObject().put("version", 1).put("deviceId", state.getString("deviceId"))
            .put("records", JSONArray(records.map(::row))).put("deletedIds", JSONArray(deletions))
        if (window != null) payload.put("window", window)
        return api.request("/v1/health-connect", payload).getJSONObject("summary")
    }
    suspend fun sync(progress: (String) -> Unit): JSONObject {
        val granted = client.permissionController.getGrantedPermissions()
        val allowed = metrics.filter { it.permission in granted }
        require(allowed.isNotEmpty()) { "Allow at least one measurement in Health Connect first." }
        val history = HISTORY in granted
        if (state.optBoolean("historyAllowed") != history) { tokens.keys().asSequence().toList().forEach { tokens.remove(it) }; state.put("historyAllowed", history); save() }
        metrics.filter { it.permission !in granted }.forEach { tokens.remove(it.name) }
        save()
        var summary = api.request("/v1/health-connect").getJSONObject("summary")
        for (metric in allowed) {
            currentCoroutineContext().ensureActive()
            progress("Syncing ${metric.label.lowercase()}…")
            var token = tokens.optString(metric.name)
            if (token.isNotEmpty()) {
                var more = true
                while (more) {
                    currentCoroutineContext().ensureActive()
                    val changes = client.getChanges(token)
                    if (changes.changesTokenExpired) { token = ""; break }
                    val upserts = changes.changes.filterIsInstance<UpsertionChange>().map { it.record }
                    val deleted = changes.changes.filterIsInstance<DeletionChange>().map { it.recordId }
                    for (batch in upserts.chunked(50)) summary = upload(batch)
                    for (batch in deleted.chunked(500)) summary = upload(deletions = batch)
                    token = changes.nextChangesToken
                    tokens.put(metric.name, token); save()
                    more = changes.hasMore
                }
            }
            if (token.isEmpty()) {
                // Acquire cursor before backfill to avoid losing concurrent record changes.
                val nextToken = client.getChangesToken(ChangesTokenRequest(setOf(metric.type)))
                val end = Instant.now()
                val start = if (history) Instant.parse("2000-01-01T00:00:00Z") else end.minus(29, ChronoUnit.DAYS)
                var page: String? = null
                val ids = mutableListOf<String>()
                do {
                    currentCoroutineContext().ensureActive()
                    val response = client.readRecords(ReadRecordsRequest(metric.type, TimeRangeFilter.between(start, end), pageSize = 100, pageToken = page))
                    ids.addAll(response.records.map { it.metadata.id })
                    for (batch in response.records.chunked(50)) summary = upload(batch)
                    page = response.pageToken
                } while (page != null)
                summary = upload(window = JSONObject().put("type", metric.name).put("startTime", start.toString()).put("endTime", end.toString()).put("ids", JSONArray(ids)))
                tokens.put(metric.name, nextToken); save()
            }
        }
        state.put("summary", summary).put("lastSyncAt", Instant.now().toString()); save()
        return summary
    }
}
