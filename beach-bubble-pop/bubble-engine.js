/* Beach Bubble Pop — engine (v2: edge spawns, anti-cluster, soft repulsion) */
(function (global) {
  "use strict";

  const BUBBLE_COLORS = [
    "#FF6B9D", "#FFD166", "#7ED9B8", "#5B8DEF",
    "#FF8C42", "#C77DFF", "#4ECDC4", "#FF5C8A",
    "#FFE066", "#6BCB77",
  ];

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pickColor() { return BUBBLE_COLORS[(Math.random() * BUBBLE_COLORS.length) | 0]; }

  function shade(hex, amt) {
    const n = hex.replace("#", "");
    const num = parseInt(n.length === 3 ? n.split("").map((c) => c + c).join("") : n, 16);
    let r = (num >> 16) + amt;
    let g = ((num >> 8) & 0xff) + amt;
    let b = (num & 0xff) + amt;
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  /* ---------- v2: edge spawns, anti-cluster, soft repulsion ---------- */
  const CFG = {
    R_MIN: 48, R_MAX: 110,          // big toddler-sized targets (unchanged)
    MAX_ON_SCREEN: 7,               // hard cap (6-8 band)
    MIN_ON_SCREEN: 4,               // below this, spawn checks come faster
    GAP_FACTOR: 1.5,                // spawn centre gap >= 1.5 x bubble diameter
    GAP_MODE: "max",                // "max": larger of the two diameters; "mean": (d1 + d2) / 2
    PREDICT: false,                 // compare path samples with where others will be at that time
    EDGE_INSET: 0.10,               // keep spawns 10% away from corners
    TARGET_BAND: 0.60,              // aim at the middle 60% of the screen
    MAX_TRIES: 8,                   // candidate spawns per tick
    PATH_SAMPLES: 5,                // samples along the entry path
    PATH_SCOPE: "entry",            // "entry": spawn -> fully on screen (+1 radius); "full": spawn -> target
    SPEED_MIN: 0.35, SPEED_MAX: 0.7,// px per 60fps frame (slow drift)
    ENTRY_BOOST: 1.8,               // a bit quicker while sliding in
    WOBBLE_MIN: 0.3, WOBBLE_MAX: 1.0,
    REPEL_RANGE: 1.3,               // push apart within 1.3 x (r1 + r2)
    REPEL_K: 0.04,                  // small force
    REPEL_DAMP: 0.9,                // per-frame damping (no jitter)
    REPEL_MAX: 0.8,                 // clamp push velocity
    OVERLAP_FIX: 0.15,              // ease true overlaps apart (15% of overlap/frame)
    SPAWN_FAST_MS: 250,             // cadence when fewer than MIN_ON_SCREEN
    EDGE_PATIENCE: 2,               // blocked ticks before re-drawing the edge
    SPAWN_SLOW_MS: 1200,            // gentle cadence otherwise (+ up to 800ms)
    MAX_AGE_MS: 120000,             // safety net only
  };
  const EDGES = ["top", "right", "bottom", "left"];

  function requiredGap(r1, r2) {
    return CFG.GAP_FACTOR * (CFG.GAP_MODE === "mean" ? r1 + r2 : 2 * Math.max(r1, r2));
  }

  function allowedEdges(history) {
    const n = history.length;
    if (n >= 2 && history[n - 1] === history[n - 2]) {
      return EDGES.filter((e) => e !== history[n - 1]);
    }
    return EDGES;
  }

  function makeCandidate(W, H, edge, r) {
    const ix = W * CFG.EDGE_INSET, iy = H * CFG.EDGE_INSET;
    const off = r + 6; // centre just off-screen so the disc is hidden at birth
    let x, y;
    if (edge === "top") { x = rand(ix, W - ix); y = -off; }
    else if (edge === "bottom") { x = rand(ix, W - ix); y = H + off; }
    else if (edge === "left") { x = -off; y = rand(iy, H - iy); }
    else { x = W + off; y = rand(iy, H - iy); }
    const band = (1 - CFG.TARGET_BAND) / 2;
    const tx = rand(W * band, W * (1 - band));
    const ty = rand(H * band, H * (1 - band));
    return { edge, r, x, y, tx, ty, speed: rand(CFG.SPEED_MIN, CFG.SPEED_MAX) };
  }

  /* Frames for a bubble moving at `speed` to cover distance d from its edge
     spawn (boosted until its disc clears the edge). */
  function travelFrames(d, r, normal, speed) {
    const dEntry = (2 * r + 6) / Math.max(0.2, normal);
    const vb = speed * CFG.ENTRY_BOOST;
    return d <= dEntry ? d / vb : dEntry / vb + (d - dEntry) / speed;
  }

  /* Smallest (distance / required gap) between the candidate's path samples
     (spawn point -> target) and every live bubble. >= 1 means clear.
     With PREDICT, each sample is compared with where the other bubble will
     be when the candidate reaches that sample (straight-line estimate). */
  function pathClearance(c, bubbles) {
    let worst = Infinity;
    const L = Math.hypot(c.tx - c.x, c.ty - c.y) || 1;
    const normal = (c.edge === "top" || c.edge === "bottom")
      ? Math.abs(c.ty - c.y) / L : Math.abs(c.tx - c.x) / L;
    const reach = CFG.PATH_SCOPE === "entry"
      ? Math.min(L, (2 * c.r + 6) / Math.max(0.2, normal) + c.r) : L;
    for (let s = 0; s <= CFG.PATH_SAMPLES; s++) {
      const d = reach * s / CFG.PATH_SAMPLES, t = d / L;
      const px = c.x + (c.tx - c.x) * t, py = c.y + (c.ty - c.y) * t;
      const tau = CFG.PREDICT ? travelFrames(d, c.r, normal, c.speed) : 0;
      for (const b of bubbles) {
        if (!b.alive) continue;
        const v = b.speed * (b.entered ? 1 : CFG.ENTRY_BOOST);
        const bx = b.x + b.dirX * v * tau, by = b.y + b.dirY * v * tau;
        const ratio = Math.hypot(px - bx, py - by) / requiredGap(c.r, b.r);
        if (ratio < worst) worst = ratio;
      }
    }
    return worst;
  }

  function makeBubble(x, y, r, dirX, dirY, speed, edge, entered) {
    return {
      x, y, r, color: pickColor(),
      dirX, dirY, speed,
      rvx: 0, rvy: 0,
      wobbleAmp: rand(CFG.WOBBLE_MIN, CFG.WOBBLE_MAX),
      wobbleFreq: rand(0.008, 0.025),
      wobblePhase: rand(0, Math.PI * 2),
      edge, entered: !!entered,
      age: 0, alive: true, exited: false,
    };
  }

  function pickEdge(history) {
    const edges = allowedEdges(history);
    return edges[(Math.random() * edges.length) | 0];
  }

  /* Try up to MAX_TRIES random candidates (position, target, size) on `edge`;
     return a bubble or null (skip this tick). */
  function trySpawnFromEdge(bubbles, W, H, history, stats, edge) {
    for (let i = 0; i < CFG.MAX_TRIES; i++) {
      const e = edge || pickEdge(history);
      const c = makeCandidate(W, H, e, rand(CFG.R_MIN, CFG.R_MAX));
      const clearance = pathClearance(c, bubbles);
      if (clearance < 1) continue;
      const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy) || 1;
      const b = makeBubble(c.x, c.y, c.r, dx / d, dy / d, c.speed, e, false);
      b.tx = c.tx; b.ty = c.ty;
      history.push(e);
      if (history.length > 8) history.shift();
      if (stats) stats.onSpawn(b, clearance, bubbles);
      return b;
    }
    if (stats) stats.onSkip();
    return null;
  }

  /* Initial seed: a few bubbles already on screen, spread apart. */
  function seedBubbles(W, H, count) {
    const out = [];
    for (let n = 0; n < count; n++) {
      for (let i = 0; i < 60; i++) {
        const r = rand(CFG.R_MIN, CFG.R_MAX);
        const x = W > 2 * r ? rand(r, W - r) : W / 2; // fully on screen
        const y = H > 2 * r ? rand(r, H - r) : H / 2;
        let ok = true;
        for (const b of out) {
          if (Math.hypot(x - b.x, y - b.y) < requiredGap(r, b.r)) { ok = false; break; }
        }
        if (!ok) continue;
        const a = rand(0, Math.PI * 2);
        out.push(makeBubble(x, y, r, Math.cos(a), Math.sin(a),
          rand(CFG.SPEED_MIN, CFG.SPEED_MAX), "seed", true));
        break;
      }
    }
    return out;
  }

  function hasClearedEdge(b, W, H) {
    switch (b.edge) {
      case "top": return b.y - b.r >= 0;
      case "bottom": return b.y + b.r <= H;
      case "left": return b.x - b.r >= 0;
      case "right": return b.x + b.r <= W;
      default: return true;
    }
  }

  function fullyOffScreen(b, W, H) {
    return b.x + b.r < 0 || b.x - b.r > W || b.y + b.r < 0 || b.y - b.r > H;
  }

  /* Move, repel, mark entered, despawn exited. Returns the survivors. */
  function stepBubbles(bubbles, W, H, dt) {
    const f = dt / 16.67;
    const n = bubbles.length;
    for (let i = 0; i < n; i++) {
      const a = bubbles[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < n; j++) {
        const b = bubbles[j];
        if (!b.alive) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const range = (a.r + b.r) * CFG.REPEL_RANGE;
        const d2 = dx * dx + dy * dy;
        if (d2 >= range * range) continue;
        const d = Math.sqrt(d2) || 0.001;
        const nx = d2 > 0 ? dx / d : 1, ny = d2 > 0 ? dy / d : 0;
        const push = CFG.REPEL_K * (1 - d / range) * f; // linear falloff: smooth
        a.rvx -= nx * push; a.rvy -= ny * push;
        b.rvx += nx * push; b.rvy += ny * push;
        const overlap = a.r + b.r - d;
        if (overlap > 0) { // gentle positional easing, never a snap
          const m = Math.min(1, CFG.OVERLAP_FIX * f) * overlap * 0.5;
          a.x -= nx * m; a.y -= ny * m; b.x += nx * m; b.y += ny * m;
        }
      }
    }
    const damp = Math.pow(CFG.REPEL_DAMP, f);
    for (const b of bubbles) {
      if (!b.alive) continue;
      b.rvx *= damp; b.rvy *= damp;
      const rv = Math.hypot(b.rvx, b.rvy);
      if (rv > CFG.REPEL_MAX) { b.rvx *= CFG.REPEL_MAX / rv; b.rvy *= CFG.REPEL_MAX / rv; }
      b.age += dt;
      const sp = b.speed * (b.entered ? 1 : CFG.ENTRY_BOOST);
      const w = Math.sin(b.age * b.wobbleFreq + b.wobblePhase) * b.wobbleAmp;
      // drift along heading + wobble across heading + damped repulsion
      b.x += (b.dirX * sp - b.dirY * w + b.rvx) * f;
      b.y += (b.dirY * sp + b.dirX * w + b.rvy) * f;
      if (!b.entered && hasClearedEdge(b, W, H)) b.entered = true;
      if (b.entered && fullyOffScreen(b, W, H)) { b.alive = false; b.exited = true; }
      else if (b.age > CFG.MAX_AGE_MS && fullyOffScreen(b, W, H)) { b.alive = false; b.exited = true; }
    }
    return bubbles.filter((b) => b.alive);
  }

  /* Gentle spawn cadence; returns a new bubble or null.
     The next edge is drawn with equal weight (never a 3rd in a row) and kept
     until it succeeds, so blocked edges don't skew the mix; after
     EDGE_PATIENCE blocked ticks a fresh edge is drawn. */
  function createSpawner(stats) {
    const history = [];
    let timer = 0;
    let nextSlow = CFG.SPAWN_SLOW_MS + rand(0, 800);
    let edge = null, blocked = 0;
    return {
      history,
      tick(bubbles, W, H, dt) {
        timer += dt;
        let live = 0;
        for (const b of bubbles) if (b.alive) live++;
        if (live >= CFG.MAX_ON_SCREEN) return null;
        const interval = live < CFG.MIN_ON_SCREEN ? CFG.SPAWN_FAST_MS : nextSlow;
        if (timer < interval) return null;
        timer = 0;
        nextSlow = CFG.SPAWN_SLOW_MS + rand(0, 800);
        if (!edge || blocked >= CFG.EDGE_PATIENCE) { edge = pickEdge(history); blocked = 0; }
        const b = trySpawnFromEdge(bubbles, W, H, history, stats, edge);
        if (b) { edge = null; blocked = 0; } else blocked++;
        return b;
      },
    };
  }

  function spawnParticles(particles, bx, by, color, br) {
    const count = 8 + ((Math.random() * 9) | 0);
    for (let i = 0; i < count; i++) {
      const ang = rand(0, Math.PI * 2);
      const spd = rand(1.5, 5.5);
      particles.push({
        x: bx + Math.cos(ang) * rand(0, br * 0.4),
        y: by + Math.sin(ang) * rand(0, br * 0.4),
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - rand(0.5, 2),
        r: rand(4, 14), color, life: 1, decay: rand(0.025, 0.055),
      });
    }
  }

  function drawBackground(ctx, W, H) {
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.55);
    sky.addColorStop(0, "#87CEEB");
    sky.addColorStop(0.55, "#4FC3F7");
    sky.addColorStop(1, "#29B6F6");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    const sunX = W * 0.82, sunY = H * 0.12, sunR = Math.min(W, H) * 0.09;
    const sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * 1.4);
    sunGrad.addColorStop(0, "rgba(255, 236, 140, 0.95)");
    sunGrad.addColorStop(0.5, "rgba(255, 209, 102, 0.55)");
    sunGrad.addColorStop(1, "rgba(255, 209, 102, 0)");
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR * 1.4, 0, Math.PI * 2);
    ctx.fill();

    const waterTop = H * 0.52, waterH = H * 0.22;
    const water = ctx.createLinearGradient(0, waterTop, 0, waterTop + waterH);
    water.addColorStop(0, "#26C6DA");
    water.addColorStop(0.45, "#0288D1");
    water.addColorStop(1, "#0277BD");
    ctx.fillStyle = water;
    ctx.fillRect(0, waterTop, W, waterH + 2);

    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const wy = waterTop + 18 + i * 22;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 16) {
        const y = wy + Math.sin(x * 0.03 + i * 1.2 + performance.now() * 0.0015) * 4;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    const sandTop = waterTop + waterH;
    const sand = ctx.createLinearGradient(0, sandTop, 0, H);
    sand.addColorStop(0, "#FFE8B0");
    sand.addColorStop(0.4, "#F5E6C8");
    sand.addColorStop(1, "#E8D4A8");
    ctx.fillStyle = sand;
    ctx.fillRect(0, sandTop - 1, W, H - sandTop + 2);

    ctx.fillStyle = "rgba(232, 200, 140, 0.35)";
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(0, sandTop + 40);
    ctx.quadraticCurveTo(W * 0.25, sandTop + 10, W * 0.5, sandTop + 45);
    ctx.quadraticCurveTo(W * 0.75, sandTop + 70, W, sandTop + 30);
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
  }

  function drawBubble(ctx, b) {
    const { x, y, r, color } = b;
    ctx.beginPath();
    ctx.arc(x, y, r + 3, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.25;
    ctx.fill();
    ctx.globalAlpha = 1;

    const body = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
    body.addColorStop(0, shade(color, 40));
    body.addColorStop(0.55, color);
    body.addColorStop(1, shade(color, -25));
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = body;
    ctx.globalAlpha = 0.88;
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = Math.max(2, r * 0.06);
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(x - r * 0.32, y - r * 0.38, r * 0.28, r * 0.18, -0.4, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x + r * 0.25, y - r * 0.15, r * 0.07, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fill();
  }

  function drawParticles(ctx, particles) {
    for (const p of particles) {
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

  global.BBP = {
    CFG, EDGES, rand, requiredGap, allowedEdges, pathClearance,
    pickEdge, trySpawnFromEdge, seedBubbles, stepBubbles, createSpawner,
    spawnParticles, drawBackground, drawBubble, drawParticles,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = global.BBP;
})(typeof window !== "undefined" ? window : globalThis);
