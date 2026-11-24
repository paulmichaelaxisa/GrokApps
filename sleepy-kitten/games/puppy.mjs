// Copycat Puppy: the puppy "talks" along with any voice (ripples follow loudness instantly), and a
// long reply from Liam (2 s or more) earns one happy wag (re-timed 1.3x slower to match the kitten's calm).
import { ClipPlayer, ease } from "../clips.mjs?v=1";

const CLIPS = {
  waiting: { loop: true, sec: 3 }, talking_soft: { loop: true, sec: 3 }, talking: { loop: true, sec: 3 },
  happy_wag: { loop: true, sec: 3.888 }, lying_down: { loop: false, sec: 3, next: "sleeping" },
  sleeping: { loop: true, sec: 3 }, waking: { loop: false, sec: 3, next: "waiting" },
};
const LOUD_ON = 0.45, LOUD_OFF = 0.32; // talking vs talking_soft, with hysteresis

export default class PuppyGame {
  static id = "puppy"; static icon = "art/tabs/tab_copycat_puppy_alpha.png"; static anchor = "center";
  constructor(app) { this.app = app; }

  async mount(stage, { over }) {
    this.stage = stage;
    stage.innerHTML = `<div class="p-body"></div>
      <img class="p-rip left" src="art/puppy/ripple_left.png" alt="" draggable="false">
      <img class="p-rip right" src="art/puppy/ripple_right.png" alt="" draggable="false">`;
    this.body = stage.querySelector(".p-body");
    this.ripL = stage.querySelector(".p-rip.left"); this.ripR = stage.querySelector(".p-rip.right");
    this.player = new ClipPlayer(this.body, (n, ext) => `art/puppy/puppy_${n}.${ext}`);
    this.over = over; this.restDone = over; this.ending = false;
    this.state = over ? "sleeping" : "waiting"; // waiting | talking | wag | lying | sleeping | waking
    this.speaking = null; this.quietSince = null; this.loud = false; this.rip = 0; this.ripPhase = 0; this.wagUntil = 0;
    await this.player.preload(Object.keys(CLIPS));
    this.player.play(over ? "sleeping" : "waiting", 0, { still: over || this.app.settings.calm });
  }
  unmount() { this.player.destroy(); this.stage.innerHTML = ""; }

  onOnset(t, who) {
    if (this.over || this.ending) return;
    this.speaking = { who, start: t }; this.quietSince = null;
    if (this.state === "waiting" || this.state === "talking") this.state = "talking";
  }
  onEnd(t, dur, who) {
    if (!this.speaking) return;
    this.speaking = null; this.quietSince = t;
    if (who === "liam") {
      this.app.stat(dur);
      if (dur >= 2 && !this.ending) { this.state = "wag"; this.wagStart = null; this.app.chime(); }
    }
  }
  liamTurn(t) { return this.app.turns.liamTurn(t); }
  endSession() { this.ending = true; }
  get done() { return this.restDone; }
  newSession() { this.over = false; this.restDone = false; this.ending = false; this.state = "waking"; this.player.play("waking", 0.2, { still: this.app.settings.calm }); }

  frame(t, dt, lvl) {
    const p = this.player, still = this.app.settings.calm;
    p.update(dt);
    // ripples beside the muzzle: 40 ms attack, 120 ms release, size 0.6-1.2, opacity 0-0.9
    const target = this.speaking ? Math.min(1, 0.25 + lvl) : 0;
    this.rip = ease(this.rip, target, dt, 0.04, 0.12);
    this.ripPhase += dt;
    const sc = 0.6 + 0.6 * this.rip, drift = 6 * this.rip;
    this.ripL.style.opacity = this.ripR.style.opacity = (0.9 * this.rip).toFixed(3);
    this.ripL.style.transform = `translateX(${(-drift).toFixed(1)}px) scale(${sc.toFixed(3)})`;
    this.ripR.style.transform = `translateX(${drift.toFixed(1)}px) scale(${sc.toFixed(3)})`;
    if (p.busy) return;
    const el = p.elapsed(t), clip = p.clip;

    if (this.ending && !this.over && this.state !== "wag" && this.state !== "lying") {
      if (!this.speaking) { this.state = "lying"; p.play("lying_down", 0.15, { still }); }
      return;
    }
    switch (this.state) {
      case "waking": if (clip === "waking" && el >= CLIPS.waking.sec) { this.state = "waiting"; p.play("waiting", 0.08, { still }); } break;
      case "lying":
        if (clip === "lying_down" && el >= CLIPS.lying_down.sec) { this.state = "sleeping"; this.over = true; this.restDone = true; p.play("sleeping", 0.08, { still }); }
        break;
      case "wag":
        if (clip !== "happy_wag") { p.play("happy_wag", 0.15, { still }); break; }
        if (el >= CLIPS.happy_wag.sec) { this.state = "waiting"; p.play("waiting", 0.1, { still }); }
        break;
      case "talking": {
        if (this.speaking) {
          if (!this.loud && lvl > LOUD_ON) this.loud = true; else if (this.loud && lvl < LOUD_OFF) this.loud = false;
          const want = this.loud ? "talking" : "talking_soft";
          if (clip !== want) p.play(want, 0.13, { still });
        } else if (this.quietSince != null && t - this.quietSince >= 0.4) {
          this.state = "waiting"; p.play("waiting", 0.15, { still });
        }
        break;
      }
      case "waiting": if (clip !== "waiting") p.play("waiting", 0.15, { still }); break;
    }
  }
}
