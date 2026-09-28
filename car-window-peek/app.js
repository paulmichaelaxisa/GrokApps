/* Car Window Peek — game loop for Liam */
(() => {
  "use strict";
  const {
    seedWorld, ensureWorld, hitTest, hitTestCloud, triggerBounce,
    drawSky, drawOcean, drawVerge, drawRoad, drawSillInterior,
    drawObject, drawWindowChrome, glassInsets,
    drawRipple, drawSparks, spawnSparks, spawnCloudPuff,
    SCROLL_SPEED, ACCENTS,
  } = window.CWP;

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });

  let W = 0, H = 0, dpr = 1;
  let objs = [];
  let scroll = 0;
  let flash = null;
  let sunWink = 0;
  let ripples = [];
  let sparks = [];
  let audioCtx = null;
  let audioReady = false;

  let dragging = null;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let dragHomeY = 0;
  let pointerId = null;

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

  function playWhoosh(kind) {
    if (!audioReady || !audioCtx) return;
    try {
      if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const map = {
        cloud: [320, 480],
        tree: [220, 340],
        bird: [640, 880],
        car: [180, 280],
        beach: [420, 560],
        marking: [360, 300],
        glass: [500, 700],
        sun: [700, 520],
      };
      const [f0, f1] = map[kind] || [400, 560];
      osc.type = "sine";
      osc.frequency.setValueAtTime(f0 + Math.random() * 30, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(80, f1), t + 0.12);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.09, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.17);
    } catch (_) {}
  }

  function vibrate(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms || 30); } catch (_) {}
  }

  function reactAt(o, x, y) {
    triggerBounce(o);
    const color = o.accent || ACCENTS[(Math.random() * ACCENTS.length) | 0];
    flash = { color, alpha: 0.28, life: 1 };
    spawnSparks(sparks, o.x, o.y, color);
    vibrate(32);
    playWhoosh(o.kind);
  }

  function glassTap(x, y) {
    ripples.push({ x, y, r: 8, life: 1 });
    flash = { color: "#FFE066", alpha: 0.18, life: 1 };
    vibrate(22);
    const inset = glassInsets(W, H);
    const sunX = W * 0.78, sunY = H * 0.12;
    const nearSun = Math.hypot(x - sunX, y - sunY) < Math.min(W, H) * 0.16;
    if (nearSun || Math.random() < 0.35) {
      sunWink = 1;
      playWhoosh("sun");
      spawnSparks(sparks, sunX, sunY, "#FFE066");
    } else {
      const puff = spawnCloudPuff(objs, x, y);
      playWhoosh("glass");
      spawnSparks(sparks, x, y, "#FFFFFF");
      puff.x = Math.max(inset.left + 20, Math.min(inset.right - 20, puff.x));
      puff.y = Math.max(inset.top + 24, Math.min(H * 0.4, puff.y));
    }
  }

  function clientToCanvas(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onPointerDown(e) {
    e.preventDefault();
    unlockAudio();
    pointerId = e.pointerId;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    const p = clientToCanvas(e);

    const cloud = hitTestCloud(objs, p.x, p.y);
    if (cloud) {
      dragging = cloud;
      dragOffsetX = p.x - cloud.x;
      dragOffsetY = p.y - cloud.y;
      dragHomeY = cloud.y;
      cloud._dragging = true;
      triggerBounce(cloud);
      vibrate(18);
      playWhoosh("cloud");
      flash = { color: "#FFFFFF", alpha: 0.16, life: 1 };
      spawnSparks(sparks, cloud.x, cloud.y, "#FFFFFF");
      return;
    }

    const hit = hitTest(objs, p.x, p.y, 8);
    if (hit) reactAt(hit, p.x, p.y);
    else glassTap(p.x, p.y);
  }

  function onPointerMove(e) {
    if (pointerId !== null && e.pointerId !== pointerId) return;
    if (!dragging) return;
    e.preventDefault();
    const p = clientToCanvas(e);
    const inset = glassInsets(W, H);
    let nx = p.x - dragOffsetX;
    let ny = p.y - dragOffsetY;
    nx = Math.max(inset.left + 10, Math.min(inset.right - 10, nx));
    ny = Math.max(inset.top + 16, Math.min(H * 0.48, ny));
    const maxDx = 90, maxDy = 70;
    const homeX = dragging._grabX != null ? dragging._grabX : dragging.x;
    if (dragging._grabX == null) dragging._grabX = dragging.x;
    nx = Math.max(homeX - maxDx, Math.min(homeX + maxDx, nx));
    ny = Math.max(dragHomeY - maxDy, Math.min(dragHomeY + maxDy, ny));
    dragging.x = nx;
    dragging.y = ny;
  }

  function onPointerUp(e) {
    if (pointerId !== null && e.pointerId !== pointerId) return;
    if (dragging) {
      dragging._dragging = false;
      dragging._grabX = null;
      dragging._easeY = dragHomeY;
      dragging = null;
    }
    pointerId = null;
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
  }

  canvas.addEventListener("pointerdown", onPointerDown, { passive: false });
  canvas.addEventListener("pointermove", onPointerMove, { passive: false });
  canvas.addEventListener("pointerup", onPointerUp, { passive: false });
  canvas.addEventListener("pointercancel", onPointerUp, { passive: false });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  function update(dt, t) {
    const step = dt / 16.67;
    scroll += SCROLL_SPEED * step;

    for (const o of objs) {
      if (o._dragging) {
        if (o.bounce > 0) {
          o.bounce -= 0.06 * step;
          if (o.bounce < 0) o.bounce = 0;
        }
        continue;
      }

      o.x -= SCROLL_SPEED * step;
      if (o.vx) o.x += o.vx * step;

      if (o.kind === "bird") {
        o.wing = (o.wing || 0) + 0.12 * step;
        o.y += Math.sin((o.wing || 0) * 0.5) * 0.15 * step;
      }
      if (o.kind === "cloud") {
        o.phase = (o.phase || 0) + 0.02 * step;
        if (o._easeY != null) {
          o.y += (o._easeY - o.y) * 0.06 * step;
          if (Math.abs(o.y - o._easeY) < 0.5) o._easeY = null;
        } else {
          o.y += Math.sin(o.phase) * 0.08 * step;
        }
      }
      if (o.temp) {
        o.tempLife -= dt / 1000;
      }

      if (o.bounce > 0) {
        o.bounce -= 0.055 * step;
        if (o.bounce < 0) o.bounce = 0;
      }

      const margin = Math.max(o.w, 60) + 40;
      if (o.x < -margin) {
        if (o.temp) o._dead = true;
        else {
          o.x = W + randMargin(margin);
          if (o.kind === "bird") o.y = H * (0.08 + Math.random() * 0.28);
          if (o.kind === "cloud") o.y = H * (0.06 + Math.random() * 0.22);
        }
      } else if (o.kind === "car" && o.lane === 1 && o.x > W + margin) {
        o.x = -margin;
      }
    }

    objs = objs.filter((o) => !o._dead && !(o.temp && o.tempLife <= 0));

    for (const p of sparks) {
      p.x += p.vx * step;
      p.y += p.vy * step;
      p.vy += 0.08 * step;
      p.life -= p.decay * step;
    }
    sparks = sparks.filter((p) => p.life > 0);

    for (const r of ripples) {
      r.r += 2.8 * step;
      r.life -= 0.045 * step;
    }
    ripples = ripples.filter((r) => r.life > 0);

    if (flash) {
      flash.life -= 0.07 * step;
      if (flash.life <= 0) flash = null;
    }
    if (sunWink > 0) {
      sunWink -= 0.05 * step;
      if (sunWink < 0) sunWink = 0;
    }

    ensureWorld(objs, W, H);
  }

  function randMargin(m) {
    return m + Math.random() * 120;
  }

  function drawFlash() {
    if (!flash || flash.life <= 0) return;
    ctx.fillStyle = flash.color;
    ctx.globalAlpha = flash.alpha * flash.life;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  function draw(t) {
    drawSky(ctx, W, H, sunWink);
    drawOcean(ctx, W, H, scroll, t);
    drawVerge(ctx, W, H);
    drawRoad(ctx, W, H, scroll);
    drawSillInterior(ctx, W, H);

    const order = { marking: 0, beach: 1, tree: 2, car: 3, bird: 4, cloud: 5 };
    const sorted = objs.slice().sort((a, b) => {
      const da = order[a.kind] != null ? order[a.kind] : 3;
      const db = order[b.kind] != null ? order[b.kind] : 3;
      if (da !== db) return da - db;
      return a.y - b.y;
    });
    for (const o of sorted) drawObject(ctx, o, t);

    drawSparks(ctx, sparks);
    drawRipple(ctx, ripples);
    drawFlash();
    drawWindowChrome(ctx, W, H);
  }

  let lastTs = 0;
  function frame(ts) {
    if (!lastTs) lastTs = ts;
    let dt = ts - lastTs;
    lastTs = ts;
    if (dt > 50) dt = 50;
    update(dt, ts);
    draw(ts);
    requestAnimationFrame(frame);
  }

  function boot() {
    resize();
    objs = seedWorld(W, H);
    requestAnimationFrame(frame);
  }

  window.addEventListener("resize", () => {
    resize();
    ensureWorld(objs, W, H);
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => {
      resize();
      ensureWorld(objs, W, H);
    });
  }
  boot();
})();
