// Liam's sound clips: a rolling 16 kHz mono buffer of the mic, kept only while "Save Liam's sounds"
// is on. Pure JS (no DOM) so it runs inside the AudioWorklet next to the voice detector, on the main
// thread (ScriptProcessor fallback) or in Node tests. Times are the detector's clock: input samples
// processed / input sample rate, so a voice event's start/end map straight onto this buffer.
export const OUT_RATE = 16000;

class LowPass { // 2nd-order Butterworth-ish low-pass (anti-alias before resampling)
  constructor(f0, fs, q) {
    const w = (2 * Math.PI * f0) / fs, c = Math.cos(w), a = Math.sin(w) / (2 * q), a0 = 1 + a;
    this.b0 = (1 - c) / 2 / a0; this.b1 = (1 - c) / a0; this.b2 = this.b0;
    this.a1 = (-2 * c) / a0; this.a2 = (1 - a) / a0; this.x1 = this.x2 = this.y1 = this.y2 = 0;
  }
  step(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y; return y;
  }
}

export class ClipRing {
  constructor(sampleRate, seconds = 20) {
    this.sr = sampleRate; this.step = sampleRate / OUT_RATE;
    this.size = Math.ceil(seconds * OUT_RATE); this.ring = new Float32Array(this.size);
    this.lp = sampleRate > OUT_RATE * 1.2 ? [new LowPass(7000, sampleRate, 0.541), new LowPass(7000, sampleRate, 1.307)] : [];
    this.n = 0;          // input samples seen (same count as the detector's)
    this.k = 0;          // next output sample index
    this.kValid = 0;     // first output index with real audio in the ring
    this.on = false; this.prev = 0; this.pending = [];
  }
  setOn(on) {
    if (on && !this.on) { this.k = Math.ceil(this.n / this.step); this.kValid = this.k; this.prev = 0; this.pending = []; }
    if (!on) this.pending = [];
    this.on = on;
  }
  /** Feed raw mic samples (call once per block, before or after the detector, with the same block). */
  push(block) {
    if (!this.on) { this.n += block.length; return; }
    const { lp, ring, size, step } = this;
    for (let i = 0; i < block.length; i++) {
      let x = block[i];
      for (let j = 0; j < lp.length; j++) x = lp[j].step(x);
      const n = this.n++;              // this sample's index
      let pos = this.k * step;         // input-sample position of the next output sample
      while (pos <= n) {
        const f = pos - (n - 1);       // between previous sample (n-1) and this one (n)
        ring[this.k % size] = this.prev + (x - this.prev) * (f < 0 ? 0 : f);
        this.k++; pos = this.k * step;
      }
      this.prev = x;
    }
  }
  get time() { return this.n / this.sr; }
  /** Ask for [start, end] seconds (detector clock); delivered by take() once `end` has been heard. */
  request(id, start, end) { if (this.on) this.pending.push({ id, start, end }); }
  /** Requests whose audio is complete: [{ id, pcm: Float32Array(16 kHz) }]. */
  take() {
    if (!this.pending.length) return [];
    const ready = [], now = this.k / OUT_RATE;
    this.pending = this.pending.filter((r) => {
      if (r.end > now) return true;
      const pcm = this.slice(r.start, r.end);
      if (pcm) ready.push({ id: r.id, pcm, start: r.start, end: r.end });
      return false;
    });
    return ready;
  }
  slice(start, end) {
    const kS = Math.max(Math.round(start * OUT_RATE), this.kValid, this.k - this.size + 1);
    const kE = Math.min(Math.round(end * OUT_RATE), this.k);
    if (kE - kS < OUT_RATE * 0.1) return null;
    const out = new Float32Array(kE - kS);
    for (let i = 0; i < out.length; i++) out[i] = this.ring[(kS + i) % this.size];
    return out;
  }
}

/** 16-bit PCM WAV (mono). Gentle peak normalisation (max x8) so quiet clips are easy to hear. */
export function encodeWav(pcm, rate = OUT_RATE, { normalise = true } = {}) {
  let peak = 0; for (let i = 0; i < pcm.length; i++) { const a = Math.abs(pcm[i]); if (a > peak) peak = a; }
  const gain = normalise && peak > 1e-5 ? Math.min(8, 0.7 / peak) : 1;
  const buf = new ArrayBuffer(44 + pcm.length * 2), v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + pcm.length * 2, true); str(8, "WAVE"); str(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, "data");
  v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) { const s = Math.max(-1, Math.min(1, pcm[i] * gain)); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
  return buf;
}
