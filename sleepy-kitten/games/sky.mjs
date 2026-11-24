// Sky Balloon (loudness + timing version): while he keeps a sound going the balloon rises (about
// 2.5 s of voice from the hill to the clouds; louder rises a little faster, capped). Loudness also
// drives the burner glow. When he stops it hangs for a moment, then drifts gently down, eased.
// Reaching the clouds and staying ~1 s plays Remy's cloud reward (bluebird + sun glow).
// No pitch detection: the original design maps pitch to height; this build uses voice time instead.
import { ClipPlayer, loadImages, ease } from "../clips.mjs?v=1";
import { SceneCanvas } from "./canvas.mjs?v=1";

const LOW = 452, HIGH = 268, RISE_SEC = 2.5, HANG_SEC = 0.8, FALL_PX_S = 77; // 15% of the scene per second

export default class SkyGame {
  static id = "sky"; static icon = "art/tabs/tab_sky_balloon_alpha.png"; static anchor = "bottom"; static wide = true;
  constructor(app) { this.app = app; }

  async mount(stage, { over }) {
    this.stage = stage;
    this.sc = new SceneCanvas(stage);
    const host = document.createElement("div"); host.className = "clip-host square"; stage.appendChild(host);
    this.player = new ClipPlayer(host, (n, ext) => `art/sky/sky_${n}.${ext}`);
    this.im = await loadImages({ hills: "art/sky/hills.png", wide: "art/sky/hills_wide.png", c1: "art/sky/cloud_1.png", c2: "art/sky/cloud_2.png", c3: "art/sky/cloud_3.png",
      balloon: "art/sky/hot_air_balloon@2x.png", burner: "art/sky/burner_glow.png", sun: "art/sky/sun_glow.png" });
    await this.player.preload(["resting", "cloud_reward"]);
    this.h = 0; this.hd = 0; this.burn = 0; this.sun = 0; this.speaking = false; this.lastEnd = -1e9; this.topTime = 0; this.rewarded = false;
    this.over = over; this.restDone = over; this.ending = false;
    this.mode = over ? "resting" : "live"; // live | reward | resting
    if (over) { this.player.play("resting", 0, { still: true }); } else this.player.setVisible(false);
  }
  unmount() { this.player.destroy(); this.sc.destroy(); this.stage.innerHTML = ""; }

  onOnset() { this.speaking = true; }
  onEnd(t, dur, who) { this.speaking = false; this.lastEnd = t; if (who === "liam") this.app.stat(dur); }
  liamTurn(t) { return this.app.turns.liamTurn(t); }
  endSession() { this.ending = true; }
  get done() { return this.restDone; }
  newSession() { this.over = this.restDone = this.ending = false; this.mode = "live"; this.h = this.hd = 0; this.player.setVisible(false); }

  frame(t, dt, lvl) {
    const p = this.player; p.update(dt);
    if (this.mode === "resting") { this.draw(t); return; }
    if (this.mode === "reward") {
      if (!p.busy && p.clip === "cloud_reward" && p.elapsed(t) >= 3) { this.mode = "live"; this.player.setVisible(false); this.sun = 0.85; }
      this.draw(t); return;
    }
    if (this.ending) {
      this.h = Math.max(0, this.h - dt * 1.2 * FALL_PX_S / (LOW - HIGH));
      if (this.hd < 0.01) { this.mode = "resting"; this.player.setVisible(true); this.player.play("resting", 0.3, { still: this.app.settings.calm }); this.over = this.restDone = true; }
    } else if (this.speaking) {
      this.h = Math.min(1, this.h + (dt / RISE_SEC) * Math.max(0.7, Math.min(1.3, 0.7 + 0.6 * lvl)));
    } else if (t - this.lastEnd > HANG_SEC) {
      const fall = (dt * FALL_PX_S) / (LOW - HIGH);
      this.h = Math.max(0, this.h - fall * Math.min(1, 0.35 + this.h * 1.3)); // eases in near the hill
    }
    this.hd = ease(this.hd, this.h, dt, 0.25);
    this.burn = ease(this.burn, this.speaking ? Math.min(1, 0.25 + lvl) : 0, dt, 0.05, 0.3);
    if (this.hd > 0.97) this.topTime += dt; else this.topTime = 0;
    if (this.hd < 0.6) this.rewarded = false;
    if (!this.rewarded && this.topTime >= 1 && !this.ending) {
      this.rewarded = true; this.mode = "reward"; this.h = this.hd = 1; this.burn = 0;
      this.player.setVisible(true); this.player.play("cloud_reward", 0.2, { still: this.app.settings.calm }); this.app.chime();
    }
    this.sun = ease(this.sun, this.rewarded && this.hd > 0.9 ? 0.85 : 0, dt, 1.0);
    this.draw(t);
  }

  draw(t) {
    const g = this.sc.begin(), im = this.im, calm = this.app.settings.calm;
    if (im.sun && this.sun > 0.01) { g.globalAlpha = this.sun; g.drawImage(im.sun, 396 - 200, 118 - 200, 400, 400); g.globalAlpha = 1; }
    const d = calm ? 0 : 3 * Math.sin((2 * Math.PI * t) / 14);
    if (im.c1) g.drawImage(im.c1, 8 + d, 40, 170, 108);
    if (im.c2) g.drawImage(im.c2, 344 - d, 22, 160, 101);
    if (im.c3) g.drawImage(im.c3, 330 + d * 0.6, 172, 118, 73);
    if (im.wide && this.sc.ox > 1) g.drawImage(im.wide, 256 - 455, 312, 910, 212); // wider screens: hills edge to edge
    if (im.hills) g.drawImage(im.hills, 0, 312, 512, 212);
    if (this.mode === "reward") return; // Remy's clip covers the square
    const by = LOW - this.hd * (LOW - HIGH), x0 = 256 - 78.5, y0 = by - 250;
    const ang = calm || this.hd < 0.02 ? 0 : (2 * Math.PI / 180) * Math.sin((2 * Math.PI * t) / 5);
    g.save(); g.translate(x0 + 76.5, y0 + 81); g.rotate(ang); g.translate(-76.5, -81);
    if (im.balloon) g.drawImage(im.balloon, 0, 0, 153, 250);
    if (im.burner && this.burn > 0.01) {
      const s = 0.7 + 0.5 * this.burn; g.globalAlpha = 0.7 * this.burn;
      g.drawImage(im.burner, 77.5 - 60 * s, 160.7 - 60 * s, 120 * s, 120 * s); g.globalAlpha = 1;
    }
    g.restore();
  }
}
