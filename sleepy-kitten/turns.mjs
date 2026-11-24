// Sleepy Kitten turn-taking brain. Pure logic: feed it voice onsets/ends and clock ticks.
//
// Who is speaking? There is no pitch detection, so speakers are told apart by turn order:
//  - "turns" (default): the first voice while the kitten sleeps is Dad's model. A voice that starts
//    within `turnGap` seconds of the previous one ending is the same speaker carrying on. A voice after
//    a longer pause is the other person's turn: Dad -> Liam -> Dad -> ...
//  - "hold": Dad presses and holds anywhere on the screen while he talks. Voice during the hold is
//    Dad's; every other voice is Liam's.
//  - "any": every voice is Liam's (solo play). The kitten waits with the glow between sounds.

export const MODES = ["turns", "hold", "any"];

export class KittenBrain {
  constructor(opts = {}) {
    this.o = { mode: "turns", turnGap: 1.0, settleAfter: 15, settleSec: 3, curlSec: 4, sessionSec: 240, ...opts };
    this.start(0);
  }
  start(t) {
    this.state = "sleep"; this.since = t; this.awake = false;
    this.current = null; this.lastEnd = null; this.hold = false;
    this.sessionStart = t; this.sessionOver = false; this.listening = true;
    this.reward = null; this.glow = this.o.mode === "any";
    this.stats = { liamSounds: 0, longest: 0, dadModels: 0 };
  }
  set(k, v) { this.o[k] = v; if (k === "mode") this.glow = v === "any" && !this.sessionOver; }
  setHold(on) { this.hold = on; }
  go(state, t) { this.state = state; this.since = t; }

  whoIs(t) {
    const m = this.o.mode;
    if (m === "any") return "liam";
    if (m === "hold") return this.hold ? "dad" : "liam";
    const le = this.lastEnd;
    if (le && t - le.t < this.o.turnGap) return le.speaker;           // same person carrying on
    if (!le || this.state === "sleep" || this.state === "settle") return "dad"; // first voice = Dad's model
    return le.speaker === "dad" ? "liam" : "dad";                     // take turns
  }

  onOnset(t) {
    if (!this.listening || this.state === "curl" || this.state === "done") return null;
    const speaker = this.whoIs(t);
    this.current = { speaker, start: t };
    if (speaker === "dad") {
      this.stats.dadModels++;
      this.glow = false;
      this.go("stir", t);           // ears twitch / eye opens, instantly
    } else {
      this.glow = false; this.awake = true; this.reward = null;
      this.go("wake", t);           // wakes fully, instantly; wiggle grows while he keeps going
    }
    return speaker;
  }

  onEnd(t, duration) {
    const cur = this.current; this.current = null;
    if (!cur) return null;
    this.lastEnd = { speaker: cur.speaker, t };
    if (this.state === "curl" || this.state === "done") return cur.speaker;
    if (cur.speaker === "dad") {
      this.glow = true;             // "your turn" cue
      this.go("wait", t);
    } else {
      this.stats.liamSounds++;
      this.stats.longest = Math.max(this.stats.longest, duration);
      const size = Math.max(0.2, Math.min(1, duration / 2));
      this.reward = { size, hop: duration >= 1.2, purr: duration >= 0.8, holdSec: 1.6 + 2.2 * size };
      this.go("happy", t);
    }
    return cur.speaker;
  }

  /** Liam's live reward size while he is still making a sound (longer = bigger). */
  liveSize(t) { return this.state === "wake" && this.current ? Math.max(0.2, Math.min(1, (t - this.current.start) / 2)) : 0; }

  tick(t) {
    const el = t - this.since;
    if (!this.sessionOver && t - this.sessionStart >= this.o.sessionSec) this.sessionOver = true;
    const busy = this.state === "stir" || this.state === "wake" || (this.state === "happy" && el < this.reward.holdSec);
    if (this.sessionOver && !busy && this.state !== "curl" && this.state !== "done") {
      this.glow = false; this.go("curl", t); return this.state;
    }
    switch (this.state) {
      case "happy":
        if (el >= this.reward.holdSec) {
          this.go(this.o.mode === "turns" ? "idle" : "wait", t);
          this.glow = this.o.mode !== "turns"; // in turns mode it's Dad's go next
        }
        break;
      case "wait": case "idle": {
        const quiet = this.lastEnd ? t - this.lastEnd.t : el;
        if (quiet >= this.o.settleAfter) { this.glow = false; this.go("settle", t); }
        break;
      }
      case "settle":
        if (el >= this.o.settleSec) { this.awake = false; this.go("sleep", t); this.glow = this.o.mode === "any"; this.lastEnd = null; }
        break;
      case "curl":
        if (el >= this.o.curlSec) { this.awake = false; this.listening = false; this.go("done", t); }
        break;
    }
    return this.state;
  }

  /** Which pose the art should be heading to: "sleeping", "waiting" or "wiggle". */
  pose() {
    switch (this.state) {
      case "stir": case "wait": case "idle": return "waiting";
      case "wake": case "happy": return "wiggle";
      default: return "sleeping"; // sleep, settle, curl, done
    }
  }
}
