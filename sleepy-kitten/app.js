// Sleepy Kitten: Dad's voice stirs the kitten, Liam's voice wakes it up.
// Everything runs on the phone. Audio is analysed live and never stored or sent anywhere.
import { KittenBrain } from "./turns.mjs?v=1";

const $ = (s) => document.querySelector(s);
const SETTINGS_KEY = "sleepy-kitten-settings";
const STATS_KEY = "sleepy-kitten-stats";
const reducedMotionPref = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
const settings = Object.assign(
  { mode: "turns", sensitivity: 0, turnGap: 1.0, sessionSec: 240, sounds: false, calm: reducedMotionPref, floorDb: null },
  JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}")
);
const save = () => localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
const now = () => performance.now() / 1000;

const brain = new KittenBrain({ mode: settings.mode, turnGap: settings.turnGap, sessionSec: settings.sessionSec });
const audio = { ctx: null, stream: null, node: null, post: () => {}, calibrated: false, lastHop: null, running: false };
const debug = (window.__kitten = { brain, settings, audio, events: [] });

// ---------- audio ----------
async function startAudio() {
  $("#micProblem").hidden = true;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return micProblem("This browser can't use the microphone.");
  try {
    audio.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
    });
  } catch (err) {
    return micProblem(err && err.name === "NotAllowedError"
      ? "Microphone access is off. Allow the microphone for this app in your phone's settings, then tap Try again."
      : "The microphone isn't available right now. Tap Try again.");
  }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  audio.ctx = new Ctx({ latencyHint: "interactive" });
  const src = audio.ctx.createMediaStreamSource(audio.stream);
  const sink = audio.ctx.createGain(); sink.gain.value = 0; sink.connect(audio.ctx.destination);
  if (audio.ctx.audioWorklet) {
    await audio.ctx.audioWorklet.addModule("mic-worklet.js?v=1");
    audio.node = new AudioWorkletNode(audio.ctx, "mic-processor", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    audio.node.port.onmessage = (e) => onHop(e.data);
    audio.post = (m) => audio.node.port.postMessage(m);
  } else {
    // Older browsers: run the same detector on the main thread.
    const { VoiceDetector } = await import("./detector.mjs");
    const d = new VoiceDetector(audio.ctx.sampleRate);
    const { handle } = { handle: (det, m) => {
      if (m.type === "floor") det.setFloor(m.db); else if (m.type === "sens") det.setSensitivity(m.db);
      else if (m.type === "calibrate") det.startCalibration(m.sec || 3); else if (m.type === "mute") det.muteUntil(det.time + m.sec);
    } };
    audio.node = audio.ctx.createScriptProcessor(1024, 1, 1);
    audio.node.onaudioprocess = (e) => { for (const r of d.process(e.inputBuffer.getChannelData(0))) onHop(r); };
    audio.post = (m) => handle(d, m);
  }
  src.connect(audio.node); audio.node.connect(sink);
  audio.post({ type: "sens", db: settings.sensitivity });
  if (settings.floorDb != null) audio.post({ type: "floor", db: settings.floorDb });
  audio.post({ type: "calibrate", sec: 3 });  // kitten sleeps while we measure the room
  await ensureRunning();
}

async function ensureRunning() {
  if (!audio.ctx) return;
  if (audio.ctx.state !== "running") {
    // resume() can stay pending until a user gesture, so don't wait on it forever
    try { await Promise.race([audio.ctx.resume(), new Promise((r) => setTimeout(r, 500))]); } catch (_) {}
  }
  if (audio.ctx.state !== "running") {
    // The browser wants one tap first (web only; the Android app and home-screen app don't).
    $("#tapToStart").hidden = false;
  } else {
    $("#tapToStart").hidden = true;
    audio.running = true;
    keepAwake();
  }
}
$("#tapToStart").addEventListener("pointerdown", async (e) => { e.preventDefault(); await ensureRunning(); });

function micProblem(text) { $("#micProblemText").textContent = text; $("#micProblem").hidden = false; }
$("#micRetry").addEventListener("click", () => { stopAudio(); startAudio(); });

function stopAudio() {
  if (audio.stream) audio.stream.getTracks().forEach((t) => t.stop());
  if (audio.ctx) audio.ctx.close().catch(() => {});
  audio.stream = audio.ctx = audio.node = null; audio.running = false; audio.calibrated = false;
  releaseWake();
}

let panelOpen = false;
function onHop(r) {
  audio.lastHop = r;
  if (r.event && r.event.type === "calibrated") {
    settings.floorDb = r.event.floorDb; save();
    if (!audio.calibrated) { audio.calibrated = true; brain.start(now()); }
    updateFloorInfo();
  }
  if (!audio.calibrated || panelOpen) return;
  const t = now();
  for (const ev of [r.event, r.event2]) {
    if (!ev) continue;
    if (ev.type === "onset") {
      const who = brain.onOnset(t);
      if (who) { debug.events.push({ t, type: "onset", who, state: brain.state }); onsetKick(who); }
    } else if (ev.type === "end") {
      const who = brain.onEnd(t, ev.duration);
      if (who) debug.events.push({ t, type: "end", who, dur: ev.duration, state: brain.state });
      if (who === "liam") { recordStat(ev.duration); if (brain.reward && brain.reward.purr) ripples(brain.reward.size); maybeChime(); }
    }
  }
}

// ---------- optional app sound (off by default) ----------
function maybeChime() {
  if (!settings.sounds || !audio.ctx || brain.current) return;
  const dur = 0.45, ctx = audio.ctx, t0 = ctx.currentTime + 0.05;
  audio.post({ type: "mute", sec: dur + 0.05 + 0.3 }); // don't hear our own sound, plus 300 ms
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(0.06, t0 + 0.04); g.gain.exponentialRampToValueAtTime(0.0005, t0 + dur);
  g.connect(ctx.destination);
  [523.25, 659.25].forEach((f, i) => {
    const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = f;
    o.connect(g); o.start(t0 + i * 0.12); o.stop(t0 + dur);
  });
}

// ---------- keep the screen on during a session ----------
let wake = null;
async function keepAwake() { try { if ("wakeLock" in navigator && !wake) wake = await navigator.wakeLock.request("screen"); wake?.addEventListener?.("release", () => (wake = null)); } catch (_) {} }
function releaseWake() { try { wake && wake.release(); } catch (_) {} wake = null; }
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && audio.running && brain.listening) { keepAwake(); ensureRunning(); } });

// ---------- drawing ----------
// Remy's art: 512x512 animated WebPs at 12 fps on opaque cream. Loops: sleeping, waiting,
// awake_wiggle (3 s, starts/ends on the waiting pose). One-shots (2.5 s, switched on a timer, not on
// the WebP loop flag): stirring (sleeping -> waiting), curling_up (waiting -> sleeping).
const CLIPS = {
  sleeping: { loop: true, sec: 3 },
  stirring: { loop: false, sec: 2.5, next: "waiting" },
  waiting: { loop: true, sec: 3 },
  awake_wiggle: { loop: true, sec: 3 },
  curling_up: { loop: false, sec: 2.5, next: "sleeping" },
};
const artUrl = (name, ext = "webp") => `art/kitten_${name}.${ext}`;
const blobs = {};
let blobsReady = Promise.all(Object.keys(CLIPS).map(async (k) => {
  try { const r = await fetch(artUrl(k)); if (r.ok) blobs[k] = await r.blob(); } catch (_) {}
}));

const kitten = $("#kitten"), glowEl = $("#glow");
let front = $("#layerA"), back = $("#layerB");
let clip = null, clipStart = 0, pending = 0, fadeT = 0, fadeSec = 0, wiggleExitAt = null, frontUrl = null, playN = 0;
let lvl = 0, glowA = 0, kick = 0, lastT = now();

function onsetKick(who) { kick = who === "liam" ? 1 : 0.6; }

/** Start a clip from its first frame on the back layer, then fade it over the front. */
function play(name, fade = 0.15, still = false) {
  const token = ++pending;
  let url;
  if (still) url = artUrl(name, "png");
  else if (blobs[name]) url = URL.createObjectURL(blobs[name]); // fresh URL = animation restarts at frame 0
  else url = `${artUrl(name)}?r=${++playN}`;
  back.onload = () => {
    if (token !== pending) return;
    clip = still ? null : name; clipStart = now(); wiggleExitAt = null;
    fadeSec = fade; fadeT = 0;
    back.style.zIndex = 2; front.style.zIndex = 1;
    const old = front, oldUrl = frontUrl;
    front = back; back = old; frontUrl = url.startsWith("blob:") ? url : null;
    front.style.opacity = fade > 0 ? 0 : 1;
    setTimeout(() => { if (oldUrl) URL.revokeObjectURL(oldUrl); }, (fade + 0.3) * 1000);
    pending = 0;
  };
  back.onerror = () => { if (token === pending) pending = 0; };
  back.src = url;
}

/** Choose the next clip so poses always join up. */
function direct(t) {
  if (pending || document.body.classList.contains("done")) return;
  const target = brain.pose(); // "sleeping" | "waiting" | "wiggle"
  if (!clip) { play(target === "waiting" ? "waiting" : "sleeping", 0.3); return; }
  const c = CLIPS[clip], el = t - clipStart;
  if (target === "wiggle") { if (clip !== "awake_wiggle") play("awake_wiggle", 0.2); return; }
  if (clip === "awake_wiggle") {
    // finish whole cycles so it lands back on the waiting pose; a bigger reply gets more cycles
    if (wiggleExitAt == null) {
      const minCycles = brain.reward && brain.reward.size >= 0.6 ? 2 : 1;
      wiggleExitAt = clipStart + Math.max(minCycles, Math.ceil((el + 0.05) / 3)) * 3;
    }
    if (t >= wiggleExitAt) play("waiting", 0.08);
    return;
  }
  if (!c.loop) { if (el >= c.sec) play(c.next, 0.08); return; } // one-shot: switch on a 2.5 s timer
  if (clip === "sleeping" && target === "waiting") play("stirring", 0.15);
  else if (clip === "waiting" && target === "sleeping") play("curling_up", 0.15);
}

function ripples(size) {
  if (settings.calm) return;
  const host = $("#ripples"), n = size > 0.7 ? 3 : 2;
  for (let i = 0; i < n; i++) {
    const r = document.createElement("div"); r.className = "ripple"; r.style.animationDelay = `${i * 0.45}s`;
    host.appendChild(r); setTimeout(() => r.remove(), 3500 + i * 450);
  }
}

function frame() {
  const t = now(), dt = Math.min(0.1, t - lastT); lastT = t;
  if (audio.calibrated && !panelOpen) {
    const prev = brain.state;
    brain.tick(t);
    if (prev !== "done" && brain.state === "done") finishSession();
  }
  direct(t);
  if (fadeT < 1) { fadeT = fadeSec > 0 ? Math.min(1, fadeT + dt / fadeSec) : 1; front.style.opacity = fadeT.toFixed(3); }

  // smoothed loudness: fast attack, slower release
  const hop = audio.lastHop, target = hop && hop.active ? hop.level : 0;
  lvl += (target - lvl) * (1 - Math.exp(-dt / (target > lvl ? 0.03 : 0.25)));
  kick *= Math.exp(-dt / 0.35);

  // light procedural motion on top of the art: an instant "I heard you" lift, size with loudness,
  // and a little hop after a long reply. The art itself does the stirring and the wiggle.
  const st = brain.state, calm = settings.calm;
  let lift = 0, scale = 1;
  if (st === "stir" || st === "wait" || st === "wake") {
    lift = -(lvl * 8 + kick * 8); scale = 1 + lvl * 0.035 + kick * 0.02;
  } else if (st === "happy" && !calm) {
    const r = brain.reward || { size: 0.3, hop: false }, el = t - brain.since;
    if (r.hop && el < 1.6) lift = -Math.abs(Math.sin(Math.PI * 1.25 * el)) * 16 * r.size;
  }
  kitten.style.transform = `translateY(${lift.toFixed(1)}px) scale(${scale.toFixed(3)})`;

  // "your turn" glow in the clear space above the waiting kitten: slow 0.4 Hz pulse, never flashing
  const gOn = brain.glow && !panelOpen && (clip === "waiting" || clip === "sleeping" || (clip === "stirring" && t - clipStart > 1.5));
  const gTarget = gOn ? 0.5 + 0.3 * (0.5 + 0.5 * Math.sin((2 * Math.PI * t) / 2.6)) : 0;
  glowA += (gTarget - glowA) * (1 - Math.exp(-dt / 0.6));
  glowEl.style.opacity = glowA.toFixed(3);

  if (panelOpen) drawMeter();
  requestAnimationFrame(frame);
}

function finishSession() {
  stopAudio();                   // stops listening: the mic is released
  play("sleeping", 1.5, true);   // calm still of the sleeping kitten
  document.body.classList.add("done");
}

// ---------- hold-for-Dad ----------
const holding = new Set();
window.addEventListener("pointerdown", (e) => {
  if (e.target.closest("#gate, dialog, #tapToStart, #micProblem")) return;
  holding.add(e.pointerId); brain.setHold(true);
});
const release = (e) => { holding.delete(e.pointerId); if (!holding.size) brain.setHold(false); };
window.addEventListener("pointerup", release); window.addEventListener("pointercancel", release);

// ---------- parent gate: press and hold the top-right corner for 2 s ----------
let gateTimer = null;
const gate = $("#gate");
gate.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  clearTimeout(gateTimer);
  gateTimer = setTimeout(openPanel, 2000);
});
["pointerup", "pointerleave", "pointercancel"].forEach((ev) => gate.addEventListener(ev, () => clearTimeout(gateTimer)));
gate.addEventListener("contextmenu", (e) => e.preventDefault());

const dlg = $("#parent");
function openPanel() {
  if (navigator.vibrate) navigator.vibrate(20);
  panelOpen = true;
  dlg.querySelectorAll('input[name="mode"]').forEach((i) => (i.checked = i.value === settings.mode));
  dlg.querySelectorAll('input[name="session"]').forEach((i) => (i.checked = +i.value === settings.sessionSec));
  $("#sens").value = settings.sensitivity; $("#turnGap").value = settings.turnGap;
  $("#sounds").checked = settings.sounds; $("#calm").checked = settings.calm;
  refreshLabels(); updateFloorInfo(); showStats();
  dlg.showModal();
}
dlg.addEventListener("close", () => { panelOpen = false; if (brain.current) brain.current = null; });

function refreshLabels() {
  const s = +$("#sens").value;
  $("#sensOut").textContent = s === 0 ? "normal" : s > 0 ? `+${s}` : `${s}`;
  $("#gapOut").textContent = `${(+$("#turnGap").value).toFixed(1)} s`;
  $("#gapField").style.display = settings.mode === "turns" ? "" : "none";
}
dlg.addEventListener("input", (e) => {
  const el = e.target;
  if (el.name === "mode") { settings.mode = el.value; brain.set("mode", el.value); }
  if (el.name === "session") { settings.sessionSec = +el.value; brain.set("sessionSec", +el.value); }
  if (el.id === "sens") { settings.sensitivity = +el.value; audio.post({ type: "sens", db: settings.sensitivity }); }
  if (el.id === "turnGap") { settings.turnGap = +el.value; brain.set("turnGap", +el.value); }
  if (el.id === "sounds") settings.sounds = el.checked;
  if (el.id === "calm") settings.calm = el.checked;
  save(); refreshLabels();
});
$("#recal").addEventListener("click", () => { audio.post({ type: "calibrate", sec: 3 }); $("#floorInfo").textContent = "Measuring… stay quiet for 3 seconds."; });
$("#newSession").addEventListener("click", async () => {
  dlg.close(); document.body.classList.remove("done"); clip = null;
  if (!audio.ctx) { audio.calibrated = false; brain.start(now()); await startAudio(); }
  else brain.start(now());
});

function updateFloorInfo() {
  const h = audio.lastHop;
  if (settings.floorDb == null) return;
  const thr = h && h.thr != null ? ` Listening above ${h.thr.toFixed(0)} dB.` : "";
  $("#floorInfo").textContent = `Room noise: ${settings.floorDb.toFixed(0)} dB.${thr}`;
}
function drawMeter() {
  const h = audio.lastHop; if (!h) return;
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
function showStats() {
  const d = loadStats()[today()] || { sounds: 0, longest: 0 };
  $("#statSounds").textContent = d.sounds; $("#statLongest").textContent = d.longest.toFixed(1);
}
$("#clearStats").addEventListener("click", () => { localStorage.removeItem(STATS_KEY); showStats(); });

// ---------- go ----------
blobsReady.then(() => play("sleeping", 0));
requestAnimationFrame(frame);
startAudio();

  // Service worker
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }
