// Sound Garden: a voice of 200 ms+ plants a seed; while he keeps going the flower grows (about 1.5 s
// of voice to bloom), and it never shrinks back if he stops. Loudness sets its size (0.8-1.1).
// Bloom: the bee lands on it and soft sparkles fade in and out. Eight blooms: the full garden sways
// with butterflies (drawn live from the layers), then folds back for a fresh bed.
// The planted seed is frame 0 of each growth sheet (identical to seed.png), so seed.png isn't drawn separately.
import { ClipPlayer, loadImages, ease } from "../clips.mjs?v=1";
import { SceneCanvas } from "./canvas.mjs?v=1";

const SLOTS = [
  { x: 88, y: 434, f: "daisy", size: 0.9 }, { x: 136, y: 448, f: "tulip", size: 0.8 }, { x: 184, y: 432, f: "lavender", size: 1.0 },
  { x: 232, y: 450, f: "poppy", size: 0.85 }, { x: 282, y: 434, f: "daisy", size: 0.78 }, { x: 330, y: 448, f: "tulip", size: 0.95 },
  { x: 378, y: 432, f: "poppy", size: 0.95 }, { x: 426, y: 450, f: "lavender", size: 0.85 },
];
const DRAW_ORDER = SLOTS.map((s, i) => i).sort((a, b) => SLOTS[a].y - SLOTS[b].y); // back row first
const GROW_SEC = 1.5, BEE_HOME = [300, 215], BEE_REST = [65, 372];

export default class GardenGame {
  static id = "garden"; static icon = "art/tabs/tab_sound_garden_alpha.png"; static anchor = "center";
  constructor(app) { this.app = app; }

  async mount(stage, { over }) {
    this.stage = stage;
    this.sc = new SceneCanvas(stage);
    const host = document.createElement("div"); host.className = "clip-host"; stage.appendChild(host);
    this.player = new ClipPlayer(host, (n, ext) => `art/garden/garden_${n}.${ext}`);
    this.im = await loadImages({
      soil: "art/garden/soil@2x.png", bee: "art/garden/bee@2x.png", fly: "art/garden/butterfly@2x.png", sparkle: "art/garden/sparkle.png",
      daisy: "art/garden/growth_daisy_sheet.png", tulip: "art/garden/growth_tulip_sheet.png", lavender: "art/garden/growth_lavender_sheet.png", poppy: "art/garden/growth_poppy_sheet.png",
    });
    await this.player.preload(["resting"]);
    this.reset();
    this.bee = { x: BEE_HOME[0], y: BEE_HOME[1], tx: null, ty: null, until: 0, tilt: 0 };
    this.over = over; this.restDone = over; this.ending = false;
    this.mode = over ? "resting" : "live"; // live | full | fold | resting
    if (over) { this.player.play("resting", 0, { still: this.app.settings.calm }); this.sc.visible = false; } else this.player.setVisible(false);
  }
  reset() { this.flowers = SLOTS.map(() => null); this.next = 0; this.cur = null; this.sparkles = []; this.speakStart = null; this.lastEnd = -1e9; this.planted = false; this.flies = []; }
  unmount() { this.player.destroy(); this.sc.destroy(); this.stage.innerHTML = ""; }

  onOnset(t) {
    this.speakStart = t; this.gapOk = t - this.lastEnd >= 0.4; this.planted = false;
    // instant response: the bee hops toward the flower that will grow
    const i = this.cur != null ? this.cur : this.next;
    if (this.mode === "live" && i < 8) this.beeTo(SLOTS[i].x + 26, SLOTS[i].y - 150 * SLOTS[i].size, t + 1.6);
  }
  onEnd(t, dur, who) { this.speakStart = null; this.lastEnd = t; if (who === "liam") this.app.stat(dur); }
  liamTurn(t) { return this.app.turns.liamTurn(t); }
  endSession() { this.ending = true; }
  get done() { return this.restDone; }
  newSession(t) { this.over = this.restDone = this.ending = false; this.reset(); this.mode = "live"; this.sc.visible = true; this.player.setVisible(false); this.bee.x = BEE_REST[0]; this.bee.y = BEE_REST[1]; }

  beeTo(x, y, until) { Object.assign(this.bee, { tx: x, ty: y, until }); }

  frame(t, dt, lvl) {
    const p = this.player; p.update(dt);
    if (this.mode === "resting") return;
    if (this.mode === "live") {
      if (this.ending) { this.startFold(t); }
      else if (this.speakStart != null) {
        const talked = t - this.speakStart;
        if (this.cur == null && talked >= 0.2 && this.next < 8) { // plant a seed
          this.cur = this.next++; this.flowers[this.cur] = { g: 0, ls: 0.8 + 0.3 * Math.min(1, lvl), bloomAt: null };
        }
        if (this.cur != null) {
          const f = this.flowers[this.cur];
          f.g = Math.min(1, f.g + dt / GROW_SEC);
          f.ls = ease(f.ls, 0.8 + 0.3 * Math.min(1, lvl), dt, 0.3);
          if (f.g >= 1) { f.bloomAt = t; this.bloom(this.cur, t); this.cur = null; this.speakStart = t; }
        }
      }
      if (this.flowers.every((f) => f && f.g >= 1) && !this.fullAt) { this.fullAt = t + 3; } // let the last bloom finish
      if (this.fullAt && t >= this.fullAt) { this.mode = "full"; this.fullUntil = t + 9; this.fullAt = null;
        this.flies = [{ ph: 0, cx: 160, cy: 170 }, { ph: 2.4, cx: 350, cy: 150 }]; }
    } else if (this.mode === "full") {
      if (t >= this.fullUntil || this.ending) this.startFold(t);
    } else if (this.mode === "fold") {
      const el = t - this.foldStart;
      DRAW_ORDER.slice().reverse().forEach((i, n) => { const f = this.flowers[i]; if (f) f.g = Math.max(0, Math.min(f.g, 1 - (el - n * 0.3) / 0.6)); });
      if (el >= 3.2) {
        if (this.ending) { this.mode = "resting"; this.player.setVisible(true); this.player.play("resting", 0.4, { still: this.app.settings.calm }); this.over = this.restDone = true; }
        else { this.reset(); this.mode = "live"; this.beeTo(BEE_HOME[0], BEE_HOME[1], t + 0.1); }
      }
    }
    this.draw(t, dt);
  }
  startFold(t) { this.mode = "fold"; this.foldStart = t; this.cur = null; this.fullAt = null; if (this.ending) this.beeTo(BEE_REST[0], BEE_REST[1], t + 99); }

  bloom(i, t) {
    const s = SLOTS[i], f = this.flowers[i], k = s.size * f.ls, hx = s.x, hy = s.y - 215 * k;
    this.beeTo(hx + 8, hy - 18, t + 2.6);
    for (let n = 0; n < 5; n++) {
      const a = (n / 5) * Math.PI * 2;
      this.sparkles.push({ x: hx + Math.cos(a) * 34 * k, y: hy + Math.sin(a) * 30 * k, t0: t + n * 0.18, dur: 1.4 });
    }
    this.app.chime();
  }

  draw(t, dt) {
    const g = this.sc.begin(), im = this.im, calm = this.app.settings.calm;
    // butterflies (behind flowers' heads would be odd; draw them last)
    if (im.soil) g.drawImage(im.soil, 16, 404, 480, 57);
    const swayAmp = this.mode === "full" && !calm ? 2 : 0;
    for (const i of DRAW_ORDER) {
      const f = this.flowers[i]; if (!f) continue;
      const s = SLOTS[i], sheet = im[s.f], k = s.size * f.ls;
      if (f.g <= 0.001 && this.mode === "fold") continue;
      const frame = Math.round(f.g * 23);
      g.save(); g.translate(s.x, s.y);
      if (swayAmp) g.rotate((swayAmp * Math.PI / 180) * Math.sin(2 * Math.PI * 0.3 * t + i));
      if (sheet) g.drawImage(sheet, frame * 160, 0, 160, 270, -80 * k, -262 * k, 160 * k, 270 * k);
      g.restore();
    }
    // sparkles: fade in and out over 1.4 s, never blink
    this.sparkles = this.sparkles.filter((sp) => t < sp.t0 + sp.dur);
    for (const sp of this.sparkles) {
      const u = (t - sp.t0) / sp.dur; if (u < 0 || !im.sparkle) continue;
      g.globalAlpha = Math.sin(Math.PI * u) * 0.9;
      g.drawImage(im.sparkle, sp.x - 9, sp.y - 9 - 6 * u, 18, 18);
    }
    g.globalAlpha = 1;
    // bee: slow figure-8 hover at home, eased hops to a flower
    const b = this.bee;
    let tx = BEE_HOME[0] + 40 * Math.sin((2 * Math.PI * t) / 6), ty = BEE_HOME[1] + 16 * Math.sin((4 * Math.PI * t) / 6);
    if (calm) { tx = BEE_HOME[0]; ty = BEE_HOME[1]; }
    if (b.tx != null && t < b.until) { tx = b.tx; ty = b.ty; } else b.tx = null;
    const ox = b.x; b.x = ease(b.x, tx, dt, 0.22); b.y = ease(b.y, ty, dt, 0.22);
    b.tilt = ease(b.tilt, Math.max(-6, Math.min(6, (b.x - ox) / Math.max(dt, 1e-3) * 0.08)), dt, 0.2);
    if (im.bee) { g.save(); g.translate(b.x, b.y); g.rotate(b.tilt * Math.PI / 180); g.drawImage(im.bee, -40, -41, 80, 82); g.restore(); }
    // butterflies in the full garden: about one flap per second
    if (im.fly && this.mode === "full") for (const fl of this.flies) {
      const u = t * 0.25 + fl.ph, x = fl.cx + 60 * Math.sin(u), y = fl.cy + 25 * Math.sin(2 * u);
      const flap = calm ? 1 : 0.55 + 0.45 * Math.abs(Math.cos(Math.PI * t));
      g.save(); g.translate(x, y); g.scale(flap, 1); g.drawImage(im.fly, -42.8, -37.5, 76, 75); g.restore();
    }
  }
}
