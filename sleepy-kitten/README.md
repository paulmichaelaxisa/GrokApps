# Sleepy Kitten

A turn-taking voice game for Liam (bilateral cochlear implants, early talker). Dad's voice stirs the
sleeping kitten and a warm glow says "your turn". Liam's reply, any sound at all, wakes it up for a
happy wiggle, and a longer sound gets a bigger wiggle. At the end of the session the kitten curls up,
falls asleep and the app stops listening.

Since 1.1.0 there are **five voice games** as picture-only tabs along the bottom (Remy's art from
`/workspace/voice-games-art/`, names unchanged, under `art/puppy`, `art/balloon`, `art/garden`,
`art/sky`, `art/tabs`).

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

## The five tabs
| Tab | What a voice does | Session end |
|---|---|---|
| **Sleepy Kitten** | As above (turn order, glow, wiggle for Liam). | Curls up and sleeps. |
| **Copycat Puppy** | Sleeps through the 3 s room check, then `puppy_waking` and `puppy_waiting`. Talks along while there's a voice (`puppy_talking_soft` for quiet, `puppy_talking` for loud, 130 ms crossfade with hysteresis) and muzzle ripples follow the loudness (40 ms rise). Back to `puppy_waiting` 400 ms after the voice stops. A sound from Liam of 2 s or more gets one `puppy_happy_wag`. After **10 s of quiet** it naps (`puppy_lying_down`, then `puppy_sleeping` looping; its own timer, the kitten settles after 15 s), and the next voice plays `puppy_waking`, then waiting. | `puppy_lying_down`, then `puppy_sleeping`; on New session it sleeps through the room check, then `puppy_waking`. |
| **Big Balloon** | Live layers (hand, string, balloon). Any voice blows it up (about 3 s of voice to fill, louder is a bit faster) with soft glow rings. A pause lets out 10% over 4 s after 1.5 s. When it's full, `balloon_pop`, then `balloon_new_balloon`, then back to live. Gentle 3 s bob. | Shrinks, `balloon_drift_away`, then `balloon_resting`. |
| **Sound Garden** | Built live from soil, the growth sheets, bee, sparkles and butterflies (not `garden_full_garden`). After 200 ms of voice a seed lands in the next of 8 spots, and voice grows it (about 1.5 s to bloom, height 0.8–1.1 from loudness). Flowers never shrink. On a bloom the bee visits and sparkles twinkle. After 8 flowers the full garden sways with 2 butterflies for 9 s, then folds back and starts again. | Flowers fold, the bee rests, then `garden_resting`. |
| **Sky Balloon** | The basket rises with voice time (**Sky climb time** in grown-up settings: 1.6 s of voice by default, 0.8–3.0 s; louder is 0.7–1.3× faster), hangs 1.1 s so a breath between sounds keeps its height, then floats down slowly. The burner glow follows loudness. Half a second at the top plays `sky_cloud_reward` and the sun glows. `hills_wide` on wide screens, mirrored past its ends on very wide phones. | Drifts down, then `sky_resting`. |

If a tab is opened after the session has ended, it plays its gentle sleeping/resting loop (stills only
with calm motion). In Sound Garden the planted seed is frame 0 of each growth sheet, which is identical
to `seed.png`, so the separate seed file was dropped.

**Wide screens (Sky Balloon):** Remy's `sky_cloud_reward` and `sky_resting` are opaque squares with
`hills.png` flattened on cream, and that art fades out over the outer ~42 px of each side. Next to
`hills_wide` that showed as cream bands. A second canvas above the clip repaints those side strips with
an exact unmix (`W + a·(H − cream)` at opacity `(1 − a)·a_W`, where a and H are hills.png's alpha and
colour, and W and a_W are hills_wide's), so the clip's hills sit on hills_wide exactly like the live scene.
A bird or balloon crossing the bottom of a side strip would be slightly tinted there. Edge-to-edge
(no side fade) or alpha versions of those two clips would remove the need for this.

No game uses pitch. Sky height is voice time plus loudness, the balloon bobs, the garden's flower
types come from the fixed slots, and the puppy doesn't tilt its head. Kitten and Puppy save the big
reward for Liam's turn. Balloon, Garden and Sky grow from anyone's voice, so Dad can model.

**Tabs:** icon-only, 88 px tall, whole cell tappable, selected tab on a soft pill (×1.1), no text.
A tab switch needs a deliberate tap (moved less than 14 px, under 0.9 s, at least 400 ms since the last
switch), so a toddler's swipe or palm slap doesn't flick through games. Switching fully stops the old
microphone stream and audio context before opening a fresh one (`mic.mjs`, with a generation counter so a
slow start can never leave two streams). Calibration, voice detection, turn order, session timer,
settings and the wave are shared. The room is measured once per session, and the session clock keeps
running across tabs. The last tab is remembered.

## Rolling sound wave
A thin (3 px, soft 8 px glow) line rolls across the top of the screen on a canvas. When it's quiet it
swells gently. It rises smoothly with the same smoothed voice-band level that drives the kitten
(capped, 120 ms rise and 450 ms fall, so no flicker), so claps and bangs don't move it. It's coral
while it's Dad's go and eases to teal over about 0.8 s for Liam's turn. With calm motion (the default
under prefers-reduced-motion) it's slower and half the height. At session end it flattens and dims.
It ignores touches, so the top-right settings hold still works, and it sits well above the kitten's glow.
It shows on every tab.

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
- Nothing is recorded unless a grown-up turns on **Save Liam's sounds** (below). Nothing is ever uploaded
  by the app. Settings and today's parent-only stats stay in `localStorage`.

## Liam's sounds (optional clips, 1.2.0)
Off by default. When **Save Liam's sounds** is on in grown-up settings:
- The worklet also keeps a rolling 20 s, 16 kHz mono copy of the mic (`recring.mjs`: 2× low-pass at
  7 kHz, then linear resampling; about 0.05 ms per 128-sample block, so the < 100 ms response is untouched).
  When it's off, nothing is buffered.
- When one of **Liam's** sounds ends (any tab; in Take turns only his turns, in Hold for Dad any voice
  while nobody is holding, in Any voice every voice), the app asks for that stretch with 300 ms before
  and after, capped at 15 s and at least 0.4 s. Sounds the detector flags as background (a sound that
  never stops for 6 s) are skipped. While settings are open, or after the session ends, nothing is kept.
- Each clip is a 16-bit 16 kHz mono WAV (about 32 KB a second, gently peak-normalised, max ×8), saved in
  IndexedDB (`sleepy-kitten-clips`) as `liam_YYYY-MM-DD_HH-MM-SS_<tab>.wav` (local time of the start;
  `_2` if two start in the same second). `liamclips.mjs` stores, lists, zips and shares them.
- Settings list: count, total size, today's count, each clip (date, time, game, length) with Play and
  Delete, **Delete all** (with confirm), **Share today's** and **Share all**.
- Sharing: in the Android app every clip is written to the app cache and the native share sheet opens
  with all of them as separate .wav files (pick OneDrive, then the folder). In a browser, the Web Share
  API takes up to 10 files at a time, so bigger sets go 10 per tap ("Shared 1–10 of 23. Tap again for the
  next 10."). With no file sharing at all, a .zip downloads instead.
- Liam sees nothing different. Transcription happens later off the phone (no keys in the app).


## Grown-up settings
Press and hold the **top-right corner for 2 seconds**, where a small faint gear (24 px, 35% opacity, still) marks the spot. A tap or a short press does nothing. Works with touch (pointer capture plus touch-event backup for WebViews), pen and mouse; the finger may wobble up to 40 px. Inside: mode, turn gap,
sensitivity with a live mic meter, Sky climb time (seconds of voice to lift the Sky Balloon to the
clouds), re-measure the room, session length 3/4/5 min (default 4), the optional sound, calm motion (no
hop or ripples, and the games' clips show as stills), today's count and longest sound, Liam's sounds, and New session.
While settings are open the games ignore voices. The tab bar doesn't reach the top-right hold zone.

`puppy_happy_wag.webp` is re-timed by `tools/retime_puppy_wag.py` from Remy's frames (108 ms per frame,
3.9 s, 1.3× slower) to tone it down.

## Tests (headless)
```bash
node test/detector.test.mjs   # synthetic voices vs claps, knocks, bangs, fan, TV; latency; sensitivity
node test/turns.test.mjs      # turn order, rewards, hold mode, any mode, session end
```
`test/signals.mjs` makes the synthetic signals: formant-filtered glottal pulse voices at 95–380 Hz,
claps, tonal table knocks, door bangs, steady noise and quiet TV babble. Measured onset latency is
44–55 ms. The app was also run end to end in headless Chrome with a synthetic WAV as the fake microphone, on every
tab, with tab switching (never more than one live mic track).

## Safety
No flashing (the glow pulses at 0.4 Hz), no text, numbers or scores for Liam, no sad or failure states,
no ads, no accounts, no network calls after load. Phone mic only; it never connects to his processors.
His audiologist and AVT therapist set his goals. This is play that supports them.
