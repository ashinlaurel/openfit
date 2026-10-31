package com.openfit.sync

import android.app.Activity
import android.graphics.Color
import android.os.Bundle
import android.widget.ScrollView
import android.widget.TextView

class PrivacyActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (24 * resources.displayMetrics.density).toInt()
        val text = TextView(this).apply {
            textSize = 16f; setTextColor(Color.rgb(230, 236, 240)); setPadding(pad, pad * 2, pad, pad * 2)
            setLineSpacing(8f, 1f)
            text = "OpenFit Sync — Privacy & data use\n\n" +
                "You choose which Health Connect measurements OpenFit can read: weight, body fat, body water mass, bone mass, lean body mass, height, basal metabolic rate, and heart rate. OpenFit never writes data to Health Connect.\n\n" +
                "When you tap Sync now, this app sends the measurements you allowed, their original timestamps, and their source app to the OpenFit VM you paired. The connection uses HTTPS. The VM stores records encrypted, associated with your paired account. There are no ads or analytics in this app.\n\n" +
                "The first sync reads the last 29 days by default. If you grant the optional older-history permission, the app reads available earlier records as well. Future syncs send new and changed records, including deletions. Keep the app open during sync. Background sync is not enabled in this version.\n\n" +
                "Pairing credentials and sync cursors are encrypted on this phone using Android Keystore. Android app backup is disabled. Disconnect this phone to remove its local pairing credentials. Disconnecting does not delete records already saved on your VM.\n\n" +
                "You can revoke access in Android Settings → Health Connect at any time. Deleting a measurement in Health Connect is reflected on your VM after a subsequent successful sync while permission remains granted. If sync access expires, the app rechecks the readable history window; deleted records outside that window may remain in the archive.\n\n" +
                "This app can access only what FitDays or other apps actually write to Health Connect. Permission to read a type does not guarantee that records exist. Heart-rate samples are archived on the VM; this version adds the body measurements to OpenFit’s Body charts."
        }
        setContentView(ScrollView(this).apply { setBackgroundColor(Color.rgb(11, 14, 18)); addView(text) })
    }
}
