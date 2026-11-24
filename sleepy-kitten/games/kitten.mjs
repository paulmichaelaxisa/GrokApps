// Sleepy Kitten: Dad's voice stirs the kitten, the glow says "your turn", Liam's reply wakes it.
import { KittenBrain } from "../turns.mjs?v=2";
import { ClipPlayer, ease } from "../clips.mjs?v=1";

const CLIPS = {
  sleeping: { loop: true, sec: 3 }, stirring: { loop: false, sec: 2.5, next: "waiting" },
  waiting: { loop: true, sec: 3 }, awake_wiggle: { loop: true, sec: 3 }, curling_up: { loop: false, sec: 2.5, next: "sleeping" },
};

export default class KittenGame {
  static id = "kitten"; static icon = "art/tabs/tab_sleepy_kitten_alpha.png"; static anchor = "center";
  constructor(app) { this.app = app; }

  async mount(stage, { over }) {
    this.stage = stage;
    stage.innerHTML = `<div class="k-ripples"></div><div class="k-body"></div><div class="k-glow"></div>`;
    this.body = stage.querySelector(".k-body"); this.glowEl = stage.querySelector(".k-glow"); this.ripHost = stage.querySelector(".k-ripples");
    this.player = new ClipPlayer(this.body, (n, ext) => `art/kitten_${n}.${ext}`);
    const s = this.app.settings, now = this.app.now();
    this.brain = new KittenBrain({ mode: s.mode, turnGap: s.turnGap, sessionSec: 1e9 });
    this.brain.start(now);
    this.over = over; this.restDone = over; this.kick = 0; this.glowA = 0; this.wiggleExitAt = null;
    await this.player.preload(Object.keys(CLIPS));
    this.player.play("sleeping", 0, { still: over || s.calm });
  }
  unmount() { this.player.destroy(); this.stage.innerHTML = ""; }

  setHold(on) { this.brain.setHold(on); }
  setOption(k, v) { if (k === "mode" || k === "turnGap") this.brain.set(k, v); }
  onOnset(t) { const who = this.brain.onOnset(t); if (who) this.kick = who === "liam" ? 1 : 0.6; return who; }
  onEnd(t, dur) {
    const who = this.brain.onEnd(t, dur);
    if (who === "liam") { this.app.stat(dur); if (this.brain.reward?.purr) this.ripples(this.brain.reward.size); this.app.chime(); }
    return who;
  }
  liamTurn() { return this.brain.state === "wake" || this.brain.state === "happy" || this.brain.glow; }
  endSession() { this.brain.sessionOver = true; }
  get done() { return this.restDone; }
  newSession(t) { this.brain.start(t); this.over = false; this.restDone = false; this.player.play("sleeping", 0.6); }

  ripples(size) {
    if (this.app.settings.calm) return;
    const n = size > 0.7 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const r = document.createElement("div"); r.className = "ripple"; r.style.animationDelay = `${i * 0.45}s`;
      this.ripHost.appendChild(r); setTimeout(() => r.remove(), 3500 + i * 450);
    }
  }

  direct(t) {
    const p = this.player;
    if (p.busy || this.over) return;
    const calm = this.app.settings.calm, still = calm;
    const target = this.brain.pose(); // sleeping | waiting | wiggle
    const clip = p.clip, el = p.elapsed(t), c = CLIPS[clip];
    if (!c) { p.play(target === "waiting" ? "waiting" : "sleeping", 0.3, { still }); return; }
    if (target === "wiggle") { if (clip !== "awake_wiggle") p.play("awake_wiggle", 0.2, { still }); return; }
    if (clip === "awake_wiggle") {
      if (this.wiggleExitAt == null) {
        const minCycles = this.brain.reward && this.brain.reward.size >= 0.6 ? 2 : 1;
        this.wiggleExitAt = p.start + Math.max(minCycles, Math.ceil((el + 0.05) / 3)) * 3;
      }
      if (t >= this.wiggleExitAt) { this.wiggleExitAt = null; p.play("waiting", 0.08, { still }); }
      return;
    }
    this.wiggleExitAt = null;
    if (!c.loop) { if (el >= c.sec) p.play(c.next, 0.08, { still }); return; }
    if (clip === "sleeping" && target === "waiting") p.play("stirring", 0.15, { still });
    else if (clip === "waiting" && target === "sleeping") p.play("curling_up", 0.15, { still });
  }

  frame(t, dt, lvl) {
    const prev = this.brain.state;
    this.brain.tick(t);
    if (prev !== "done" && this.brain.state === "done") { this.over = true; this.restDone = true; this.player.play("sleeping", 1.5, { still: true }); }
    this.direct(t);
    this.player.update(dt);
    this.kick *= Math.exp(-dt / 0.35);
    const st = this.brain.state, calm = this.app.settings.calm;
    let lift = 0, scale = 1;
    if (st === "stir" || st === "wait" || st === "wake") { lift = -(lvl * 8 + this.kick * 8); scale = 1 + lvl * 0.035 + this.kick * 0.02; }
    else if (st === "happy" && !calm) {
      const r = this.brain.reward || { size: 0.3, hop: false }, el = t - this.brain.since;
      if (r.hop && el < 1.6) lift = -Math.abs(Math.sin(Math.PI * 1.25 * el)) * 16 * r.size;
    }
    this.body.style.transform = `translateY(${lift.toFixed(1)}px) scale(${scale.toFixed(3)})`;
    const clip = this.player.clip;
    const gOn = this.brain.glow && (clip === "waiting" || clip === "sleeping" || (clip === "stirring" && this.player.elapsed(t) > 1.5));
    const gT = gOn ? 0.5 + 0.3 * (0.5 + 0.5 * Math.sin((2 * Math.PI * t) / 2.6)) : 0;
    this.glowA = ease(this.glowA, gT, dt, 0.6);
    this.glowEl.style.opacity = this.glowA.toFixed(3);
  }
}
