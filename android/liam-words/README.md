# Liam Words — Android

Capacitor 7 wrapper around the [Liam Words](../../liam-words/) web app.

- **Application ID:** `com.paulaxisa.liamwords`
- **Version in this tree:** 1.2 (versionCode 3)
- **Needs:** JDK 21, Android SDK, Node.js, and the existing release keystore

## Build a release APK

```bash
cd android/liam-words
npm install
./scripts/sync-www.sh
npx cap sync android
```

Copy the release keystore to `keystore/liamwords-release.jks` and copy `keystore.properties.example` to `keystore.properties`, filling in the passwords. Paths in that file are relative to the `android/` Gradle root.

Create `android/local.properties` with `sdk.dir=/path/to/android-sdk`, or set `ANDROID_HOME`. Then:

```bash
cd android
./gradlew assembleRelease
```

The signed APK is written under `android/app/build/outputs/apk/release/`. Bump `versionCode` and `versionName` in `android/app/build.gradle` for every new store or App Tester build. Always sign with the same keystore.

`./scripts/sync-www.sh` copies `../../liam-words/` into `www/`, skips `sw.js`, and removes the service-worker registration so Capacitor does not install the PWA worker. `www/` is gitignored because it duplicates the web app (including the sign videos and audio).
