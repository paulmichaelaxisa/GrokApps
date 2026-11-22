# Beach Bubble Pop — Android

Capacitor 7 wrapper around the [Beach Bubble Pop](../../beach-bubble-pop/) web app.

- **Application ID:** `com.paulaxisa.beachbubblepop`
- **Version in this tree:** 1.0 (versionCode 1)
- **Needs:** JDK 21, Android SDK, Node.js, and the existing release keystore

The app uses the `VIBRATE` permission so pops can haptic-feedback on the phone.

## Build a release APK

```bash
cd android/beach-bubble-pop
npm install
./scripts/sync-www.sh
npx cap sync android
```

Copy the release keystore to `keystore/beachbubblepop-release.jks` and copy `keystore.properties.example` to `keystore.properties`, filling in the passwords. Paths in that file are relative to the `android/` Gradle root.

Create `android/local.properties` with `sdk.dir=/path/to/android-sdk`, or set `ANDROID_HOME`. Then:

```bash
cd android
./gradlew assembleRelease
```

The signed APK is written under `android/app/build/outputs/apk/release/`. Bump `versionCode` and `versionName` in `android/app/build.gradle` for every new store or App Tester build. Always sign with the same keystore.

`./scripts/sync-www.sh` copies `../../beach-bubble-pop/` into `www/`, skips `sw.js`, and removes the service-worker registration. `www/` is gitignored.
