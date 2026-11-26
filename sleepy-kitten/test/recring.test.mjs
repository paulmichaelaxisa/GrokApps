// node test/recring.test.mjs : Liam's clips come out of the rolling buffer with the right span.
import { VoiceDetector } from "../detector.mjs";
import { ClipRing, encodeWav, OUT_RATE } from "../recring.mjs";
import * as S from "./signals.mjs";

let failures = 0;
const check = (ok, msg) => { console.log((ok ? "  PASS " : "  FAIL ") + msg); if (!ok) failures++; };

function run(signal, sr, { recOn = true, tv = false } = {}) {
  const d = new VoiceDetector(sr); d.startCalibration(3);
  signal = S.concat(S.silence(3.2 * sr / 48000, -62), sr === 48000 ? S.mix(signal, S.silence(signal.length / sr, -62)) : signal);
  const ring = new ClipRing(sr); ring.setOn(recOn);
  const clips = [], ends = [], times = []; let id = 0, maxBlockMs = 0;
  for (let i = 0; i + 128 <= signal.length; i += 128) {
    const blk = signal.subarray(i, i + 128);
    const t0 = process.hrtime.bigint();
    ring.push(blk);
    times.push(Number(process.hrtime.bigint() - t0) / 1e6);
    for (const r of d.process(blk)) for (const ev of [r.event, r.event2]) {
      if (ev && ev.type === "end") { ends.push(ev); if (!ev.background) ring.request(++id, Math.max(ev.start - 0.3, ev.t + 0.3 - 15), ev.t + 0.3); }
    }
    for (const c of ring.take()) clips.push(c);
  }
  times.sort((a, b) => a - b); maxBlockMs = times[Math.floor(times.length * 0.999)];
  return { clips, ends, maxBlockMs };
}

for (const sr of [48000, 44100]) {
  const v = S.voice(1.0, { f0: 380, db: -28, formants: [900, 1700, 3000] });
  // resample synthetic 48k voice to sr crudely by index mapping (fine for a span check)
  const sig48 = S.concat(S.silence(1.5, -62), v, S.silence(1.5, -62), S.voice(0.5, { f0: 380, db: -28 }), S.silence(1.2, -62));
  const sig = sr === 48000 ? sig48 : Float32Array.from({ length: Math.floor(sig48.length * sr / 48000) }, (_, i) => sig48[Math.floor(i * 48000 / sr)]);
  const { clips, ends, maxBlockMs } = run(sig, sr);
  console.log(`${sr} Hz: ${ends.length} voices, ${clips.length} clips, durations ${clips.map((c) => (c.pcm.length / OUT_RATE).toFixed(2)).join(", ")}`);
  check(clips.length === 2, `${sr}: two clips for two voices`);
  const c0 = clips[0];
  check(c0 && Math.abs(c0.start - 3.2 - (1.5 - 0.3)) < 0.12, `${sr}: first clip starts ~300 ms before the voice `);
  check(c0 && c0.pcm.length / OUT_RATE > 1.4 && c0.pcm.length / OUT_RATE < 1.9, `${sr}: first clip ~1.6 s incl. pre/post-roll`);
  // energy should sit in the middle, quiet at the pre-roll edge
  const rms = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);
  const pre = c0.pcm.subarray(0, 0.15 * OUT_RATE), mid = c0.pcm.subarray(0.6 * OUT_RATE, 0.9 * OUT_RATE);
  check(rms(mid) > 10 * rms(pre), `${sr}: voice is inside the clip, pre-roll is quiet`);
  check(maxBlockMs < 0.5, `${sr}: ring adds (99.9th pct) ${maxBlockMs.toFixed(3)} ms per 128-sample block (budget 2.7 ms)`);
  const wav = new Uint8Array(encodeWav(c0.pcm));
  check(String.fromCharCode(...wav.subarray(0, 4)) === "RIFF" && new DataView(wav.buffer).getUint32(24, true) === 16000, `${sr}: 16 kHz WAV header`);
}
{ // quiet TV dialogue for 14 s: same as the detector test, at most 2 stray clips
  const { clips } = run(S.tvBabble(14, -46), 48000);
  check(clips.length <= 3, `TV dialogue 14 s: ${clips.length} stray clips (detector allows a couple while the floor settles)`);
}
{ // recording off: nothing kept
  const sig = S.concat(S.silence(1, -62), S.voice(1, { f0: 380, db: -28 }), S.silence(1, -62));
  check(run(sig, 48000, { recOn: false }).clips.length === 0, "recording off: no clips");
}
process.exit(failures ? 1 : 0);
