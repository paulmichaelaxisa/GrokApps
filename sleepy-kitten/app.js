// Sleepy Kitten voice games: one shell (mic, calibration, turn-taking, session timer, grown-up
// settings, rolling wave, tabs) and five games. Everything runs on the phone; audio is analysed live
// and never stored or sent anywhere.
import { TurnTracker } from "./turns.mjs?v=2";
import { Mic } from "./mic.mjs?v=1";
import KittenGame from "./games/kitten.mjs?v=2";
import PuppyGame from "./games/puppy.mjs?v=2";
import BalloonGame from "./games/balloon.mjs?v=2";
import GardenGame from "./games/garden.mjs?v=2";
import SkyGame from "./games/sky.mjs?v=2";

const GAMES = [KittenGame, PuppyGame, BalloonGame, GardenGame, SkyGame];
const $ = (s) => document.querySelector(s);
const SETTINGS_KEY = "sleepy-kitten-settings", STATS_KEY = "sleepy-kitten-stats";
const reducedMotionPref = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
const settings = Object.assign(
  { mode: "turns", sensitivity: 0, turnGap: 1.0, sessionSec: 240, skyClimbSec: 1.6, sounds: false, calm: reducedMotionPref, floorDb: null, tab: "kitten" },
  JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}")
);
const save = () => localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
const now = () => performance.now() / 1000;

const turns = new TurnTracker({ mode: settings.mode, turnGap: settings.turnGap });
const session = { start: null, over: false, calibrated: false };
let game = null, GameClass = null, openToken = 0, micReady = false, lastHop = null, panelOpen = false;

const api = {
  settings, turns, now,
  calibrated: () => session.calibrated,
  stat: (dur) => recordStat(dur),
  chime: () => maybeChime(),
};

// ---------- mic ----------
const mic = new Mic({
  onHop: (r) => onHop(r),
  onProblem: (text) => { $("#micProblemText").textContent = text; $("#micProblem").hidden = false; },
  onNeedTap: () => { $("#tapToStart").hidden = false; },
  onRunning: () => { $("#tapToStart").hidden = true; keepAwake(); },
});
const debug = (window.__kitten = { settings, session, turns, mic, events: [], get game() { return game; }, get gameId() { return GameClass && GameClass.id; }, open: (id) => openGame(id) });

async function startMic() {
  $("#micProblem").hidden = true;
  micReady = session.calibrated;                 // calibrate once per session, reuse across tabs
  lastHop = null;
  await mic.start({ sens: settings.sensitivity, floorDb: settings.floorDb, calibrate: !session.calibrated });
}
$("#tapToStart").addEventListener("pointerdown", async (e) => { e.preventDefault(); await mic.ensureRunning(); });
$("#micRetry").addEventListener("click", () => startMic());

function onHop(r) {
  lastHop = r;
  if (r.event && r.event.type === "calibrated") {
    settings.floorDb = r.event.floorDb; save();
    session.calibrated = true; micReady = true;
    if (session.start == null) session.start = now();
    updateFloorInfo();
    game?.onCalibrated?.(now());
  }
  if (!micReady || panelOpen || !game || session.over && game.done) return;
  const t = now();
  for (const ev of [r.event, r.event2]) {
    if (!ev) continue;
    if (ev.type === "onset") {
      const who = game.ownTurns ? game.onOnset(t) : (() => { const w = turns.onOnset(t); game.onOnset(t, w); return w; })();
      debug.events.push({ t, game: GameClass.id, type: "onset", who });
    } else if (ev.type === "end") {
      const who = game.ownTurns ? game.onEnd(t, ev.duration) : (() => { const w = turns.onEnd(t); game.onEnd(t, ev.duration, w); return w; })();
      debug.events.push({ t, game: GameClass.id, type: "end", who, dur: ev.duration });
    }
  }
}
KittenGame.prototype.ownTurns = true; // the kitten's brain does its own turn-taking (same rules)

// ---------- optional app sound (off by default) ----------
function maybeChime() {
  const ctx = mic.ctx;
  if (!settings.sounds || !ctx || (lastHop && lastHop.active)) return; // never while he's vocalising
  const dur = 0.45, t0 = ctx.currentTime + 0.05;
  mic.post({ type: "mute", sec: dur + 0.05 + 0.3 }); // ignore our own sound, plus 300 ms
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(0.06, t0 + 0.04); g.gain.exponentialRampToValueAtTime(0.0005, t0 + dur);
  g.connect(ctx.destination);
  [523.25, 659.25].forEach((f, i) => { const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = f; o.connect(g); o.start(t0 + i * 0.12); o.stop(t0 + dur); });
}

// ---------- screen on ----------
let wake = null;
async function keepAwake() { try { if ("wakeLock" in navigator && !wake) { wake = await navigator.wakeLock.request("screen"); wake.addEventListener("release", () => (wake = null)); } } catch (_) {} }
function releaseWake() { try { wake && wake.release(); } catch (_) {} wake = null; }
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && mic.ctx) { keepAwake(); mic.ensureRunning(); } });

// ---------- games and tabs ----------
const play = $("#play"), tabsEl = $("#tabs");
async function openGame(id) {
  const G = GAMES.find((g) => g.id === id) || GAMES[0];
  const token = ++openToken;
  mic.stop(); micReady = false; lastHop = null;     // only the visible game ever listens
  if (game) { try { game.unmount(); } catch (_) {} game = null; }
  turns.reset(); holding.clear();
  GameClass = G; settings.tab = G.id; save(); renderTabs();
  const stage = document.createElement("div");
  stage.className = `stage ${G.anchor === "bottom" ? "bottom" : "center"}${G.wide ? " wide" : ""}`;
  stage.dataset.game = G.id;
  play.replaceChildren(stage);
  const g = new G(api);
  await g.mount(stage, { over: session.over });
  if (token !== openToken) { g.unmount(); return; }
  game = g;
  if (!session.over) await startMic();
}

let lastSwitch = -1, tapStart = null;
function renderTabs() {
  if (!tabsEl.children.length) {
    for (const G of GAMES) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "tab"; b.dataset.id = G.id; b.setAttribute("role", "tab");
      b.setAttribute("aria-label", { kitten: "Sleepy Kitten", puppy: "Copycat Puppy", balloon: "Big Balloon", garden: "Sound Garden", sky: "Sky Balloon" }[G.id]);
      b.innerHTML = `<img src="${G.icon}" alt="" draggable="false">`;
      tabsEl.appendChild(b);
    }
  }
  for (const b of tabsEl.children) b.setAttribute("aria-selected", String(b.dataset.id === (GameClass && GameClass.id)));
}
// deliberate taps only: same tab, little movement, not too long; 400 ms debounce between switches
tabsEl.addEventListener("pointerdown", (e) => { const b = e.target.closest(".tab"); tapStart = b ? { b, x: e.clientX, y: e.clientY, t: now(), id: e.pointerId } : null; });
tabsEl.addEventListener("pointerup", (e) => {
  const s = tapStart; tapStart = null;
  if (!s || s.id !== e.pointerId) return;
  const b = e.target.closest(".tab"), t = now();
  if (b !== s.b || Math.hypot(e.clientX - s.x, e.clientY - s.y) > 14 || t - s.t > 0.9) return;
  if (t - lastSwitch < 0.4 || b.dataset.id === GameClass.id) return;
  lastSwitch = t; openGame(b.dataset.id);
});
tabsEl.addEventListener("pointercancel", () => (tapStart = null));
tabsEl.addEventListener("contextmenu", (e) => e.preventDefault());

// ---------- hold-for-Dad ----------
const holding = new Set();
const setHold = (on) => { turns.hold = on; game && game.setHold && game.setHold(on); };
window.addEventListener("pointerdown", (e) => {
  if (e.target.closest("#gate, dialog, #tapToStart, #micProblem, #tabs")) return;
  holding.add(e.pointerId); setHold(true);
});
const release = (e) => { holding.delete(e.pointerId); if (!holding.size) setHold(false); };
window.addEventListener("pointerup", release); window.addEventListener("pointercancel", release);

// ---------- main loop ----------
let lvl = 0, lastT = now();
function frame() {
  const t = now(), dt = Math.min(0.1, t - lastT); lastT = t;
  const target = lastHop && lastHop.active ? lastHop.level : 0;
  lvl += (target - lvl) * (1 - Math.exp(-dt / (target > lvl ? 0.03 : 0.25)));  // fast attack, slow release
  if (game && !panelOpen) {
    if (session.start != null && !session.over && t - session.start >= settings.sessionSec) { session.over = true; game.endSession(t); }
    try { game.frame(t, dt, lvl); } catch (err) { console.error(err); }
    if (session.over && game.done && mic.ctx) { mic.stop(); micReady = false; lastHop = null; releaseWake(); document.body.classList.add("done"); }
  }
  drawWave(t, dt);
  if (panelOpen) drawMeter();
  requestAnimationFrame(frame);
}

// ---------- rolling sound wave across the top ----------
// Thin bright line, driven by the same smoothed voice-band level as the games. Gentle idle swell when
// quiet, taller with louder voices (capped), slower and smaller with calm motion. Coral for Dad's go,
// easing to teal for Liam's turn. Flattens and dims when the session ends and the mic is released.
const wave = $("#wave"), wctx = wave.getContext("2d");
let wAmp = 0, wPhase = 0, wTint = 0, wAlpha = 1, wW = 0, wH = 0, wDpr = 1;
function sizeWave() { wDpr = Math.min(2, window.devicePixelRatio || 1); wW = wave.clientWidth; wH = wave.clientHeight; wave.width = Math.round(wW * wDpr); wave.height = Math.round(wH * wDpr); }
window.addEventListener("resize", sizeWave); sizeWave();
const mixRgb = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
const CORAL = [255, 112, 84], TEAL = [18, 178, 170];
function drawWave(t, dt) {
  if (!wW) return;
  const calm = settings.calm, done = !mic.ctx;
  const idle = calm ? 1.5 : 3, peak = calm ? 10 : 20;
  const target = done ? 0 : idle + (peak - idle) * Math.min(1, lvl * 1.4);
  wAmp += (target - wAmp) * (1 - Math.exp(-dt / (target > wAmp ? 0.12 : 0.45)));
  wPhase += dt * (calm ? 0.9 : 1.8) * (1 + Math.min(1, lvl) * 0.6);
  const liam = !!(game && !done && game.liamTurn && game.liamTurn(t));
  wTint += ((liam ? 1 : 0) - wTint) * (1 - Math.exp(-dt / 0.8));
  wAlpha += ((done ? 0.25 : 1) - wAlpha) * (1 - Math.exp(-dt / 1.5));
  const [r, g, b] = mixRgb(CORAL, TEAL, wTint), c = wctx, mid = wH * 0.5;
  c.setTransform(wDpr, 0, 0, wDpr, 0, 0); c.clearRect(0, 0, wW, wH); c.beginPath();
  for (let x = 0; x <= wW; x += 4) {
    const u = x / wW, env = Math.sin(Math.PI * u);
    const y = Math.sin(u * 9.0 - wPhase * 2.1) * 0.6 + Math.sin(u * 15.7 - wPhase * 3.3 + 1.3) * 0.28 + Math.sin(u * 4.1 + wPhase * 1.2) * 0.22;
    const py = mid + y * wAmp * (0.35 + 0.65 * env);
    if (x === 0) c.moveTo(x, py); else c.lineTo(x, py);
  }
  c.lineCap = "round"; c.lineJoin = "round";
  c.strokeStyle = `rgba(${r},${g},${b},${(0.28 * wAlpha).toFixed(3)})`; c.lineWidth = 8; c.stroke();
  c.strokeStyle = `rgba(${r},${g},${b},${(0.95 * wAlpha).toFixed(3)})`; c.lineWidth = 3; c.stroke();
}

// ---------- parent gate: press and hold the top-right corner for 2 s ----------
let gateTimer = null;
const gate = $("#gate");
gate.addEventListener("pointerdown", (e) => { e.preventDefault(); clearTimeout(gateTimer); gateTimer = setTimeout(openPanel, 2000); });
["pointerup", "pointerleave", "pointercancel"].forEach((ev) => gate.addEventListener(ev, () => clearTimeout(gateTimer)));
gate.addEventListener("contextmenu", (e) => e.preventDefault());

const dlg = $("#parent");
function openPanel() {
  if (navigator.vibrate) navigator.vibrate(20);
  panelOpen = true;
  dlg.querySelectorAll('input[name="mode"]').forEach((i) => (i.checked = i.value === settings.mode));
  dlg.querySelectorAll('input[name="session"]').forEach((i) => (i.checked = +i.value === settings.sessionSec));
  $("#sens").value = settings.sensitivity; $("#turnGap").value = settings.turnGap; $("#skyClimb").value = settings.skyClimbSec;
  $("#sounds").checked = settings.sounds; $("#calm").checked = settings.calm;
  refreshLabels(); updateFloorInfo(); showStats();
  dlg.showModal();
}
dlg.addEventListener("close", () => { panelOpen = false; turns.current = null; if (game && game.brain) game.brain.current = null; });
function refreshLabels() {
  const s = +$("#sens").value;
  $("#sensOut").textContent = s === 0 ? "normal" : s > 0 ? `+${s}` : `${s}`;
  $("#gapOut").textContent = `${(+$("#turnGap").value).toFixed(1)} s`;
  $("#skyOut").textContent = `${(+$("#skyClimb").value).toFixed(1)} s of voice`;
  $("#gapField").style.display = settings.mode === "turns" ? "" : "none";
}
dlg.addEventListener("input", (e) => {
  const el = e.target;
  if (el.name === "mode") { settings.mode = el.value; turns.set("mode", el.value); game?.setOption?.("mode", el.value); }
  if (el.name === "session") settings.sessionSec = +el.value;
  if (el.id === "sens") { settings.sensitivity = +el.value; mic.post({ type: "sens", db: settings.sensitivity }); }
  if (el.id === "turnGap") { settings.turnGap = +el.value; turns.set("turnGap", +el.value); game?.setOption?.("turnGap", +el.value); }
  if (el.id === "skyClimb") settings.skyClimbSec = +el.value;
  if (el.id === "sounds") settings.sounds = el.checked;
  if (el.id === "calm") settings.calm = el.checked;
  save(); refreshLabels();
});
$("#recal").addEventListener("click", () => { mic.post({ type: "calibrate", sec: 3 }); $("#floorInfo").textContent = "Measuring… stay quiet for 3 seconds."; });
$("#newSession").addEventListener("click", async () => {
  dlg.close(); document.body.classList.remove("done");
  Object.assign(session, { start: null, over: false, calibrated: false });
  turns.reset();
  if (game) game.newSession(now());
  await startMic();
});
function updateFloorInfo() {
  if (settings.floorDb == null) return;
  const thr = lastHop && lastHop.thr != null ? ` Listening above ${lastHop.thr.toFixed(0)} dB.` : "";
  $("#floorInfo").textContent = `Room noise: ${settings.floorDb.toFixed(0)} dB.${thr}`;
}
function drawMeter() {
  const h = lastHop; if (!h) return;
  const pct = (db) => Math.max(0, Math.min(100, ((db + 90) / 80) * 100));
  $("#meterBar").style.width = `${pct(h.db)}%`;
  if (h.thr != null) $("#meterThr").style.left = `${pct(h.thr)}%`;
  $("#voiceDot").classList.toggle("on", !!h.active);
  if (Math.random() < 0.05) updateFloorInfo();
}

// ---------- parent-only stats (on this phone only) ----------
const today = () => new Date().toLocaleDateString("en-CA");
function loadStats() { try { return JSON.parse(localStorage.getItem(STATS_KEY) || "{}"); } catch (_) { return {}; } }
function recordStat(dur) {
  const s = loadStats(), d = (s[today()] ||= { sounds: 0, longest: 0 });
  d.sounds++; d.longest = Math.max(d.longest, dur);
  for (const k of Object.keys(s).sort().slice(0, -14)) delete s[k];
  localStorage.setItem(STATS_KEY, JSON.stringify(s));
}
function showStats() { const d = loadStats()[today()] || { sounds: 0, longest: 0 }; $("#statSounds").textContent = d.sounds; $("#statLongest").textContent = d.longest.toFixed(1); }
$("#clearStats").addEventListener("click", () => { localStorage.removeItem(STATS_KEY); showStats(); });

// ---------- go ----------
renderTabs();
requestAnimationFrame(frame);
openGame(settings.tab);

  // Service worker
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }
