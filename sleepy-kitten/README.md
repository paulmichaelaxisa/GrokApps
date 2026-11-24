# Sleepy Kitten

A turn-taking voice game for Liam (bilateral cochlear implants, early talker). Dad's voice stirs the
sleeping kitten and a warm glow says "your turn". Liam's reply, any sound at all, wakes it up for a
happy wiggle, and a longer sound gets a bigger wiggle. At the end of the session the kitten curls up,
falls asleep and the app stops listening.

- **Web:** https://sleepy-kitten-paul.web.app (Firebase Hosting site `sleepy-kitten-paul`)
- **Android:** `com.paulaxisa.sleepykitten`, see [`../android/sleepy-kitten/`](../android/sleepy-kitten/)
- Design spec and speech guidance: `/workspace/liam-voice-visualiser/DESIGNS.md` (Sleepy Kitten, from Remy and Sprout)

## How to use it
Phone on a stand at Liam's eye level, about 30–50 cm away, processors on, TV off, Do Not Disturb on.
Open the app and stay quiet for 3 seconds while it measures the room (the kitten just sleeps). Then:
"shhh, kitty's sleeping… hellooo!" The kitten stirs and sits up with the glow above its head. Look at
Liam and wait 5–10 s. Any sound from him wakes the kitten. Sessions last 4 minutes by default.

There is no start button. On the Android app, and on a home-screen install, it starts listening
straight away after the first microphone permission prompt. In a normal browser tab, the browser may
need one grown-up tap the first time (a small microphone picture appears).

## Who's talking? (no pitch detection)
The app only uses loudness and timing, so it tells Dad from Liam by **turn order**. Pick the mode in
the grown-up settings:

| Mode | How it decides |
|---|---|
| **Take turns** (default) | While the kitten sleeps, the first voice is Dad's model. A voice that starts within the *turn gap* (1.0 s by default, adjustable 0.6–2.0 s) after the previous one ended is the same person carrying on, so "shhh… hellooo!" stays Dad. A voice after a longer pause is the other person's turn: Dad → Liam → Dad … After 15 s of quiet the kitten slowly settles back to sleep and the next voice is Dad's again. |
| **Hold for Dad** | Dad presses and holds anywhere on the screen while he talks. Voice during the hold is Dad's, and every other voice is Liam's, even a very quick reply. Most reliable if Liam answers fast or talks first. |
| **Any voice** | Every voice wakes the kitten (solo play). The glow shows between sounds. |

## What the kitten does
| Brain state | Art | Glow |
|---|---|---|
| sleep | `kitten_sleeping.webp` loop | – (on in Any voice) |
| Dad talking | `kitten_stirring.webp` once (2.5 s), then `kitten_waiting.webp` loop | – |
| Liam's turn | `kitten_waiting.webp` loop | slow pulse above the head |
| Liam talking / happy | `kitten_awake_wiggle.webp` loop, whole 3 s cycles (2 cycles for 1.2 s+ sounds, plus a small hop and purr ripples) | – |
| 15 s quiet / session end | `kitten_curling_up.webp` once (2.5 s), then `kitten_sleeping.webp`; at session end a still `kitten_sleeping.png` and the mic is released | – |

One-shots switch on a 2.5 s timer, not on the WebP loop flag. Each play uses a fresh blob URL so the
animation always starts from frame 0, and seams line up with the poses Remy matched. Within ~45 ms of a
voice the kitten also gets a small procedural lift and grows a little with loudness (capped).

## Art (Remy)
`art/` holds Remy's files with her names unchanged (source: `/workspace/sleepy-kitten-art/`):
`kitten_<state>.webp` (animated, 512×512, 12 fps, opaque cream #FBEFD8) and `kitten_<state>.png`
(stills) for `sleeping`, `stirring`, `waiting`, `awake_wiggle` and `curling_up`. To update the art,
drop new files in with the same names and the same 512×512 framing, then bump the cache name in
`sw.js`. The glow is drawn in the clear space above the waiting head (about x 150–370, y 10–140 of
512). Frames are full-bleed pure #FBEFD8, matching the page, so they need no edge mask.

## Audio (all on the phone)
`detector.mjs` runs in an AudioWorklet (`mic-worklet.js`), on 128-sample blocks:
- Mic opened with echo cancellation, noise suppression and auto gain **off**.
- Voice band: 4th-order high-pass at 280 Hz and low-pass at 3400 Hz, then decimated to about 12 kHz.
- Every ~10.7 ms: level (dBFS), spectral flatness over 300–3400 Hz, and periodicity (autocorrelation
  peak). Periodicity is only a voiced/not-voiced check; the pitch value is never used.
- A voice needs 4 voiced hops in a row (about 43 ms) that are above the threshold, periodic (≥ 0.5),
  not noise-like (flatness ≤ 0.38) and not decaying like a knock (no more than 6 dB below their peak).
  Claps, bangs, knocks and blips shorter than about 50 ms are rejected.
- Threshold = room noise + 10 dB − sensitivity (slider ±8 dB). Hysteresis is 3 dB, and gaps under
  180 ms ("ba-ba") stay one sound.
- Background: a sound that never stops for 6 s (TV, music, vacuum) becomes the new floor, and the floor
  also tracks the 15th percentile of the last 6 s. A voice 12 dB louder than an ongoing sound starts a
  new sound straight away.
- Calibration: 3 s at the start of every session (30th percentile of levels), and again from settings.
- Optional app sound (off by default): a quiet 0.45 s two-note chime, only after Liam stops. The mic is
  ignored while it plays plus 300 ms.
- Nothing is recorded, stored or uploaded. Settings and today's parent-only stats stay in `localStorage`.

## Grown-up settings
Press and hold the **top-right corner for 2 seconds** (invisible, no text shown to Liam): mode, turn gap,
sensitivity with a live mic meter, re-measure the room, session length 3/4/5 min (default 4), the
optional sound, calm motion (no hop or ripples), today's count and longest sound, and New session.
While settings are open the kitten ignores voices.

## Tests (headless)
```bash
node test/detector.test.mjs   # synthetic voices vs claps, knocks, bangs, fan, TV; latency; sensitivity
node test/turns.test.mjs      # turn order, rewards, hold mode, any mode, session end
```
`test/signals.mjs` makes the synthetic signals: formant-filtered glottal pulse voices at 95–380 Hz,
claps, tonal table knocks, door bangs, steady noise and quiet TV babble. Measured onset latency is
44–55 ms. The app was also run end to end in headless Chrome with a synthetic WAV as the fake microphone.

## Safety
No flashing (the glow pulses at 0.4 Hz), no text, numbers or scores for Liam, no sad or failure states,
no ads, no accounts, no network calls after load. Phone mic only; it never connects to his processors.
His audiologist and AVT therapist set his goals. This is play that supports them.
