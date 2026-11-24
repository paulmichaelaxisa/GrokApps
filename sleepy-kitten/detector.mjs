// Sleepy Kitten voice detector: loudness + timing, voice-band only.
// Pure JS (no DOM) so it runs in an AudioWorklet, on the main thread, or in Node tests.
//
// Pipeline per raw sample: high-pass 280 Hz (4th order) -> low-pass 3400 Hz (4th order)
// -> decimate to ~12 kHz. Every hop (128 decimated samples, ~10.7 ms) we compute:
//   - level: RMS of the last hop in dBFS (band-limited)
//   - flatness: spectral flatness over 300-3400 Hz (voice ~0.05-0.3, claps/noise ~0.5+)
//   - periodicity: normalised autocorrelation peak (voicing only; the pitch value is never used)
// A sound counts as voice once 4 consecutive hops (~43 ms) are loud, periodic and non-flat,
// and it is not decaying like a knock. That gives an onset well inside the 100 ms budget.

class Biquad {
  constructor(type, f0, fs, q = Math.SQRT1_2) {
    const w = (2 * Math.PI * f0) / fs, c = Math.cos(w), a = Math.sin(w) / (2 * q);
    let b0, b1, b2;
    if (type === "hp") { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; }
    else { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; }
    const a0 = 1 + a;
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0;
    this.a1 = (-2 * c) / a0; this.a2 = (1 - a) / a0;
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
  }
  step(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

function fftMag2(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k + len / 2], ai = im[i + k + len / 2];
        const tr = ar * cr - ai * ci, ti = ar * ci + ai * cr;
        re[i + k + len / 2] = re[i + k] - tr; im[i + k + len / 2] = im[i + k] - ti;
        re[i + k] += tr; im[i + k] += ti;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

export const DEFAULTS = {
  floorMarginDb: 10,     // threshold = noise floor + 10 dB (+ sensitivity)
  hysteresisDb: 3,       // stays "on" until 3 dB below threshold
  onsetHops: 4,          // ~43 ms of voiced frames before we call it a voice
  maxFlatness: 0.38,
  minPeriodicity: 0.5,
  hangoverMs: 180,       // short gaps (ba-ba) stay one utterance
  maxUnvoicedMs: 300,    // long unvoiced stretch (hiss, rustle) ends it
  knockDecayDb: 6,       // a sound that already fell 6 dB from its peak during onset is a knock
  minFloorDb: -80,
  trackSeconds: 6,       // adaptive floor window (steady TV/fan raises the floor)
  trackPercentile: 0.15,
  maxUtteranceSec: 6,    // a sound that never stops (TV, music) is background: raise the floor to it
  bgDecayDbPerSec: 0.3,  // background floor relaxes slowly once the background goes quiet
  splitJumpDb: 12,       // a voice 12 dB louder than the ongoing sound starts a new utterance
};

export class VoiceDetector {
  constructor(sampleRate, opts = {}) {
    this.o = { ...DEFAULTS, ...opts };
    this.sr = sampleRate;
    this.D = Math.max(1, Math.round(sampleRate / 12000));
    this.fs = sampleRate / this.D;
    this.filters = [new Biquad("hp", 280, sampleRate, 0.541), new Biquad("hp", 280, sampleRate, 1.307),
      new Biquad("lp", 3400, sampleRate, 0.541), new Biquad("lp", 3400, sampleRate, 1.307)];
    this.N = 512; this.H = 128;
    this.buf = new Float32Array(this.N); this.bufPos = 0; this.hopFill = 0; this.decCount = 0;
    this.hann = new Float32Array(this.N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (this.N - 1)));
    this.re = new Float32Array(this.N); this.im = new Float32Array(this.N);
    this.win = new Float32Array(this.N);
    this.binLo = Math.ceil((300 * this.N) / this.fs); this.binHi = Math.floor((3400 * this.N) / this.fs);
    this.lagMin = Math.floor(this.fs / 800); this.lagMax = Math.ceil(this.fs / 70);
    this.samples = 0;
    this.floorDb = -60; this.sensitivityDb = 0;
    this.track = []; this.trackMax = Math.round((this.o.trackSeconds * this.fs) / this.H);
    this.trackedFloor = -100; this.hopCount = 0; this.bgFloor = -200;
    this.mutedUntil = 0;
    this.cal = null;
    this.reset();
  }
  reset() {
    this.active = false; this.cand = 0; this.candStart = 0; this.candPeak = -200;
    this.onsetT = 0; this.lastLoudT = 0; this.unvoicedSince = null; this.peakDb = -200;
    this.actEma = null; this.jump = 0;
  }
  get time() { return this.samples / this.sr; }
  get thresholdDb() {
    return Math.max(this.floorDb, this.trackedFloor, this.bgFloor) + this.o.floorMarginDb - this.sensitivityDb;
  }
  setFloor(db) { this.floorDb = Math.max(this.o.minFloorDb, db); }
  setSensitivity(db) { this.sensitivityDb = db; }
  muteUntil(t) { this.mutedUntil = Math.max(this.mutedUntil, t); }
  startCalibration(seconds = 3) { this.cal = { until: this.time + seconds, vals: [] }; }

  /** Feed raw mic samples. Returns an array of hop results. */
  process(block) {
    const out = [];
    for (let i = 0; i < block.length; i++) {
      let x = block[i];
      for (const f of this.filters) x = f.step(x);
      this.samples++;
      if (++this.decCount < this.D) continue;
      this.decCount = 0;
      this.buf[this.bufPos] = x; this.bufPos = (this.bufPos + 1) % this.N;
      if (++this.hopFill >= this.H) { this.hopFill = 0; out.push(this.hop()); }
    }
    return out;
  }

  hop() {
    const { N, H } = this, t = this.time;
    for (let i = 0; i < N; i++) this.win[i] = this.buf[(this.bufPos + i) % N];
    let e = 0;
    for (let i = N - H; i < N; i++) e += this.win[i] * this.win[i];
    const db = 10 * Math.log10(e / H + 1e-12);
    this.hopCount++;

    // adaptive floor (low percentile of recent levels)
    this.track.push(db); if (this.track.length > this.trackMax) this.track.shift();
    if (this.hopCount % 16 === 0 && this.track.length >= this.trackMax / 2) {
      const s = [...this.track].sort((a, b) => a - b);
      this.trackedFloor = s[Math.floor(s.length * this.o.trackPercentile)];
    }

    if (this.cal) {
      this.cal.vals.push(db);
      if (t >= this.cal.until) {
        const s = this.cal.vals.sort((a, b) => a - b);
        this.setFloor(s[Math.floor(s.length * 0.3)] ?? -60);
        this.cal = null; this.reset();
        return { t, db, level: 0, voiced: false, active: false, event: { type: "calibrated", floorDb: this.floorDb } };
      }
      return { t, db, level: 0, voiced: false, active: false, calibrating: true, event: null };
    }

    if (!this.active && this.bgFloor > -200 && db < this.bgFloor - 6) {
      this.bgFloor -= (this.o.bgDecayDbPerSec * H * this.D) / this.sr;
      if (this.bgFloor < this.floorDb) this.bgFloor = -200;
    }
    const thr = this.thresholdDb;
    const loud = db >= thr;
    let flat = 1, per = 0;
    if (loud || this.active) { flat = this.flatness(); per = this.periodicity(); }
    const voiced = loud && flat <= this.o.maxFlatness && per >= this.o.minPeriodicity;
    const muted = t < this.mutedUntil;
    let event = null;

    if (muted) {
      if (this.active) event = this.endUtterance(t);
      this.cand = 0;
      return { t, db, thr, level: 0, voiced: false, active: false, muted: true, flat, per, event };
    }

    if (!this.active) {
      if (voiced) {
        if (this.cand === 0) { this.candStart = t - (H * this.D) / this.sr; this.candPeak = db; }
        this.cand++; this.candPeak = Math.max(this.candPeak, db);
        if (this.cand >= this.o.onsetHops) {
          if (db < this.candPeak - this.o.knockDecayDb) { this.cand = 0; } // decaying like a knock
          else {
            this.active = true; this.onsetT = this.candStart; this.lastLoudT = t;
            this.peakDb = this.candPeak; this.unvoicedSince = null;
            event = { type: "onset", t: this.onsetT, detectedAt: t };
          }
        }
      } else this.cand = 0;
    } else {
      if (db >= thr - this.o.hysteresisDb) { this.lastLoudT = t; this.peakDb = Math.max(this.peakDb, db); }
      const a = (H * this.D) / this.sr; // hop seconds
      this.actEma = this.actEma == null ? db : this.actEma + (db - this.actEma) * Math.min(1, a / 1.0);
      if (voiced && db > this.actEma + this.o.splitJumpDb) this.jump++; else this.jump = 0;
      if (this.jump >= 3 && t - this.onsetT > 0.5) {
        // a much louder voice on top of an ongoing sound: close the old one, open a new one now
        const bg = this.actEma;
        event = this.endUtterance(t - 3 * a);
        event.split = true;
        if (t - event.start > 2) this.bgFloor = Math.max(this.bgFloor, bg);
        this.active = true; this.onsetT = t - 3 * a; this.lastLoudT = t; this.peakDb = db;
        this.actEma = db; this.jump = 0;
        return { t, db, thr, level: Math.min(1, Math.max(0, (db - this.thresholdDb + 6) / 24)), voiced, active: true, flat, per,
          event, event2: { type: "onset", t: this.onsetT, detectedAt: t } };
      }
      if (t - this.onsetT > this.o.maxUtteranceSec) {
        this.bgFloor = Math.max(this.bgFloor, this.actEma);
        event = this.endUtterance(t); event.background = true;
        return { t, db, thr, level: 0, voiced, active: false, flat, per, event };
      }
      if (voiced) this.unvoicedSince = null; else if (this.unvoicedSince == null) this.unvoicedSince = t;
      const quietTooLong = t - this.lastLoudT > this.o.hangoverMs / 1000;
      const unvoicedTooLong = this.unvoicedSince != null && t - this.unvoicedSince > this.o.maxUnvoicedMs / 1000;
      if (quietTooLong || unvoicedTooLong) event = this.endUtterance(t);
    }
    const level = this.active ? Math.min(1, Math.max(0, (db - thr + 6) / 24)) : 0;
    return { t, db, thr, level, voiced, active: this.active, flat, per, event };
  }

  endUtterance(t) {
    const end = Math.min(t, this.lastLoudT);
    const ev = { type: "end", t: end, start: this.onsetT, duration: Math.max(0, end - this.onsetT),
      peak: Math.min(1, Math.max(0, (this.peakDb - this.thresholdDb + 6) / 24)) };
    this.reset();
    return ev;
  }

  flatness() {
    const { N, re, im, win, hann } = this;
    for (let i = 0; i < N; i++) { re[i] = win[i] * hann[i]; im[i] = 0; }
    fftMag2(re, im);
    let lg = 0, ar = 0, n = 0;
    for (let k = this.binLo; k <= this.binHi; k++) {
      const p = re[k] * re[k] + im[k] * im[k] + 1e-14;
      lg += Math.log(p); ar += p; n++;
    }
    return Math.exp(lg / n) / (ar / n);
  }

  periodicity() {
    const { N, win } = this, M = N - this.lagMax;
    const x0 = N - M; // compare the newest M samples with lagged copies
    let e0 = 0;
    for (let i = x0; i < N; i++) e0 += win[i] * win[i];
    if (e0 <= 0) return 0;
    let best = 0;
    for (let lag = this.lagMin; lag <= this.lagMax; lag++) {
      let num = 0, e1 = 0;
      for (let i = x0; i < N; i++) { const y = win[i - lag]; num += win[i] * y; e1 += y * y; }
      const r = num / Math.sqrt(e0 * e1 + 1e-20);
      if (r > best) best = r;
    }
    return best;
  }
}
