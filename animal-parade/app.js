/* Animal Parade — game loop for Liam */
(() => {
  "use strict";
  const {
    spawnAnimal, drawBackground, drawAnimal, drawFacePortrait,
    pickReaction, bounceEase, ACCENTS,
  } = window.AP;

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });

  let W = 0, H = 0, dpr = 1;
  let animals = [];
  let flash = null;
  let zoom = null; // active face zoom overlay
  let sparks = [];
  let audioCtx = null;
  let audioReady = false;
  let lastEnsure = 0;

  const MIN_ANIMALS = 4;
  const MAX_ANIMALS = 6;
  const HIT_PAD = 28;

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

  function ensureAnimals() {
    while (animals.length < MIN_ANIMALS) {
      animals.push(spawnAnimal(W, H, true));
    }
  }

  function seedInitial() {
    animals = [];
    const n = MIN_ANIMALS + ((Math.random() * (MAX_ANIMALS - MIN_ANIMALS + 1)) | 0);
    for (let i = 0; i < n; i++) animals.push(spawnAnimal(W, H, false));
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

  function playChirp(type) {
    if (!audioReady || !audioCtx) return;
    try {
      if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const freqs = {
        turtle: [280, 360],
        fish: [520, 720],
        seagull: [640, 480],
        kangaroo: [340, 520],
      };
      const [f0, f1] = freqs[type] || [400, 600];
      osc.type = "sine";
      osc.frequency.setValueAtTime(f0 + Math.random() * 40, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(80, f1), t + 0.14);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.1, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    } catch (_) {}
  }

  function vibrate() {
    try {
      if (navigator.vibrate) navigator.vibrate(32);
    } catch (_) {}
  }

  function spawnSparks(x, y, color) {
    const n = 10 + ((Math.random() * 8) | 0);
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 1.5 + Math.random() * 4.5;
      sparks.push({
        x, y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 1.5,
        r: 4 + Math.random() * 10,
        color,
        life: 1,
        decay: 0.03 + Math.random() * 0.03,
      });
    }
  }

  function triggerReaction(a) {
    const reaction = pickReaction(a);
    flash = { color: a.accent, alpha: 0.32, life: 1 };
    vibrate();
    playChirp(a.type);
    spawnSparks(a.x, a.y, a.accent);

    zoom = {
      type: a.type,
      accent: a.accent,
      kind: reaction.kind,
      bounce: reaction.bounce,
      duration: reaction.duration,
      age: 0,
      cx: W * 0.5,
      cy: H * 0.42,
    };
  }

  function hitTest(x, y) {
    let hit = null, best = Infinity;
    for (let i = animals.length - 1; i >= 0; i--) {
      const a = animals[i];
      if (!a.alive) continue;
      const pad = (a.hitPad || HIT_PAD);
      const hw = a.size * 0.9 + pad;
      const hh = a.size * 0.75 + pad;
      const dx = x - a.x, dy = y - a.y;
      // generous ellipse hit
      const nx = dx / hw, ny = dy / hh;
      const d2 = nx * nx + ny * ny;
      if (d2 <= 1 && d2 < best) {
        best = d2;
        hit = a;
      }
    }
    return hit;
  }

  function clientToCanvas(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onPointerDown(e) {
    e.preventDefault();
    unlockAudio();
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    const p = clientToCanvas(e);
    const hit = hitTest(p.x, p.y);
    if (hit) triggerReaction(hit);
  }

  function onPointerUp(e) {
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
  }

  canvas.addEventListener("pointerdown", onPointerDown, { passive: false });
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

  function drawSparks() {
    for (const p of sparks) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x - p.r * 0.2, p.y - p.r * 0.2, Math.max(1, p.r * 0.25 * p.life), 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawZoom() {
    if (!zoom) return;
    const t = Math.min(1, zoom.age / zoom.duration);
    let scale;
    let alpha = 1;
    let rot = 0;
    let dy = 0;

    if (t < 0.55) {
      const u = bounceEase(t / 0.55);
      scale = 0.2 + u * (zoom.bounce - 0.2);
    } else {
      const u = (t - 0.55) / 0.45;
      scale = zoom.bounce * (1 - u * 0.15);
      alpha = 1 - u;
    }

    // kind-specific motion flourishes
    if (zoom.kind === "spinZoom") {
      rot = Math.sin(t * Math.PI * 2) * 0.35;
    } else if (zoom.kind === "wiggleZoom") {
      rot = Math.sin(t * Math.PI * 8) * 0.18;
    } else if (zoom.kind === "flipZoom") {
      rot = t < 0.5 ? t * Math.PI * 2 : 0;
    } else if (zoom.kind === "flapZoom") {
      dy = Math.sin(t * Math.PI * 6) * 18;
    } else if (zoom.kind === "diveZoom") {
      dy = Math.sin(t * Math.PI) * -30;
    } else if (zoom.kind === "hopZoom") {
      dy = -Math.abs(Math.sin(t * Math.PI * 3)) * 40;
    } else if (zoom.kind === "bubbleZoom") {
      scale *= 1 + Math.sin(t * Math.PI * 4) * 0.06;
    }

    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.translate(zoom.cx, zoom.cy + dy);
    ctx.rotate(rot);
    drawFacePortrait(ctx, zoom.type, 0, 0, scale, zoom.accent);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function update(dt, now) {
    const step = dt / 16.67;

    for (const a of animals) {
      if (!a.alive) continue;
      a.x += a.vx * step;

      // subtle bob already in draw; kangaroo hop feel via hopPhase advance
      a.hopPhase += 0.05 * step;
      a.wingPhase += 0.08 * step;
      a.phase += 0.03 * step;

      // wrap off-screen → respawn other side (keep parade forever)
      const margin = a.size + 40;
      if (a.facing > 0 && a.x > W + margin) {
        a.x = -margin;
        // mild lane refresh so parade feels alive
        const waterTop = H * 0.52;
        const sandTop = waterTop + H * 0.22;
        if (a.type === "fish") a.y = waterTop + 20 + Math.random() * Math.max(10, sandTop - waterTop - 40);
        else if (a.type === "seagull") a.y = H * 0.08 + Math.random() * H * 0.3;
        else if (a.type === "turtle") a.y = sandTop + 10 + Math.random() * Math.max(10, H - sandTop - 60);
        else a.y = sandTop + 5 + Math.random() * Math.max(10, H - sandTop - 65);
      } else if (a.facing < 0 && a.x < -margin) {
        a.x = W + margin;
        const waterTop = H * 0.52;
        const sandTop = waterTop + H * 0.22;
        if (a.type === "fish") a.y = waterTop + 20 + Math.random() * Math.max(10, sandTop - waterTop - 40);
        else if (a.type === "seagull") a.y = H * 0.08 + Math.random() * H * 0.3;
        else if (a.type === "turtle") a.y = sandTop + 10 + Math.random() * Math.max(10, H - sandTop - 60);
        else a.y = sandTop + 5 + Math.random() * Math.max(10, H - sandTop - 65);
      }
    }

    for (const p of sparks) {
      p.x += p.vx * step;
      p.y += p.vy * step;
      p.vy += 0.08 * step;
      p.life -= p.decay * step;
    }
    sparks = sparks.filter((p) => p.life > 0);

    if (flash) {
      flash.life -= 0.07 * step;
      if (flash.life <= 0) flash = null;
    }

    if (zoom) {
      zoom.age += dt;
      if (zoom.age >= zoom.duration) zoom = null;
    }

    ensureAnimals();
    if (animals.length < MAX_ANIMALS && Math.random() < 0.008) {
      animals.push(spawnAnimal(W, H, true));
    }

    lastEnsure += dt;
    if (lastEnsure > 1000) {
      lastEnsure = 0;
      if (animals.length === 0) seedInitial();
    }
  }

  let lastTs = 0;
  function frame(ts) {
    if (!lastTs) lastTs = ts;
    let dt = ts - lastTs;
    lastTs = ts;
    if (dt > 50) dt = 50;
    update(dt, ts);
    drawBackground(ctx, W, H);
    // draw by y for simple depth (sky animals first, sand last)
    const sorted = animals.slice().sort((a, b) => a.y - b.y);
    for (const a of sorted) drawAnimal(ctx, a, ts);
    drawSparks();
    drawFlash();
    drawZoom();
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
