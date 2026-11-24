// Headless tests for the voice detector: node test/detector.test.mjs
import { VoiceDetector } from "../detector.mjs";
import * as S from "./signals.mjs";

const { SR } = S;
let failures = 0;
const check = (ok, msg) => { console.log((ok ? "  PASS " : "  FAIL ") + msg); if (!ok) failures++; };

/** Run a signal through a detector (calibrated on 3 s of room noise first). Returns events. */
function run(signal, { noiseDb = -62, sens = 0, verbose = false } = {}) {
  const d = new VoiceDetector(SR);
  d.setSensitivity(sens);
  d.startCalibration(3);
  const all = S.concat(S.mix(S.silence(3.2, noiseDb), new Float32Array(0)), S.mix(signal, S.silence(signal.length / SR, noiseDb)));
  const events = [];
  for (let i = 0; i < all.length; i += 128) {
    for (const r of d.process(all.subarray(i, i + 128))) {
      if (verbose && (r.active || r.voiced)) console.log(r.t.toFixed(3), r.db.toFixed(1), r.thr?.toFixed(1), r.flat?.toFixed(2), r.per?.toFixed(2), r.voiced, r.active);
      for (const ev of [r.event, r.event2]) if (ev && ev.type !== "calibrated") events.push({ ...ev, t: ev.t - 3.2, start: ev.start != null ? ev.start - 3.2 : undefined, detectedAt: ev.detectedAt != null ? ev.detectedAt - 3.2 : undefined });
    }
  }
  return events;
}
const onsets = (ev) => ev.filter((e) => e.type === "onset");
const ends = (ev) => ev.filter((e) => e.type === "end");
const pad = (sig, before = 0.5, after = 1.0) => S.concat(S.silence(before, -200), sig, S.silence(after, -200));

console.log("Voices trigger quickly:");
for (const [name, opts] of [["Dad vowel 120 Hz", { f0: 120, db: -26 }], ["Liam vowel 380 Hz", { f0: 380, db: -24, formants: [900, 1700, 3000] }],
  ["quiet Liam 350 Hz (-38 dB)", { f0: 350, db: -38, formants: [850, 1600, 2900] }], ["Dad low 95 Hz", { f0: 95, db: -28 }]]) {
  const ev = run(pad(S.voice(0.8, opts)));
  const o = onsets(ev);
  const lat = o.length ? (o[0].detectedAt - 0.5) * 1000 : NaN;
  check(o.length === 1, `${name}: one onset (got ${o.length})`);
  check(lat < 100, `${name}: onset latency ${lat.toFixed(0)} ms < 100 ms`);
}

console.log("Duration is measured:");
for (const dur of [0.2, 0.6, 1.5, 3.0]) {
  const e = ends(run(pad(S.voice(dur, { f0: 360, db: -26, formants: [900, 1700, 3000] }))));
  check(e.length === 1 && Math.abs(e[0].duration - dur) < 0.12, `${dur}s sound -> duration ${e[0]?.duration.toFixed(2)} s`);
}

console.log("Babble 'ba-ba-ba' stays one utterance:");
{
  const syl = () => S.voice(0.2, { f0: 340, db: -26, formants: [800, 1300, 2700] });
  const sig = pad(S.concat(syl(), S.silence(0.12, -200), syl(), S.silence(0.12, -200), syl()));
  const ev = run(sig);
  check(onsets(ev).length === 1 && ends(ev).length === 1, `ba-ba-ba -> ${onsets(ev).length} onset(s), duration ${ends(ev)[0]?.duration.toFixed(2)} s`);
}

console.log("Noises are ignored:");
for (const [name, sig] of [["loud clap", S.clap(-6)], ["3 claps", S.concat(S.clap(-6), S.clap(-8), S.clap(-6))],
  ["table knock 650 Hz", S.knock(-6)], ["table knock 1 kHz", S.knock(-6, 1000, 0.04)], ["door bang", S.bang(-3)],
  ["steady fan/TV hiss 8 s", S.steadyNoise(8, -40)]]) {
  const ev = run(pad(sig));
  check(onsets(ev).length === 0, `${name}: ${onsets(ev).length} onsets`);
}

console.log("Background TV dialogue (quiet) vs close voice:");
{
  const tv = S.tvBabble(14, -46);
  const evTv = run(tv);
  check(onsets(evTv).length <= 2, `TV alone for 14 s: ${onsets(evTv).length} onsets (adaptive floor settles)`);
  const withLiam = S.mix(tv, S.voice(1.0, { f0: 360, db: -24, formants: [900, 1700, 3000] }), 10);
  const ev = run(withLiam).filter((e) => e.type === "onset" && e.t > 9.9 && e.t < 10.3);
  check(ev.length === 1, `Liam over TV at 10 s detected (${ev.length})`);
}

console.log("Sensitivity slider:");
{
  // room noise -50 dBFS; a faint far-away voice just above it
  const soft = pad(S.voice(0.8, { f0: 360, db: -53, formants: [900, 1700, 3000] }));
  check(onsets(run(soft, { sens: 0, noiseDb: -50 })).length === 0, "faint sound ignored at default sensitivity");
  check(onsets(run(soft, { sens: 8, noiseDb: -50 })).length === 1, "faint sound detected at +8 dB sensitivity");
  check(onsets(run(soft, { sens: -8, noiseDb: -50 })).length === 0, "faint sound ignored at -8 dB sensitivity");
}

console.log("Very short transients vs short syllables:");
{
  check(onsets(run(pad(S.voice(0.04, { f0: 360, db: -20, attack: 0.005, release: 0.01 })))).length === 0, "40 ms voiced blip ignored");
  check(onsets(run(pad(S.voice(0.15, { f0: 360, db: -26, formants: [800, 1300, 2700] })))).length === 1, "150 ms 'ba' detected");
}

console.log("CPU budget:");
{
  const d = new VoiceDetector(SR); d.setFloor(-70);
  const sig = S.concat(S.voice(5, { f0: 300, db: -24 }), S.silence(5, -60));
  const t0 = performance.now();
  for (let i = 0; i < sig.length; i += 128) d.process(sig.subarray(i, i + 128));
  const ms = performance.now() - t0;
  check(ms < 1000, `10 s of audio processed in ${ms.toFixed(0)} ms (${(ms / 100).toFixed(1)}% of real time)`);
}

console.log("Mute while the app plays a sound:");
{
  const d = new VoiceDetector(SR); d.setFloor(-62);
  d.muteUntil(1.5);
  const sig = S.concat(S.silence(0.2, -62), S.voice(0.8, { f0: 360, db: -24 }), S.silence(1, -62));
  let n = 0; for (let i = 0; i < sig.length; i += 128) for (const r of d.process(sig.subarray(i, i + 128))) if (r.event?.type === "onset") n++;
  check(n === 0, `voice during mute window ignored (${n} onsets)`);
}

console.log(failures ? `\n${failures} FAILED` : "\nAll detector tests passed");
process.exit(failures ? 1 : 0);
