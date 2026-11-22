# Daily Learn — Android

Capacitor 7 wrapper around the [Daily Learn](../../daily-learn/) web app.

- **Application ID:** `com.paulaxisa.dailylearn`
- **Version in this tree:** 1.1 (versionCode 2)
- **Needs:** JDK 21, Android SDK, Node.js, and the existing release keystore

The web app already ships a built-in xAI key (in `daily-learn/config.js`, used when Settings has no override). After `./scripts/sync-www.sh`, the Android copy uses that same file. Do not add a `config.local.js` to git.

Optional: `scripts/write-config.js` can write a local `www/config.local.js` from `XAI_API_KEY` or `REHEARSAL_XAI_KEY` in the environment if you want a different key on a private build. That file is gitignored. The synced `index.html` loads `config.js`, not `config.local.js`.

## Build a release APK

```bash
cd android/daily-learn
npm install
./scripts/sync-www.sh
npx cap sync android
```

Copy the release keystore to `keystore/dailylearn-release.jks` and copy `keystore.properties.example` to `keystore.properties`, filling in the passwords. Paths in that file are relative to the `android/` Gradle root.

Create `android/local.properties` with `sdk.dir=/path/to/android-sdk`, or set `ANDROID_HOME`. Then:

```bash
cd android
./gradlew assembleRelease
```

The signed APK is written under `android/app/build/outputs/apk/release/`. Bump `versionCode` and `versionName` in `android/app/build.gradle` for every new store or App Tester build. Always sign with the same keystore.
