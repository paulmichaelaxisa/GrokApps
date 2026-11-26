# Sleepy Kitten — Android

Capacitor 7 wrapper around the [Sleepy Kitten](../../sleepy-kitten/) web app.

- **Application ID:** `com.paulaxisa.sleepykitten`
- **Version in this tree:** 1.2.0 (versionCode 6)
- **Permissions:** `RECORD_AUDIO` + `MODIFY_AUDIO_SETTINGS`. Capacitor's `BridgeWebChromeClient` shows the
  runtime microphone prompt the first time the page calls `getUserMedia`. `MainActivity` turns off
  `mediaPlaybackRequiresUserGesture` so the kitten listens without a start tap, and keeps the screen on.
- **Plugins:** `@capacitor/filesystem` + `@capacitor/share`. Android's WebView has no Web Share API, so
  "Share" for Liam's sound clips writes each .wav to the app cache (`cache/liam-sounds/`) and opens the native
  share sheet with all of them (`ACTION_SEND_MULTIPLE` via the template's FileProvider `cache-path`).
- **Needs:** JDK 21, Android SDK, Node.js, and the existing release keystore (alias `sleepykitten`)

## Build a release APK

```bash
cd android/sleepy-kitten
npm install
./scripts/sync-www.sh
npx cap sync android
```

Copy `keystore.properties.example` to `keystore.properties` and point it at the release keystore
(`sleepykitten-release.jks`). Paths in that file are relative to the `android/` Gradle root, or absolute.
Create `android/local.properties` with `sdk.dir=/path/to/android-sdk`, or set `ANDROID_HOME`. Then:

```bash
cd android
./gradlew assembleRelease
```

The signed APK is written under `android/app/build/outputs/apk/release/`. Bump `versionCode` and
`versionName` in `android/app/build.gradle` for every new App Tester build. Always sign with the same keystore.

`./scripts/sync-www.sh` copies `../../sleepy-kitten/` into `www/`, skips `sw.js`, `README.md` and the
`test/` and `tools/` folders, and removes the service-worker registration. `www/` is gitignored.
