# GrokApps

Web apps (and their Android wrappers) built with Grok for Paul Axisa.

Open any app from the [hub page](https://raw.githack.com/paulmichaelaxisa/GrokApps/main/index.html), or use the links below. For a phone, open the preview link and use Add to Home Screen. Service workers need HTTP(S), so don’t open the files as `file://`.

## Apps

### [Project Rehearsal](./project-rehearsal/)

Flight simulator for delivery PMs — rehearse the room before steering.

- **Flow:** One-tap scenario (or paste artefacts) → timed room dialogue → debrief
- **API key:** A built-in key is used by default. Settings ⚙️ can override it on this device (`localStorage`: `project-rehearsal-xai-key`). Browser calls api.x.ai directly.
- **PWA:** Installable shell

**Preview:** [raw.githack](https://raw.githack.com/paulmichaelaxisa/GrokApps/main/project-rehearsal/index.html)

### [Daily Learn](./daily-learn/)

Mobile-first PWA for unique educational micro-lessons with quizzes. Remembers the current lesson, position, quiz answers and recent topics across launches. Settings can override the built-in xAI key.

**Preview:** [raw.githack](https://raw.githack.com/paulmichaelaxisa/GrokApps/main/daily-learn/index.html)

**Android:** package `com.paulaxisa.dailylearn` (see [`android/daily-learn/`](./android/daily-learn/)). Current App Tester build: [Daily Learn 1.1](https://appdistribution.firebase.google.com/testerapps/1:932049614164:android:ebe770aa36c255287d84c1/releases/7g8l40mo01aog).

### [Liam Words](./liam-words/)

Phone-first PWA for toddler word practice: picture-book art, bundled Australian-English audio, and in-app Auslan Signbank videos (CC BY-NC-ND 4.0, auslan.org.au). 32 words.

**Preview:** [raw.githack](https://raw.githack.com/paulmichaelaxisa/GrokApps/main/liam-words/index.html)

**Firebase hosting:** [liam-words-paul.web.app](https://liam-words-paul.web.app)

**Android:** package `com.paulaxisa.liamwords` (see [`android/liam-words/`](./android/liam-words/)). Current App Tester build: [Liam Words 1.5](https://appdistribution.firebase.google.com/testerapps/1:932049614164:android:827b9c77532a2b267d84c1/releases/0bl2ecqn2ij1g).

### [Sleepy Kitten](./sleepy-kitten/)

Turn-taking voice game for Liam: Dad's voice stirs the sleeping kitten, a glow says "your turn", and Liam's reply wakes it up for a happy wiggle (longer sounds, bigger wiggle). Listens for voices only (claps, bangs and steady TV are ignored), loudness and timing only, all on the phone. Grown-up settings: hold the top-right corner for 2 s. Art by Remy.

**Firebase hosting:** [sleepy-kitten-paul.web.app](https://sleepy-kitten-paul.web.app)

**Android:** package `com.paulaxisa.sleepykitten` (see [`android/sleepy-kitten/`](./android/sleepy-kitten/)). Current App Tester build: [Sleepy Kitten 1.0.1](https://appdistribution.firebase.google.com/testerapps/1:932049614164:android:072a800c20adea717d84c1/releases/7speaboca7e2g).

### [Beach Bubble Pop](./beach-bubble-pop/)

Toddler bubble-popping beach game. Tap or drag to pop bubbles; the phone vibrates on a pop.

**Preview:** [raw.githack](https://raw.githack.com/paulmichaelaxisa/GrokApps/main/beach-bubble-pop/index.html)

**Firebase hosting:** [beach-bubble-pop-paul.web.app](https://beach-bubble-pop-paul.web.app)

**Android:** package `com.paulaxisa.beachbubblepop` (see [`android/beach-bubble-pop/`](./android/beach-bubble-pop/)).

### [Animal Parade](./animal-parade/)

Toddler PWA: a short parade of animals, with zoom reactions and no immediate repeats.

**Preview:** [raw.githack](https://raw.githack.com/paulmichaelaxisa/GrokApps/main/animal-parade/index.html)

### [Car Window Peek](./car-window-peek/)

Toddler PWA: a NSW→QLD car-window scroll. Tap the things you see; drag the clouds.

**Preview:** [raw.githack](https://raw.githack.com/paulmichaelaxisa/GrokApps/main/car-window-peek/index.html)

### [BBQ Dashboard](./bbq-dashboard/)

Barbecue timing dashboard: heat, lid, and per-item timers. Optional custom art can be dropped into `bbq-dashboard/assets/` (see the README there).

**Preview:** [raw.githack](https://raw.githack.com/paulmichaelaxisa/GrokApps/main/bbq-dashboard/index.html)

## Android builds

Capacitor 7 wrappers live under [`android/`](./android/). They are the source used to sign APKs for Firebase App Tester. Copied `www/` assets, `node_modules`, build output, release keystores and `keystore.properties` are not in git — see each app’s README for the copy step and how to point a local keystore at the build.

Use the same release keystore for every update of an app. Signing keys stay only on the build machine.

## GitHub Pages

If Pages is enabled for this repo (Deploy from a branch, folder `/` at the root), the hub is `/` and each app is at `/project-rehearsal/`, `/daily-learn/`, `/liam-words/`, and so on.

## License

Content and code in this repo unless noted otherwise. Auslan Signbank videos in Liam Words remain CC BY-NC-ND 4.0, © Auslan Signbank.
