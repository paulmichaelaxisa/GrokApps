/* Beach Bubble Pop — engine */
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

  function spawnBubble(W, H, fromBelow) {
    const r = rand(48, 110);
    const x = rand(r + 8, Math.max(r + 9, W - r - 8));
    const y = fromBelow ? H + r + rand(10, 80) : rand(H * 0.35, H + r);
    return {
      x, y, r, color: pickColor(),
      vy: -rand(0.55, 1.35),
      wobbleAmp: rand(0.4, 1.6),
      wobbleFreq: rand(0.01, 0.035),
      wobblePhase: rand(0, Math.PI * 2),
      age: 0, alive: true,
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

  global.BBP = { rand, spawnBubble, spawnParticles, drawBackground, drawBubble, drawParticles };
})(window);
