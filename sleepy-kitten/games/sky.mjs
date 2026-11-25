// Sky Balloon (loudness + timing version): while he keeps a sound going the balloon rises (Sky
// climb time in grown-up settings: 1.6 s of voice by default from the hill to the clouds; louder rises
// a little faster, capped). Loudness also drives the burner glow. When he stops it hangs for 1.1 s (a
// breath between "ba… ba" keeps its height), then drifts gently down, eased.
// Reaching the clouds and staying 0.5 s plays Remy's cloud reward (bluebird + sun glow).
// No pitch detection: the original design maps pitch to height; this build uses voice time instead.
import { ClipPlayer, loadImages, ease } from "../clips.mjs?v=1";
import { SceneCanvas } from "./canvas.mjs?v=1";

// Wide screens: Remy's opaque clips have hills.png flattened on cream, so its soft side edges become
// cream bands next to hills_wide. Over the clip we paint the strips at each side of the square with the
// exact "unmix": colour W + a·(H − cream) at opacity (1 − a)·aW (a, H = hills.png alpha and colour;
// W, aW = hills_wide), which turns the clip's hills-over-cream into hills-over-hills_wide, the same as
// the live scene. Only within EDGE px of the sides and only where hills_wide has paint.
const EDGE = 48, EDGE_SOFT = 14, WIDE_X = 256 - 455, WIDE_W = 910, CREAM = [251, 239, 216];
function makeEdgeFill(hills, wide) {
  const c = document.createElement("canvas"); c.width = 512; c.height = 212;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(hills, 0, 0, 512, 212); const H = g.getImageData(0, 0, 512, 212).data;
  g.clearRect(0, 0, 512, 212);
  g.drawImage(wide, -WIDE_X, 0, 512, 212, 0, 0, 512, 212); // the part of hills_wide under the square
  const img = g.getImageData(0, 0, 512, 212), d = img.data;
  for (let y = 0; y < 212; y++) for (let x = 0; x < 512; x++) {
    const i = (y * 512 + x) * 4, e = Math.min(x, 511 - x);
    const ramp = e <= EDGE ? 1 : Math.max(0, 1 - (e - EDGE) / EDGE_SOFT);
    const a = H[i + 3] / 255, aw = d[i + 3] / 255;
    for (let k = 0; k < 3; k++) d[i + k] = Math.max(0, Math.min(255, Math.round(d[i + k] + a * (H[i + k] - CREAM[k]))));
    d[i + 3] = Math.round(255 * (1 - a) * aw * ramp);
  }
  g.putImageData(img, 0, 0); return c;
}

const LOW = 452, HIGH = 268, HANG_SEC = 1.1, TOP_HOLD_SEC = 0.5, FALL_PX_S = 77; // 15% of the scene per second

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
    this.edge = new SceneCanvas(stage); this.edge.c.classList.add("edge-fill"); // above the clip
    try { this.fill = this.im.hills && this.im.wide ? makeEdgeFill(this.im.hills, this.im.wide) : null; } catch (_) { this.fill = null; }
    await this.player.preload(["resting", "cloud_reward"]);
    this.h = 0; this.hd = 0; this.burn = 0; this.sun = 0; this.speaking = false; this.lastEnd = -1e9; this.topTime = 0; this.rewarded = false;
    this.over = over; this.restDone = over; this.ending = false;
    this.mode = over ? "resting" : "live"; // live | reward | resting
    if (over) { this.player.play("resting", 0, { still: this.app.settings.calm }); } else this.player.setVisible(false);
  }
  unmount() { this.player.destroy(); this.sc.destroy(); this.edge.destroy(); this.stage.innerHTML = ""; }

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
      const rise = Math.max(0.8, Math.min(3, +this.app.settings.skyClimbSec || 1.6));
      this.h = Math.min(1, this.h + (dt / rise) * Math.max(0.7, Math.min(1.3, 0.7 + 0.6 * lvl)));
    } else if (t - this.lastEnd > HANG_SEC) {
      const fall = (dt * FALL_PX_S) / (LOW - HIGH);
      this.h = Math.max(0, this.h - fall * Math.min(1, 0.35 + this.h * 1.3)); // eases in near the hill
    }
    this.hd = ease(this.hd, this.h, dt, 0.25);
    this.burn = ease(this.burn, this.speaking ? Math.min(1, 0.25 + lvl) : 0, dt, 0.05, 0.3);
    if (this.hd > 0.97) this.topTime += dt; else this.topTime = 0;
    if (this.hd < 0.6) this.rewarded = false;
    if (!this.rewarded && this.topTime >= TOP_HOLD_SEC && !this.ending) {
      this.rewarded = true; this.mode = "reward"; this.h = this.hd = 1; this.burn = 0;
      this.player.setVisible(true); this.player.play("cloud_reward", 0.2, { still: this.app.settings.calm }); this.app.chime();
    }
    this.sun = ease(this.sun, this.rewarded && this.hd > 0.9 ? 0.85 : 0, dt, 1.0);
    this.draw(t);
  }

  drawEdges() {
    const p = this.player, e = this.edge.begin();
    const clipOn = (this.mode === "reward" || this.mode === "resting") && p.visible && !p.busy && p.clip;
    if (!clipOn || !this.fill || this.sc.ox <= 1) return;
    e.globalAlpha = Math.min(1, p.fadeT); e.drawImage(this.fill, 0, 312, 512, 212); e.globalAlpha = 1;
  }

  draw(t) {
    this.drawEdges();
    const g = this.sc.begin(), im = this.im, calm = this.app.settings.calm;
    if (im.sun && this.sun > 0.01) { g.globalAlpha = this.sun; g.drawImage(im.sun, 396 - 200, 118 - 200, 400, 400); g.globalAlpha = 1; }
    const d = calm ? 0 : 3 * Math.sin((2 * Math.PI * t) / 14);
    if (im.c1) g.drawImage(im.c1, 8 + d, 40, 170, 108);
    if (im.c2) g.drawImage(im.c2, 344 - d, 22, 160, 101);
    if (im.c3) g.drawImage(im.c3, 330 + d * 0.6, 172, 118, 73);
    if (im.wide && this.sc.ox > 1) { // wider screens: hills edge to edge, mirrored copies past hills_wide's ends
      g.drawImage(im.wide, WIDE_X, 312, WIDE_W, 212);
      for (let n = 1; WIDE_X - (n - 1) * WIDE_W > this.sc.xMin || WIDE_X + n * WIDE_W < this.sc.xMax; n++) {
        const flip = n % 2 === 1;
        for (const x0 of [WIDE_X - n * WIDE_W, WIDE_X + n * WIDE_W]) {
          if (x0 + WIDE_W < this.sc.xMin || x0 > this.sc.xMax) continue;
          g.save(); g.translate(flip ? x0 + WIDE_W : x0, 312); g.scale(flip ? -1 : 1, 1); g.drawImage(im.wide, 0, 0, WIDE_W, 212); g.restore();
        }
        if (n > 6) break;
      }
    }
    if (im.hills) g.drawImage(im.hills, 0, 312, 512, 212);
    if (this.mode === "reward" && !this.player.busy) return; // Remy's clip covers the square (keep the live balloon until it has loaded)
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
