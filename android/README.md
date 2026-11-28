# Android wrappers

Capacitor 7 Android projects for the GrokApps that have been wrapped as installable APKs:

| App | Folder | Application ID | Current version |
| --- | --- | --- | --- |
| Liam Words | [`liam-words/`](./liam-words/) | `com.paulaxisa.liamwords` | 1.2 (versionCode 3) |
| Daily Learn | [`daily-learn/`](./daily-learn/) | `com.paulaxisa.dailylearn` | 1.1 (versionCode 2) |
| Sleepy Kitten | [`sleepy-kitten/`](./sleepy-kitten/) | `com.paulaxisa.sleepykitten` | 1.0.2 (versionCode 3) |
| Beach Bubble Pop | [`beach-bubble-pop/`](./beach-bubble-pop/) | `com.paulaxisa.beachbubblepop` | 1.0.2 (versionCode 3) |
| Smart Home | [`smart-home/`](./smart-home/) | `com.paulaxisa.smarthome` | 1.0.2 (versionCode 3) |

Each folder has its own README with build steps. In short:

1. `npm install` in the app folder
2. `./scripts/sync-www.sh` to copy the web app into `www/` (gitignored)
3. `npx cap sync android`
4. Place the existing release keystore in `keystore/` and a filled-in `keystore.properties` (see `keystore.properties.example`)
5. Set `sdk.dir` in `android/local.properties` or `ANDROID_HOME`, then `./gradlew assembleRelease` from `android/`

Never commit `keystore/`, `*.jks`, `keystore.properties`, `local.properties`, `www/`, `dist/`, or `config.local.js`. The same keystore must be used for every update of that app.
