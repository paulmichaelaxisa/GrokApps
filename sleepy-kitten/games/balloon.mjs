// Big Balloon: any voice inflates the balloon (louder = faster, capped; a fill takes about 3 s of voice).
// If he stops it holds, then shrinks very slowly (-10% over 4 s). At full size it pops softly into
// confetti (Remy's pop clip), and a new balloon drifts in. Glow rings breathe with loudness.
import { ClipPlayer, loadImages, ease } from "../clips.mjs?v=1";
import { SceneCanvas } from "./canvas.mjs?v=1";

const CLIPS = { pop: 3, new_balloon: 2, drift_away: 3, resting: 3 };
const IDLE = 0.42, KNOT = [292, 300], PIVOT = [98.6, 258.4], GRASP = [176, 352];

export default class BalloonGame {
  static id = "balloon"; static icon = "art/tabs/tab_big_balloon_alpha.png"; static anchor = "bottom";
  constructor(app) { this.app = app; }

  async mount(stage, { over }) {
    this.stage = stage;
    this.sc = new SceneCanvas(stage);
    const host = document.createElement("div"); host.className = "clip-host"; stage.appendChild(host);
    this.player = new ClipPlayer(host, (n, ext) => `art/balloon/balloon_${n}.${ext}`);
    this.im = await loadImages({ balloon: "art/balloon/balloon@2x.png", hand: "art/balloon/hand@2x.png", ring: "art/balloon/glow_ring.png" });
    await this.player.preload(Object.keys(CLIPS));
    this.size = IDLE; this.ds = IDLE; this.ring = 0; this.speaking = false; this.lastEnd = -1e9; this.bob0 = this.app.now();
    this.over = over; this.restDone = over; this.ending = false;
    this.mode = over ? "resting" : "live"; // live | pop | new | drift | resting
    if (over) { this.player.play("resting", 0, { still: this.app.settings.calm }); this.sc.visible = false; }
    else this.player.setVisible(false);
  }
  unmount() { this.player.destroy(); this.sc.destroy(); this.stage.innerHTML = ""; }

  onOnset() { this.speaking = true; }
  onEnd(t, dur, who) { this.speaking = false; this.lastEnd = t; if (who === "liam") this.app.stat(dur); }
  liamTurn(t) { return this.app.turns.liamTurn(t); }
  endSession() { this.ending = true; }
  get done() { return this.restDone; }
  newSession() { this.over = this.restDone = this.ending = false; this.mode = "new"; this.clip("new_balloon"); }

  clip(name, fade = 0.15) { this.player.setVisible(true); this.player.play(name, fade, { still: this.app.settings.calm }); }
  toLive(t) { this.mode = "live"; this.size = this.ds = IDLE; this.bob0 = t; this.sc.visible = true; this.player.setVisible(false); }

  frame(t, dt, lvl) {
    const p = this.player; p.update(dt);
    const el = p.busy ? 0 : p.elapsed(t);
    if (this.mode === "live") {
      if (this.ending) {
        this.size = IDLE; this.ds = ease(this.ds, IDLE, dt, 0.5);
        if (this.ds < IDLE + 0.02) { this.mode = "drift"; this.clip("drift_away"); }
      } else if (this.speaking) {
        this.size = Math.min(1, this.size + dt * (0.58 / 3) * Math.max(0.55, Math.min(1.3, 0.55 + 0.9 * lvl)));
      } else if (t - this.lastEnd > 1.5) {
        this.size = Math.max(IDLE, this.size - dt * 0.1 * this.size / 4); // never deflates fast
      }
      this.ds = ease(this.ds, this.size, dt, 0.15);
      this.ring = ease(this.ring, this.speaking ? Math.min(1, 0.3 + lvl) : 0, dt, 0.05, 0.3);
      if (this.size >= 1 && this.ds > 0.985) { this.mode = "pop"; this.ring = 0; this.clip("pop"); this.app.chime(); }
      this.draw(t);
    } else if (!p.busy) {
      if (p.clip && p.fadeT >= 1) this.sc.visible = false;
      if (this.mode === "pop" && p.clip === "pop" && el >= CLIPS.pop) { this.mode = "new"; this.clip("new_balloon", 0.08); }
      else if (this.mode === "new" && p.clip === "new_balloon" && el >= CLIPS.new_balloon) { if (this.ending) { this.mode = "drift"; this.clip("drift_away", 0.08); } else this.toLive(t); }
      else if (this.mode === "drift" && p.clip === "drift_away" && el >= CLIPS.drift_away) { this.mode = "resting"; this.clip("resting", 0.08); this.over = this.restDone = true; }
    }
  }

  draw(t) {
    const g = this.sc.begin(), { balloon, hand, ring } = this.im, s = this.ds;
    const calm = this.app.settings.calm;
    const bob = calm ? 0 : 4 * Math.sin((2 * Math.PI * (t - this.bob0)) / 3);
    const kx = KNOT[0] + (calm ? 0 : 1.5 * Math.sin((2 * Math.PI * (t - this.bob0)) / 4.3)), ky = KNOT[1] + bob;
    // glow rings (peak alpha 0.3 in the art x 0.9), breathing at 0.8 Hz
    if (this.ring > 0.01 && ring) {
      const cx = kx, cy = ky - 0.5 * 260 * s, body = 97 * s;
      for (const [i, a] of [[0, 1], [1, 0.55]]) {
        const r = body * (1.15 + 0.55 * this.ring + 0.35 * i) * (1 + 0.03 * Math.sin(2 * Math.PI * 0.8 * t + i));
        g.globalAlpha = 0.9 * this.ring * a;
        g.drawImage(ring, cx - 256 * r / 200, cy - 256 * r / 200, 512 * r / 200, 512 * r / 200);
      }
      g.globalAlpha = 1;
    }
    // string: quadratic from the fist to the knot, control at the midpoint +18 px in x
    g.strokeStyle = "#BAAAA0"; g.lineWidth = 2.2; g.lineCap = "round";
    g.beginPath(); g.moveTo(GRASP[0], GRASP[1]);
    g.quadraticCurveTo((GRASP[0] + kx) / 2 + 18, (GRASP[1] + ky) / 2, kx, ky); g.stroke();
    if (balloon) g.drawImage(balloon, kx - PIVOT[0] * s, ky - PIVOT[1] * s, 194 * s, 260 * s);
    if (hand) g.drawImage(hand, -13.1, 326, 260, 337);
  }
}
