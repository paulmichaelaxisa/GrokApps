// Two stacked <img> layers that crossfade between animated WebP clips (or PNG stills in calm mode).
// Each play uses a fresh blob URL so the WebP restarts at frame 0. One-shots are timed by the caller
// with `elapsed()`, never by the WebP loop flag.
export class ClipPlayer {
  constructor(host, urlFor, { className = "clip" } = {}) {
    this.urlFor = urlFor; // (name, ext) => url
    this.a = document.createElement("img"); this.b = document.createElement("img");
    for (const el of [this.a, this.b]) { el.className = className; el.alt = ""; el.draggable = false; el.style.opacity = 0; host.appendChild(el); }
    this.front = this.a; this.back = this.b;
    this.blobs = {}; this.urls = new Set(); this.clip = null; this.start = 0; this.token = 0;
    this.fadeT = 1; this.fadeSec = 0; this.visible = true; this.dead = false;
  }
  async preload(names) {
    await Promise.all(names.map(async (n) => {
      if (this.blobs[n]) return;
      try { const r = await fetch(this.urlFor(n, "webp")); if (r.ok) this.blobs[n] = await r.blob(); } catch (_) {}
    }));
  }
  /** Start `name` from frame 0 and fade it in over `fade` seconds. */
  play(name, fade = 0.15, { still = false } = {}) {
    if (this.dead) return;
    const token = ++this.token;
    let url;
    if (still) url = this.urlFor(name, "png");
    else if (this.blobs[name]) { url = URL.createObjectURL(this.blobs[name]); this.urls.add(url); }
    else url = `${this.urlFor(name, "webp")}?r=${token}`;
    this.pending = name;
    const el = this.back;
    el.onload = () => {
      if (token !== this.token || this.dead) return;
      this.clip = name; this.still = still; this.start = performance.now() / 1000;
      el.style.zIndex = 2; this.front.style.zIndex = 1;
      const old = this.front, oldUrl = old.dataset.blob;
      this.front = el; this.back = old;
      el.dataset.blob = url.startsWith("blob:") ? url : "";
      this.fadeSec = fade; this.fadeT = fade > 0 ? 0 : 1;
      el.style.opacity = this.visible ? (fade > 0 ? 0 : 1) : 0;
      setTimeout(() => { if (oldUrl) { URL.revokeObjectURL(oldUrl); this.urls.delete(oldUrl); } if (!this.dead && this.back === old) old.style.opacity = 0; }, (fade + 0.25) * 1000);
      this.pending = null;
    };
    el.onerror = () => { if (token === this.token) this.pending = null; };
    el.src = url;
  }
  elapsed(t = performance.now() / 1000) { return t - this.start; }
  get busy() { return !!this.pending; }
  setVisible(v) { this.visible = v; this.front.style.opacity = v ? Math.min(1, this.fadeT) : 0; if (!v) this.back.style.opacity = 0; }
  update(dt) {
    if (this.fadeT < 1) { this.fadeT = this.fadeSec > 0 ? Math.min(1, this.fadeT + dt / this.fadeSec) : 1; }
    if (this.visible) this.front.style.opacity = this.fadeT.toFixed(3);
  }
  destroy() {
    this.dead = true; this.token++;
    for (const u of this.urls) URL.revokeObjectURL(u);
    this.urls.clear(); this.blobs = {};
    this.a.remove(); this.b.remove();
  }
}

/** Load images (for canvas scenes). Resolves to {name: HTMLImageElement}. */
export function loadImages(map) {
  return Promise.all(Object.entries(map).map(([k, src]) => new Promise((res) => {
    const im = new Image(); im.onload = () => res([k, im]); im.onerror = () => res([k, null]); im.src = src;
  }))).then(Object.fromEntries);
}

/** Exponential smoothing helper: different time constants up and down. */
export const ease = (cur, target, dt, up, down = up) => cur + (target - cur) * (1 - Math.exp(-dt / (target > cur ? up : down)));
