// AudioWorklet: runs the voice detector on the audio thread (128-sample blocks, ~3 ms).
// When "Save Liam's sounds" is on, it also keeps a rolling 16 kHz copy of the mic (recring.mjs) and
// hands back the audio of a finished voice on request. Detection is untouched either way.
import { VoiceDetector } from "./detector.mjs";
import { ClipRing } from "./recring.mjs?v=1";

class MicProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.d = new VoiceDetector(sampleRate);
    this.ring = new ClipRing(sampleRate);
    this.n = 0;
    this.port.onmessage = (e) => handle(this.d, e.data, this.ring);
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      this.ring.push(ch);
      for (const r of this.d.process(ch)) {
        // events always; level updates every other hop (~47 per second) is plenty for drawing
        if (r.event || r.event2 || r.calibrating || ++this.n % 2 === 0) this.port.postMessage(r);
      }
      if (this.ring.pending.length) for (const c of this.ring.take()) this.port.postMessage({ clip: c }, [c.pcm.buffer]);
    }
    return true;
  }
}

export function handle(d, m, ring) {
  if (m.type === "floor") d.setFloor(m.db);
  else if (m.type === "sens") d.setSensitivity(m.db);
  else if (m.type === "calibrate") d.startCalibration(m.sec || 3);
  else if (m.type === "mute") d.muteUntil(d.time + m.sec);
  else if (m.type === "rec" && ring) ring.setOn(!!m.on);
  else if (m.type === "clip" && ring) ring.request(m.id, m.start, m.end);
}

registerProcessor("mic-processor", MicProcessor);
