// Synthetic test signals (deterministic PRNG).
export const SR = 48000;
let seed = 12345;
export const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
export const gauss = () => { let u = 0, v = 0; while (!u) u = rand(); v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const dbToAmp = (db) => Math.pow(10, db / 20);

export function silence(sec, noiseDb = -62) {
  const n = Math.round(sec * SR), a = dbToAmp(noiseDb), out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = a * gauss();
  return out;
}

class Reso { // two-pole resonator (formant)
  constructor(f, bw) { const r = Math.exp(-Math.PI * bw / SR); this.a1 = -2 * r * Math.cos(2 * Math.PI * f / SR); this.a2 = r * r; this.g = 1 - r; this.y1 = this.y2 = 0; }
  step(x) { const y = this.g * x - this.a1 * this.y1 - this.a2 * this.y2; this.y2 = this.y1; this.y1 = y; return y; }
}

/** Vowel-like voice: glottal pulse train with jitter/vibrato through 3 formants. */
export function voice(sec, { f0 = 120, db = -24, formants = [700, 1220, 2600], attack = 0.03, release = 0.05 } = {}) {
  const n = Math.round(sec * SR), out = new Float32Array(n);
  const rs = formants.map((f, i) => new Reso(f, 80 + 40 * i));
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = f0 * (1 + 0.03 * Math.sin(2 * Math.PI * 5 * t) + 0.01 * gauss() * 0.1);
    ph += f / SR;
    let src = 0;
    if (ph >= 1) { ph -= 1; src = 1; }
    src += 0.02 * gauss(); // breath
    let y = 0; for (const r of rs) y += r.step(src);
    const env = Math.min(1, t / attack, (sec - t) / release);
    out[i] = y * Math.max(0, env);
  }
  // normalise to target RMS
  let e = 0; for (const v of out) e += v * v;
  const k = dbToAmp(db) / Math.sqrt(e / n + 1e-20);
  for (let i = 0; i < n; i++) out[i] *= k;
  return out;
}

/** Hand clap: broadband noise burst, ~1 ms attack, ~25 ms decay. */
export function clap(db = -6) {
  const n = Math.round(0.25 * SR), out = new Float32Array(n), a = dbToAmp(db);
  for (let i = 0; i < n; i++) { const t = i / SR; out[i] = a * gauss() * Math.min(1, t / 0.001) * Math.exp(-t / 0.025); }
  return out;
}
/** Knock on a table: tonal damped resonance (worst case for a periodicity check). */
export function knock(db = -6, f = 650, tau = 0.03) {
  const n = Math.round(0.3 * SR), out = new Float32Array(n), a = dbToAmp(db);
  for (let i = 0; i < n; i++) { const t = i / SR; out[i] = a * (Math.sin(2 * Math.PI * f * t) + 0.4 * Math.sin(2 * Math.PI * 2.3 * f * t) + 0.3 * gauss()) * Math.exp(-t / tau); }
  return out;
}
/** Door bang: low thud + noise, 150 ms decay. */
export function bang(db = -3) {
  const n = Math.round(0.6 * SR), out = new Float32Array(n), a = dbToAmp(db);
  for (let i = 0; i < n; i++) { const t = i / SR; out[i] = a * (0.7 * Math.sin(2 * Math.PI * 90 * t) + 0.5 * gauss()) * Math.exp(-t / 0.15); }
  return out;
}
/** Steady background (fan / TV hiss / music bed): coloured noise. */
export function steadyNoise(sec, db = -40) {
  const n = Math.round(sec * SR), out = new Float32Array(n); let b = 0;
  for (let i = 0; i < n; i++) { b = 0.97 * b + gauss(); out[i] = b; }
  let e = 0; for (const v of out) e += v * v; const k = dbToAmp(db) / Math.sqrt(e / n);
  for (let i = 0; i < n; i++) out[i] *= k;
  return out;
}
/** TV dialogue in the background: quiet babble of short voiced syllables. */
export function tvBabble(sec, db = -44) {
  const parts = []; let len = 0;
  while (len < sec) {
    const d = 0.12 + rand() * 0.25, g = 0.04 + rand() * 0.12;
    parts.push(voice(d, { f0: 100 + rand() * 150, db, formants: [500 + rand() * 400, 1100 + rand() * 600, 2500] }));
    parts.push(silence(g, -200)); len += d + g;
  }
  return concat(...parts).slice(0, Math.round(sec * SR));
}
export function concat(...arrs) {
  const n = arrs.reduce((s, a) => s + a.length, 0), out = new Float32Array(n); let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}
export function mix(a, b, offsetSec = 0) {
  const out = Float32Array.from(a), o = Math.round(offsetSec * SR);
  for (let i = 0; i < b.length && i + o < out.length; i++) out[i + o] += b[i];
  return out;
}
