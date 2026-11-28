# Smart Home: Android

Capacitor 7 wrapper around the [Smart Home](../../smart-home/) web app, plus a small native plugin for raw TCP/UDP.

- **Application ID:** `com.paulaxisa.smarthome`
- **Version in this tree:** 1.0.2 (versionCode 3)
- **Permissions:** `INTERNET`, `ACCESS_NETWORK_STATE`, `ACCESS_WIFI_STATE`, `CHANGE_WIFI_MULTICAST_STATE`,
  `ACCESS_FINE_LOCATION` + `ACCESS_COARSE_LOCATION` (Samsung and older Android often need these to expose Wi-Fi info),
  `NEARBY_WIFI_DEVICES` (Android 13+, `neverForLocation`; location is requested separately for the SSID).
  `ACCESS_LOCAL_NETWORK` is **not** declared: this app targets API 35, and Android docs say local-network access is
  already granted via `INTERNET` until you target API 37
  (https://developer.android.com/privacy-and-security/local-network-permission). On API 33+ the plugin requests
  nearby-Wi-Fi at runtime; location is requested on all versions.
- **Native plugin `SmartNet`** (`android/app/src/main/java/com/paulaxisa/smarthome/`):
  `NetCore.java` is plain Java (testable on a JVM), `SmartNetPlugin.java` is the Capacitor wrapper.
  Methods: `prepare` (runtime permission request + Wi-Fi snapshot), `discover` (multicast lock, 3× UDP broadcast to the
  subnet address + 255.255.255.255 for ≥3 s, then a TCP /24 sweep of the *Wi-Fi* subnet; every socket is bound to the
  Wi-Fi Network), `tcpRequest`, `udpDiscover`, `tcpSweep`, `localAddresses`, `setChrome`.
  The cipher and JSON live in the web app, the plugin only moves bytes (base64 over the bridge).
- **Calling the plugin from JS:** the web app has no bundler, so `window.Capacitor` is only what `native-bridge.js` provides:
  use `Capacitor.nativePromise('SmartNet', method, args)` (see `capacitorPlugin()` in `smart-home/transport.mjs`). There is **no
  `Capacitor.registerPlugin`** here. Calling it crashed 1.0.0 into a blank screen. `index.html` now has a startup safety net
  that shows any startup error as text on screen.
- **Needs:** JDK 21, Android SDK, Node.js, and the release keystore (alias `smarthome`)

## Build a release APK
```bash
cd android/smart-home
npm install
./scripts/sync-www.sh
npx cap sync android
```
Copy `keystore.properties.example` to `keystore.properties` and point it at `keystore/smarthome-release.jks` (paths are relative
to the `android/` Gradle root). Create `android/local.properties` with `sdk.dir=/path/to/android-sdk`, or set `ANDROID_HOME`. Then:
```bash
cd android && ./gradlew assembleRelease
```
The signed APK lands in `android/app/build/outputs/apk/release/`. Copy it to an `apk-builds/` folder (not `dist/`).
Bump `versionCode`/`versionName` in `android/app/build.gradle` for every tester build and always sign with the same keystore.
Never commit `keystore/`, `*.jks`, `keystore.properties`, `local.properties`, `www/`.

## Test against the real Capacitor runtime
`smart-home/test/native-shim-e2e.cjs <shots> <assets-dir>` runs the app in headless Chrome with Capacitor's real `native-bridge.js`
(fake `androidBridge`) and real sockets to the mock plugs; pass the APK's extracted `assets/public` to test exactly what shipped.
`smart-home/test/startup-resilience.cjs` checks plugin-missing and startup-crash behaviour.

## Test the socket code on a plain JVM
`test-jvm/run-test.sh` compiles `NetCore.java` and exercises it against the Python mock HS110s (hw v1/v2, chunked replies,
hang-up, silence, refused, TCP sweep, UDP broadcast).
