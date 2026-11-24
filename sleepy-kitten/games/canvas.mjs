// Small helper for canvas-drawn scenes in 512x512 scene coordinates (optionally wider than square).
export class SceneCanvas {
  constructor(stage) {
    this.c = document.createElement("canvas"); this.c.className = "scene-canvas";
    stage.appendChild(this.c); this.g = this.c.getContext("2d");
    this.resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1), w = this.c.clientWidth, h = this.c.clientHeight;
      this.c.width = Math.round(w * dpr); this.c.height = Math.round(h * dpr);
      this.k = h / 512; this.ox = (w - h) / 2; this.dpr = dpr; this.w = w; this.h = h;
    };
    window.addEventListener("resize", this.resize); this.resize();
  }
  /** Clear and set the transform so (0,0)-(512,512) is the scene square (centred if wider). */
  begin() {
    const g = this.g; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, this.c.width, this.c.height);
    g.setTransform(this.k * this.dpr, 0, 0, this.k * this.dpr, this.ox * this.dpr, 0);
    return g;
  }
  /** Scene x range visible on screen (for wide stages). */
  get xMin() { return -this.ox / this.k; } get xMax() { return 512 + this.ox / this.k; }
  set visible(v) { this.c.style.opacity = v ? 1 : 0; }
  destroy() { window.removeEventListener("resize", this.resize); this.c.remove(); }
}
