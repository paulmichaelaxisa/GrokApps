// AudioWorklet: runs the voice detector on the audio thread (128-sample blocks, ~3 ms).
import { VoiceDetector } from "./detector.mjs";

class MicProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.d = new VoiceDetector(sampleRate);
    this.n = 0;
    this.port.onmessage = (e) => handle(this.d, e.data);
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      for (const r of this.d.process(ch)) {
        // events always; level updates every other hop (~47 per second) is plenty for drawing
        if (r.event || r.event2 || r.calibrating || ++this.n % 2 === 0) this.port.postMessage(r);
      }
    }
    return true;
  }
}

export function handle(d, m) {
  if (m.type === "floor") d.setFloor(m.db);
  else if (m.type === "sens") d.setSensitivity(m.db);
  else if (m.type === "calibrate") d.startCalibration(m.sec || 3);
  else if (m.type === "mute") d.muteUntil(d.time + m.sec);
}

registerProcessor("mic-processor", MicProcessor);
