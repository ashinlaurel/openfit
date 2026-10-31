#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
: "${ANDROID_HOME:?Set ANDROID_HOME to your Android SDK directory}"
gradle_command="${OPENFIT_GRADLE:-./gradlew}"
"$gradle_command" --no-daemon --console=plain :app:assembleRelease :app:lintRelease
signing_dir="../.artifacts/android-signing"
mkdir -p "$signing_dir" ../release/android ../public/downloads
chmod 700 "$signing_dir"
if [ ! -f "$signing_dir/store-password" ]; then
  (umask 077; openssl rand -hex 32 > "$signing_dir/store-password")
fi
if [ ! -f "$signing_dir/openfit-sync.jks" ]; then
  keytool -genkeypair -keystore "$signing_dir/openfit-sync.jks" -storepass:file "$signing_dir/store-password" -keypass:file "$signing_dir/store-password" -alias openfit -keyalg RSA -keysize 3072 -validity 10000 -dname "CN=OpenFit Personal, O=OpenFit" -noprompt
  chmod 600 "$signing_dir/openfit-sync.jks"
fi
build_tools="$ANDROID_HOME/build-tools/35.0.0"
"$build_tools/zipalign" -f -p 4 app/build/outputs/apk/release/app-release-unsigned.apk ../release/android/openfit-sync-aligned.apk
"$build_tools/apksigner" sign --ks "$signing_dir/openfit-sync.jks" --ks-key-alias openfit --ks-pass "file:$signing_dir/store-password" --out ../release/android/openfit-sync-0.1.0.apk ../release/android/openfit-sync-aligned.apk
"$build_tools/apksigner" verify --verbose ../release/android/openfit-sync-0.1.0.apk
cp ../release/android/openfit-sync-0.1.0.apk ../public/downloads/
shasum -a 256 ../release/android/openfit-sync-0.1.0.apk
