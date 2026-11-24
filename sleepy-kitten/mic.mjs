// Shared microphone engine: one stream, one AudioContext, the voice detector in an AudioWorklet.
// start() always tears down any previous graph first; a generation counter drops stale starts, so
// switching tabs quickly can never leave two mic streams open.
export class Mic {
  constructor({ onHop, onProblem, onNeedTap, onRunning }) {
    Object.assign(this, { onHop, onProblem, onNeedTap, onRunning });
    this.gen = 0; this.ctx = null; this.stream = null; this.node = null; this.post = () => {};
    this.allStreams = new Set(); // for leak checks
  }
  get liveTracks() { let n = 0; for (const s of this.allStreams) for (const tr of s.getTracks()) if (tr.readyState === "live") n++; return n; }
  get running() { return !!this.ctx && this.ctx.state === "running"; }

  async start({ sens = 0, floorDb = null, calibrate = true } = {}) {
    this.stop();
    const gen = ++this.gen;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { this.onProblem("This browser can't use the microphone."); return false; }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
    } catch (err) {
      if (gen === this.gen) this.onProblem(err && err.name === "NotAllowedError"
        ? "Microphone access is off. Allow the microphone for this app in your phone's settings, then tap Try again."
        : "The microphone isn't available right now. Tap Try again.");
      return false;
    }
    this.allStreams.add(stream);
    if (gen !== this.gen) { stream.getTracks().forEach((t) => t.stop()); return false; }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx({ latencyHint: "interactive" });
    const teardown = () => { stream.getTracks().forEach((t) => t.stop()); ctx.close().catch(() => {}); };
    try {
      const src = ctx.createMediaStreamSource(stream);
      const sink = ctx.createGain(); sink.gain.value = 0; sink.connect(ctx.destination);
      let node, post;
      if (ctx.audioWorklet) {
        await ctx.audioWorklet.addModule("mic-worklet.js?v=1");
        if (gen !== this.gen) { teardown(); return false; }
        node = new AudioWorkletNode(ctx, "mic-processor", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
        node.port.onmessage = (e) => { if (gen === this.gen) this.onHop(e.data); };
        post = (m) => node.port.postMessage(m);
      } else {
        const { VoiceDetector } = await import("./detector.mjs");
        if (gen !== this.gen) { teardown(); return false; }
        const d = new VoiceDetector(ctx.sampleRate);
        node = ctx.createScriptProcessor(1024, 1, 1);
        node.onaudioprocess = (e) => { if (gen === this.gen) for (const r of d.process(e.inputBuffer.getChannelData(0))) this.onHop(r); };
        post = (m) => { if (m.type === "floor") d.setFloor(m.db); else if (m.type === "sens") d.setSensitivity(m.db);
          else if (m.type === "calibrate") d.startCalibration(m.sec || 3); else if (m.type === "mute") d.muteUntil(d.time + m.sec); };
      }
      src.connect(node); node.connect(sink);
      Object.assign(this, { ctx, stream, node, post, src });
      post({ type: "sens", db: sens });
      if (floorDb != null) post({ type: "floor", db: floorDb });
      if (calibrate) post({ type: "calibrate", sec: 3 });
    } catch (e) { teardown(); if (gen === this.gen) this.onProblem("The microphone couldn't start. Tap Try again."); return false; }
    await this.ensureRunning();
    return true;
  }

  async ensureRunning() {
    const ctx = this.ctx; if (!ctx) return;
    if (ctx.state !== "running") {
      try { await Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, 500))]); } catch (_) {}
    }
    if (ctx !== this.ctx) return;
    if (ctx.state === "running") this.onRunning(); else this.onNeedTap();
  }

  stop() {
    this.gen++;
    try { if (this.node) { this.node.port && (this.node.port.onmessage = null); this.node.onaudioprocess = null; this.node.disconnect(); } } catch (_) {}
    try { this.src && this.src.disconnect(); } catch (_) {}
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    if (this.ctx) this.ctx.close().catch(() => {});
    this.ctx = this.stream = this.node = this.src = null; this.post = () => {};
  }
}
