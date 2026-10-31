# OpenFit Sync for Android

A small native Android companion that sends read-only Health Connect measurements to your paired OpenFit VM. The dashboard remains in OpenFit’s website and desktop app.

## Install and use

1. Download `openfit-sync-0.1.0.apk` from OpenFit website → Settings → Health Connect sync. Open it on the phone and allow installation from your browser when Android asks.
2. In Open Gym, open Settings → Account → Pair the mobile app. Enter that short-lived code in OpenFit Sync. The OpenFit API address is prefilled for the existing VM.
3. Tap **Allow measurements** and choose the types to share. The optional **Also allow older history** button appears on supported Android versions.
4. Tap **Sync now** and keep the app open. Return to OpenFit → Body → Sync history to see the extra charts.

Android 9 or newer is required. Android 9–13 also need the Health Connect app from Google Play. Android 14+ includes Health Connect in the system. This is a personal, signed APK rather than a Google Play release.

## Included types

Weight, body fat, body water mass, bone mass, lean body mass, height, basal metabolic rate, and heart rate. These match the FitDays Health Connect categories shared in this project. The app reads only granted types and can access only records that source apps actually write. Body metrics appear in the dashboard; raw heart-rate samples are archived separately without being added to the existing Google Health heart-rate graph.

The default first sync reads the previous 29 days to stay inside Health Connect’s permission window. The optional older-history permission enables an available historical backfill from 2000 onward. Each type has its own change cursor. Uploads are idempotent; a cursor advances only after the VM accepts that page. Later syncs apply upserts and deletions. Expired cursors trigger a fresh snapshot of the readable window; previously archived deletions outside that window cannot be inferred without broader history access.

## Security and storage

The Android manifest requests read access only. Uploads use HTTPS and the existing VM device pairing protocol. Credentials and cursors use AES-GCM with an Android Keystore key; Android backups are disabled. No credentials are embedded in the APK. The VM authenticates each upload and stores original records in a separate encrypted `health-connect.enc` archive for the paired account. `/v1/body-history` projects the latest measurement of each type per civil date, while retaining original record timestamps and source applications in the raw archive.

The VM accepts `GET /v1/health-connect` for a summary and `POST /v1/health-connect` for batches of `{version:1, deviceId, records, deletedIds}`. First-sync reconciliation can include `{window:{type,startTime,endTime,ids}}`. Device IDs scope deletes to that device. Upload bounds are enforced server-side. The archive allows up to 100,000 records and 50 MiB; requests allow up to 6 MiB. No background sync is scheduled in this first version.

## Build

Install JDK 17, Android SDK platform 36, and Android build tools 35.0.0. Set `JAVA_HOME` and `ANDROID_HOME`, then run:

```sh
./android-sync/build-apk.sh
npm run build
```

The build script compiles and lints a release APK, aligns and signs it, verifies the signature, and copies it to `release/android/` and `public/downloads/`. Vite includes the download in `dist/`. APKs, SDK paths, build products, and the private signing key are ignored by Git. Back up `.artifacts/android-signing/` privately: future APK upgrades must use that same signing key. Never commit its contents.

The app’s privacy statement is available both in the app and from the Health Connect permission screen. Publishing on Google Play additionally requires the corresponding Health Connect/health-app declarations and a hosted privacy policy.
