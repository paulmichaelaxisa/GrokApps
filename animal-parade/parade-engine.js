/* Animal Parade — draw animals, background, spawn helpers */
(function (global) {
  "use strict";

  const TYPES = ["turtle", "fish", "seagull", "kangaroo"];

  const ACCENTS = {
    turtle: "#2E8B57",
    fish: "#FF6B9D",
    seagull: "#FFD166",
    kangaroo: "#E07A3D",
  };

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

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

  function laneY(type, W, H) {
    const waterTop = H * 0.52;
    const sandTop = waterTop + H * 0.22;
    if (type === "fish") return rand(waterTop + 20, sandTop - 20);
    if (type === "seagull") return rand(H * 0.08, H * 0.38);
    if (type === "turtle") return rand(sandTop + 10, H - 50);
    return rand(sandTop + 5, H - 60);
  }

  function spawnAnimal(W, H, fromEdge) {
    const type = pick(TYPES);
    const size = rand(52, 78);
    const facing = Math.random() < 0.5 ? 1 : -1;
    let x;
    if (fromEdge) {
      x = facing > 0 ? -size - rand(10, 80) : W + size + rand(10, 80);
    } else {
      x = rand(size, Math.max(size + 1, W - size));
    }
    const y = laneY(type, W, H);
    let speed;
    if (type === "turtle") speed = rand(0.35, 0.7);
    else if (type === "fish") speed = rand(0.9, 1.6);
    else if (type === "seagull") speed = rand(1.1, 2.0);
    else speed = rand(0.8, 1.4);

    return {
      type, x, y, size, facing,
      vx: facing * speed,
      phase: rand(0, Math.PI * 2),
      hopPhase: rand(0, Math.PI * 2),
      wingPhase: rand(0, Math.PI * 2),
      accent: ACCENTS[type],
      lastReactionIndex: -1,
      alive: true,
      hitPad: 26,
    };
  }

  function drawEyes(ctx, x, y, spacing, r) {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x - spacing, y, r, 0, Math.PI * 2);
    ctx.arc(x + spacing, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1A2B3C";
    ctx.beginPath();
    ctx.arc(x - spacing + r * 0.15, y + r * 0.1, r * 0.55, 0, Math.PI * 2);
    ctx.arc(x + spacing + r * 0.15, y + r * 0.1, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x - spacing + r * 0.35, y - r * 0.2, r * 0.22, 0, Math.PI * 2);
    ctx.arc(x + spacing + r * 0.35, y - r * 0.2, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawSmile(ctx, x, y, w) {
    ctx.strokeStyle = "#1A2B3C";
    ctx.lineWidth = Math.max(2.5, w * 0.08);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(x, y - w * 0.15, w * 0.45, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }

  function drawTurtle(ctx, a, t) {
    const s = a.size;
    const bob = Math.sin(t * 0.004 + a.phase) * 2;
    ctx.save();
    ctx.translate(a.x, a.y + bob);
    ctx.scale(a.facing, 1);
    const crawl = Math.sin(t * 0.006 + a.phase);
    ctx.fillStyle = "#66BB6A";
    ctx.beginPath();
    ctx.ellipse(-s * 0.55, s * 0.35 + crawl * 3, s * 0.28, s * 0.16, 0, 0, Math.PI * 2);
    ctx.ellipse(s * 0.45, s * 0.35 - crawl * 3, s * 0.28, s * 0.16, 0, 0, Math.PI * 2);
    ctx.ellipse(-s * 0.35, s * 0.48 - crawl * 2, s * 0.24, s * 0.14, 0, 0, Math.PI * 2);
    ctx.ellipse(s * 0.3, s * 0.48 + crawl * 2, s * 0.24, s * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
    const shell = ctx.createRadialGradient(-s * 0.15, -s * 0.2, s * 0.1, 0, 0, s * 0.85);
    shell.addColorStop(0, "#5CBF6A");
    shell.addColorStop(0.55, "#2E8B57");
    shell.addColorStop(1, "#1B5E3B");
    ctx.fillStyle = shell;
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.85, s * 0.58, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = "rgba(27, 94, 59, 0.45)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-s * 0.4, -s * 0.05);
    ctx.quadraticCurveTo(0, -s * 0.45, s * 0.4, -s * 0.05);
    ctx.moveTo(-s * 0.35, s * 0.2);
    ctx.quadraticCurveTo(0, -s * 0.05, s * 0.35, s * 0.2);
    ctx.moveTo(0, -s * 0.4);
    ctx.lineTo(0, s * 0.35);
    ctx.stroke();
    ctx.fillStyle = "#66BB6A";
    ctx.beginPath();
    ctx.ellipse(s * 0.75, -s * 0.15, s * 0.32, s * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    drawEyes(ctx, s * 0.78, -s * 0.22, s * 0.12, s * 0.1);
    drawSmile(ctx, s * 0.82, -s * 0.02, s * 0.22);
    ctx.restore();
  }

  function drawFish(ctx, a, t) {
    const s = a.size;
    const bob = Math.sin(t * 0.005 + a.phase) * 5;
    const wag = Math.sin(t * 0.01 + a.phase) * 0.25;
    ctx.save();
    ctx.translate(a.x, a.y + bob);
    ctx.scale(a.facing, 1);
    ctx.save();
    ctx.translate(-s * 0.7, 0);
    ctx.rotate(wag);
    ctx.fillStyle = shade(a.accent, -20);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-s * 0.55, -s * 0.4);
    ctx.quadraticCurveTo(-s * 0.2, 0, -s * 0.55, s * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    const body = ctx.createRadialGradient(-s * 0.1, -s * 0.15, s * 0.05, 0, 0, s * 0.8);
    body.addColorStop(0, shade(a.accent, 45));
    body.addColorStop(0.5, a.accent);
    body.addColorStop(1, shade(a.accent, -30));
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.75, s * 0.48, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = shade(a.accent, 20);
    ctx.beginPath();
    ctx.moveTo(-s * 0.1, -s * 0.4);
    ctx.quadraticCurveTo(s * 0.1, -s * 0.85, s * 0.35, -s * 0.35);
    ctx.quadraticCurveTo(s * 0.05, -s * 0.5, -s * 0.1, -s * 0.4);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.ellipse(s * 0.05, s * 0.15, s * 0.45, s * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(s * 0.4, -s * 0.08, s * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1A2B3C";
    ctx.beginPath();
    ctx.arc(s * 0.45, -s * 0.05, s * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(s * 0.48, -s * 0.1, s * 0.035, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#1A2B3C";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(s * 0.5, s * 0.08, s * 0.12, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();
    ctx.restore();
  }

  function drawSeagull(ctx, a, t) {
    const s = a.size;
    const bob = Math.sin(t * 0.004 + a.phase) * 8;
    const wing = Math.sin(t * 0.012 + a.wingPhase) * 0.55;
    ctx.save();
    ctx.translate(a.x, a.y + bob);
    ctx.scale(a.facing, 1);
    ctx.fillStyle = "#F5F5F5";
    ctx.save();
    ctx.translate(-s * 0.1, -s * 0.1);
    ctx.rotate(-0.4 + wing);
    ctx.beginPath();
    ctx.ellipse(-s * 0.55, 0, s * 0.65, s * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#E8E8E8";
    ctx.beginPath();
    ctx.ellipse(-s * 0.7, 0, s * 0.35, s * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#F5F5F5";
    ctx.save();
    ctx.translate(s * 0.15, -s * 0.05);
    ctx.rotate(0.35 - wing * 0.7);
    ctx.beginPath();
    ctx.ellipse(s * 0.45, 0, s * 0.55, s * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.45, s * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(26,43,60,0.15)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#CFD8DC";
    ctx.beginPath();
    ctx.ellipse(-s * 0.05, -s * 0.08, s * 0.35, s * 0.18, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.arc(s * 0.4, -s * 0.25, s * 0.26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#FF8C42";
    ctx.beginPath();
    ctx.moveTo(s * 0.58, -s * 0.25);
    ctx.lineTo(s * 0.95, -s * 0.18);
    ctx.lineTo(s * 0.58, -s * 0.1);
    ctx.closePath();
    ctx.fill();
    drawEyes(ctx, s * 0.42, -s * 0.3, s * 0.1, s * 0.09);
    ctx.strokeStyle = "#FF8C42";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-s * 0.05, s * 0.25);
    ctx.lineTo(-s * 0.05, s * 0.45);
    ctx.moveTo(s * 0.12, s * 0.25);
    ctx.lineTo(s * 0.12, s * 0.45);
    ctx.stroke();
    ctx.restore();
  }

  function drawKangaroo(ctx, a, t) {
    const s = a.size;
    const hop = Math.abs(Math.sin(t * 0.008 + a.hopPhase));
    const lift = hop * s * 0.35;
    ctx.save();
    ctx.translate(a.x, a.y - lift);
    ctx.scale(a.facing, 1);
    ctx.fillStyle = "#C86A2E";
    ctx.beginPath();
    ctx.moveTo(-s * 0.3, s * 0.15);
    ctx.quadraticCurveTo(-s * 1.1, s * 0.5, -s * 0.85, s * 0.75);
    ctx.quadraticCurveTo(-s * 0.55, s * 0.45, -s * 0.2, s * 0.25);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#E07A3D";
    ctx.beginPath();
    ctx.ellipse(-s * 0.15, s * 0.35 + (1 - hop) * 4, s * 0.28, s * 0.4, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-s * 0.05, s * 0.7 + (1 - hop) * 2, s * 0.35, s * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    const body = ctx.createRadialGradient(-s * 0.05, -s * 0.1, s * 0.05, 0, 0, s * 0.7);
    body.addColorStop(0, "#F0A060");
    body.addColorStop(0.55, "#E07A3D");
    body.addColorStop(1, "#B85A28");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.5, s * 0.42, -0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#FFE0B2";
    ctx.beginPath();
    ctx.ellipse(s * 0.08, s * 0.08, s * 0.28, s * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#E07A3D";
    ctx.beginPath();
    ctx.ellipse(s * 0.25, s * 0.05, s * 0.12, s * 0.28, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#E07A3D";
    ctx.beginPath();
    ctx.ellipse(s * 0.45, -s * 0.45, s * 0.32, s * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#E07A3D";
    ctx.beginPath();
    ctx.ellipse(s * 0.28, -s * 0.85, s * 0.1, s * 0.28, -0.3, 0, Math.PI * 2);
    ctx.ellipse(s * 0.55, -s * 0.88, s * 0.1, s * 0.28, 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#FFCC80";
    ctx.beginPath();
    ctx.ellipse(s * 0.28, -s * 0.82, s * 0.05, s * 0.16, -0.3, 0, Math.PI * 2);
    ctx.ellipse(s * 0.55, -s * 0.85, s * 0.05, s * 0.16, 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#FFE0B2";
    ctx.beginPath();
    ctx.ellipse(s * 0.62, -s * 0.35, s * 0.16, s * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1A2B3C";
    ctx.beginPath();
    ctx.ellipse(s * 0.72, -s * 0.36, s * 0.06, s * 0.045, 0, 0, Math.PI * 2);
    ctx.fill();
    drawEyes(ctx, s * 0.42, -s * 0.52, s * 0.11, s * 0.1);
    ctx.strokeStyle = "#1A2B3C";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(s * 0.6, -s * 0.28, s * 0.1, 0.1 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    ctx.restore();
  }

  function drawAnimal(ctx, a, t) {
    if (a.type === "turtle") drawTurtle(ctx, a, t);
    else if (a.type === "fish") drawFish(ctx, a, t);
    else if (a.type === "seagull") drawSeagull(ctx, a, t);
    else drawKangaroo(ctx, a, t);
  }

  function drawFacePortrait(ctx, type, cx, cy, scale, accent) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.beginPath();
    ctx.arc(0, 0, 120, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.25;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 100, 0, Math.PI * 2);
    ctx.fillStyle = "#FFF8E7";
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 8;
    ctx.stroke();
    if (type === "turtle") {
      ctx.fillStyle = "#2E8B57";
      ctx.beginPath();
      ctx.ellipse(0, 20, 70, 50, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#66BB6A";
      ctx.beginPath();
      ctx.arc(0, -20, 55, 0, Math.PI * 2);
      ctx.fill();
      drawEyes(ctx, 0, -28, 22, 16);
      drawSmile(ctx, 0, 5, 40);
    } else if (type === "fish") {
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.ellipse(0, 0, 75, 55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(25, -10, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1A2B3C";
      ctx.beginPath();
      ctx.arc(30, -8, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(34, -12, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#1A2B3C";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(35, 15, 18, 0.1 * Math.PI, 0.9 * Math.PI);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.beginPath();
      ctx.ellipse(-20, 15, 25, 15, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === "seagull") {
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.arc(0, 0, 65, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#FF8C42";
      ctx.beginPath();
      ctx.moveTo(30, -5);
      ctx.lineTo(85, 5);
      ctx.lineTo(30, 18);
      ctx.closePath();
      ctx.fill();
      drawEyes(ctx, -5, -15, 20, 15);
      ctx.fillStyle = "#CFD8DC";
      ctx.beginPath();
      ctx.ellipse(0, 40, 40, 18, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = "#E07A3D";
      ctx.beginPath();
      ctx.ellipse(0, 10, 65, 60, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(-28, -70, 14, 38, -0.3, 0, Math.PI * 2);
      ctx.ellipse(28, -72, 14, 38, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#FFCC80";
      ctx.beginPath();
      ctx.ellipse(-28, -68, 7, 22, -0.3, 0, Math.PI * 2);
      ctx.ellipse(28, -70, 7, 22, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#FFE0B2";
      ctx.beginPath();
      ctx.ellipse(10, 15, 28, 22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1A2B3C";
      ctx.beginPath();
      ctx.ellipse(28, 12, 10, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      drawEyes(ctx, -8, -20, 20, 15);
      ctx.strokeStyle = "#1A2B3C";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(8, 30, 16, 0.1 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    }
    ctx.restore();
  }

  const REACTIONS = {
    turtle: [
      { kind: "zoom", bounce: 1.15, duration: 900 },
      { kind: "spinZoom", bounce: 1.2, duration: 950 },
      { kind: "wiggleZoom", bounce: 1.1, duration: 800 },
    ],
    fish: [
      { kind: "zoom", bounce: 1.2, duration: 850 },
      { kind: "flipZoom", bounce: 1.25, duration: 900 },
      { kind: "bubbleZoom", bounce: 1.15, duration: 950 },
    ],
    seagull: [
      { kind: "zoom", bounce: 1.18, duration: 880 },
      { kind: "flapZoom", bounce: 1.22, duration: 920 },
      { kind: "diveZoom", bounce: 1.12, duration: 800 },
    ],
    kangaroo: [
      { kind: "zoom", bounce: 1.2, duration: 900 },
      { kind: "hopZoom", bounce: 1.3, duration: 950 },
      { kind: "spinZoom", bounce: 1.15, duration: 850 },
    ],
  };

  function pickReaction(animal) {
    const list = REACTIONS[animal.type];
    let idx;
    do {
      idx = (Math.random() * list.length) | 0;
    } while (list.length > 1 && idx === animal.lastReactionIndex);
    animal.lastReactionIndex = idx;
    return { ...list[idx], index: idx };
  }

  function bounceEase(t) {
    const c = 1.70158 * 1.4;
    const u = t - 1;
    return 1 + u * u * ((c + 1) * u + c);
  }

  global.AP = {
    TYPES, ACCENTS, rand, pick, shade,
    drawBackground, spawnAnimal, drawAnimal, drawFacePortrait,
    pickReaction, bounceEase, REACTIONS,
  };
})(window);
