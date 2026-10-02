/* Self-heal: if an old cached engine loaded, wipe caches and reload once */
(function () {
  var B = window.BBP;
  if (B && typeof B.createSpawner === "function" && typeof B.stepBubbles === "function") return;
  try {
    if (sessionStorage.getItem("bbp-healed")) return;
    sessionStorage.setItem("bbp-healed", "1");
  } catch (_) {}
  var jobs = [];
  if (window.caches) jobs.push(caches.keys().then(function (k) { return Promise.all(k.map(function (n) { return caches.delete(n); })); }));
  if (navigator.serviceWorker) jobs.push(navigator.serviceWorker.getRegistrations().then(function (r) { return Promise.all(r.map(function (x) { return x.unregister(); })); }));
  Promise.all(jobs).catch(function () {}).then(function () { location.replace(location.pathname + "?v=" + Date.now()); });
  throw new Error("Beach Bubble Pop: stale engine, healing");
})();
/* Beach Bubble Pop — game loop for Liam (v2: edge spawns, anti-cluster) */
(() => {
  "use strict";
  const {
    CFG, seedBubbles, stepBubbles, createSpawner,
    spawnParticles, drawBackground, drawBubble, drawParticles,
  } = window.BBP;

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });

  let W = 0, H = 0, dpr = 1;
  let bubbles = [];
  let particles = [];
  let flash = null;
  let pointerDown = false;
  let lastPointer = null;
  let audioCtx = null;
  let audioReady = false;
  let spawner = createSpawner(null);

  const HIT_PAD = 14;

  function resize() {
    const vv = window.visualViewport;
    const cssW = Math.max(1, Math.floor((vv && vv.width) || window.innerWidth || 1));
    const cssH = Math.max(1, Math.floor((vv && vv.height) || window.innerHeight || 1));
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    W = cssW; H = cssH;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // First few start on screen, spread apart (same gap rule); the rest drift in from the edges.
  function seedInitial() {
    bubbles = seedBubbles(W, H, CFG.MIN_ON_SCREEN);
    spawner = createSpawner(null);
  }

  function unlockAudio() {
    if (audioReady) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audioCtx = new AC();
      if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
      audioReady = true;
    } catch (_) { audioReady = false; }
  }

  function playPop() {
    if (!audioReady || !audioCtx) return;
    try {
      if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(520 + Math.random() * 280, t);
      osc.frequency.exponentialRampToValueAtTime(180, t + 0.12);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.16);
    } catch (_) {}
  }

  function vibrate() {
    try { if (navigator.vibrate) navigator.vibrate(30); } catch (_) {}
  }

  function popBubble(b) {
    if (!b.alive) return;
    b.alive = false;
    spawnParticles(particles, b.x, b.y, b.color, b.r);
    flash = { color: b.color, alpha: 0.28, life: 1 };
    vibrate();
    playPop();
  }

  function hitTest(x, y) {
    let hit = null, best = Infinity;
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      if (!b.alive) continue;
      const dx = x - b.x, dy = y - b.y, lim = b.r + HIT_PAD;
      const d2 = dx * dx + dy * dy;
      if (d2 <= lim * lim && d2 < best) { best = d2; hit = b; }
    }
    return hit;
  }

  function popAlongSegment(x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0;
    const dist = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(dist / 10));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = x0 + dx * t, y = y0 + dy * t;
      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i];
        if (!b.alive) continue;
        const bx = x - b.x, by = y - b.y, lim = b.r + HIT_PAD;
        if (bx * bx + by * by <= lim * lim) popBubble(b);
      }
    }
  }

  function clientToCanvas(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onPointerDown(e) {
    e.preventDefault();
    unlockAudio();
    pointerDown = true;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    const p = clientToCanvas(e);
    lastPointer = p;
    const hit = hitTest(p.x, p.y);
    if (hit) popBubble(hit);
  }

  function onPointerMove(e) {
    if (!pointerDown) return;
    e.preventDefault();
    const p = clientToCanvas(e);
    if (lastPointer) popAlongSegment(lastPointer.x, lastPointer.y, p.x, p.y);
    else { const hit = hitTest(p.x, p.y); if (hit) popBubble(hit); }
    lastPointer = p;
  }

  function onPointerUp(e) {
    pointerDown = false;
    lastPointer = null;
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
  }

  canvas.addEventListener("pointerdown", onPointerDown, { passive: false });
  canvas.addEventListener("pointermove", onPointerMove, { passive: false });
  canvas.addEventListener("pointerup", onPointerUp, { passive: false });
  canvas.addEventListener("pointercancel", onPointerUp, { passive: false });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  function drawFlash() {
    if (!flash || flash.life <= 0) return;
    ctx.fillStyle = flash.color;
    ctx.globalAlpha = flash.alpha * flash.life;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  function update(dt) {
    // drift + wobble + soft repulsion; despawns only after a bubble has entered and fully left
    bubbles = stepBubbles(bubbles.filter((b) => b.alive), W, H, dt);

    for (const p of particles) {
      p.x += p.vx * (dt / 16.67);
      p.y += p.vy * (dt / 16.67);
      p.vy += 0.08 * (dt / 16.67);
      p.life -= p.decay * (dt / 16.67);
    }
    particles = particles.filter((p) => p.life > 0);

    if (flash) {
      flash.life -= 0.08 * (dt / 16.67);
      if (flash.life <= 0) flash = null;
    }

    // gentle edge spawns: any edge, anti-cluster checked, capped at CFG.MAX_ON_SCREEN
    const nb = spawner.tick(bubbles, W, H, dt);
    if (nb) bubbles.push(nb);
  }

  let lastTs = 0;
  function frame(ts) {
    if (!lastTs) lastTs = ts;
    let dt = ts - lastTs;
    lastTs = ts;
    if (dt > 50) dt = 50;
    update(dt);
    drawBackground(ctx, W, H);
    for (const b of bubbles) drawBubble(ctx, b);
    drawParticles(ctx, particles);
    drawFlash();
    requestAnimationFrame(frame);
  }

  function boot() {
    resize();
    seedInitial();
    requestAnimationFrame(frame);
  }

  window.addEventListener("resize", resize);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", resize);
  boot();
})();
