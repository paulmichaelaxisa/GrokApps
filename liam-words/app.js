/* Liam Words — toddler PWA prototype
   Auslan: open Signbank video only — no in-app tips or hand diagrams. */

(function () {
  "use strict";

  const { ART } = window.LIAM_ART;
  const { WORDS } = window.LIAM_WORDS;

  // --- State ---
  let currentWord = null;
  let step = 0; // 0 picture, 1 say, 2 auslan

  // --- DOM ---
  const $ = (id) => document.getElementById(id);
  const screenHome = $("screen-home");
  const screenWord = $("screen-word");
  const wordGrid = $("wordGrid");
  const backBtn = $("backBtn");
  const stepChip = $("stepChip");
  const prevBtn = $("prevBtn");
  const nextBtn = $("nextBtn");
  const speakBtn = $("speakBtn");
  const progressDots = $("progressDots");
  const stepStage = $("stepStage");
  const swipeHint = $("swipeHint");
  const HINT_KEY = "liam-words-swipe-hint";

  function showScreen(home) {
    screenHome.classList.toggle("active", home);
    screenHome.hidden = !home;
    screenWord.classList.toggle("active", !home);
    screenWord.hidden = home;
    backBtn.hidden = home;
    stepChip.hidden = home;
  }

  function artId(id) {
    return String(id || "").replace(/[^a-z0-9_-]/gi, "");
  }

  function createWordArt(id, size) {
    const safe = artId(id);
    const picture = document.createElement("picture");
    const source = document.createElement("source");
    source.srcset = "art/" + safe + ".webp";
    source.type = "image/webp";
    source.media = "(prefers-reduced-motion: no-preference)";
    const img = document.createElement("img");
    img.className = "word-art-img";
    img.src = "art/" + safe + ".png";
    img.alt = "";
    img.width = size;
    img.height = size;
    img.decoding = "async";
    img.draggable = false;
    img.addEventListener("error", function onErr() {
      img.removeEventListener("error", onErr);
      const svg = ART && ART[id];
      if (svg && picture.parentNode) {
        picture.outerHTML = svg;
      }
    });
    picture.appendChild(source);
    picture.appendChild(img);
    return picture;
  }

  function buildGrid() {
    wordGrid.innerHTML = "";
    WORDS.forEach((w) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "word-tile";
      btn.setAttribute("role", "listitem");
      btn.setAttribute("aria-label", w.label);
      const art = document.createElement("span");
      art.className = "tile-art";
      art.setAttribute("aria-hidden", "true");
      art.appendChild(createWordArt(w.id, 256));
      const label = document.createElement("span");
      label.className = "tile-label";
      label.textContent = w.label;
      btn.appendChild(art);
      btn.appendChild(label);
      btn.addEventListener("click", () => openWord(w));
      wordGrid.appendChild(btn);
    });
  }

  function escapeHtml(s) {
    const map = {
      "&": "&" + "amp;",
      "<": "&" + "lt;",
      ">": "&" + "gt;",
      '"': "&" + "quot;",
    };
    return String(s).replace(/[&<>"]/g, (ch) => map[ch]);
  }

  function openWord(w) {
    cancelSwipe();
    stopSpeech();
    currentWord = w;
    step = 0;
    renderStep();
    showScreen(false);
    maybeShowHint();
  }

  function goHome() {
    cancelSwipe();
    stopSpeech();
    stopSignVideo();
    currentWord = null;
    showScreen(true);
  }

  function maybeShowHint() {
    if (!swipeHint) return;
    try {
      if (localStorage.getItem(HINT_KEY) === "1") {
        swipeHint.hidden = true;
        return;
      }
    } catch (_) {}
    swipeHint.hidden = false;
  }

  function dismissHint() {
    if (swipeHint) swipeHint.hidden = true;
    try {
      localStorage.setItem(HINT_KEY, "1");
    } catch (_) {}
  }

  function goPrev() {
    if (step > 0) {
      stopSpeech();
      step -= 1;
      renderStep();
    }
  }

  function goNext() {
    if (step < 2) {
      stopSpeech();
      step += 1;
      renderStep();
    } else {
      goHome();
    }
  }

  function renderStep() {
    if (!currentWord) return;
    const w = currentWord;

    resetPanelStyles();

    // Panels
    $("step-picture").hidden = step !== 0;
    $("step-say").hidden = step !== 1;
    $("step-auslan").hidden = step !== 2;

    // Dots
    progressDots.querySelectorAll(".dot").forEach((d) => {
      const s = Number(d.dataset.step);
      d.classList.toggle("active", s === step);
      d.classList.toggle("done", s < step);
    });

    stepChip.textContent = `${step + 1} / 3`;

    // Picture
    const pictureArt = $("pictureArt");
    pictureArt.replaceChildren(createWordArt(w.id, 512));
    $("pictureWord").textContent = w.label;

    // Say
    $("sayWord").textContent = w.label;
    const chunksEl = $("chunks");
    chunksEl.innerHTML = "";
    w.chunks.forEach((c, i) => {
      if (i > 0) {
        const plus = document.createElement("span");
        plus.className = "plus";
        plus.textContent = "+";
        plus.setAttribute("aria-hidden", "true");
        chunksEl.appendChild(plus);
      }
      const span = document.createElement("span");
      span.className = "chunk";
      span.textContent = c;
      chunksEl.appendChild(span);
    });

    // Auslan — bundled Signbank video, played inside the app
    $("auslanWord").textContent = w.label;
    if (step === 2) loadSignVideo(w);
    else stopSignVideo();

    prevBtn.disabled = step === 0;
    nextBtn.textContent = step === 2 ? "Done" : "Next";
    prevBtn.setAttribute("aria-label", "Previous step");
    nextBtn.setAttribute(
      "aria-label",
      step === 2 ? "Done, back to words" : "Next step"
    );
  }

  let currentAudio = null;
  let speakReset = null;
  const signVideo = $("signVideo");
  const signVideoWrap = $("signVideoWrap");
  const signPlayBtn = $("signPlayBtn");
  const reducedMotion = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

  function showSignPlayButton(show) {
    if (signPlayBtn) signPlayBtn.hidden = !show;
    if (signVideoWrap) {
      signVideoWrap.classList.toggle("is-paused", !!show);
      signVideoWrap.setAttribute(
        "aria-label",
        show ? "Play sign video" : "Replay sign video"
      );
    }
  }

  function tryPlaySignVideo() {
    if (!signVideo) return;
    signVideo.muted = true;
    signVideo.defaultMuted = true;
    signVideo.playsInline = true;
    const played = signVideo.play();
    if (played && typeof played.then === "function") {
      played.then(() => showSignPlayButton(false)).catch(() => showSignPlayButton(true));
    } else if (signVideo.paused) {
      showSignPlayButton(true);
    }
  }

  function stopSignVideo() {
    if (!signVideo) return;
    try {
      signVideo.pause();
      signVideo.currentTime = 0;
    } catch (_) {}
    showSignPlayButton(false);
  }

  function replaySignVideo() {
    if (!signVideo || !signVideo.dataset.srcLoaded) return;
    try {
      signVideo.currentTime = 0;
    } catch (_) {}
    showSignPlayButton(false);
    tryPlaySignVideo();
  }

  function loadSignVideo(w) {
    if (!signVideo || !signVideoWrap) return;
    const src = w && w.signVideo;
    if (!src) {
      signVideoWrap.hidden = true;
      stopSignVideo();
      signVideo.removeAttribute("src");
      signVideo.dataset.srcLoaded = "";
      return;
    }
    signVideoWrap.hidden = false;
    if (signVideo.dataset.srcLoaded !== src) {
      signVideo.src = src;
      signVideo.dataset.srcLoaded = src;
      signVideo.load();
    }
    signVideo.muted = true;
    signVideo.defaultMuted = true;
    signVideo.autoplay = !reducedMotion;
    signVideo.loop = !reducedMotion;
    signVideo.playsInline = true;
    signVideo.setAttribute("muted", "");
    signVideo.setAttribute("playsinline", "");
    signVideo.setAttribute("webkit-playsinline", "");
    if (reducedMotion) {
      showSignPlayButton(true);
      return;
    }
    showSignPlayButton(false);
    tryPlaySignVideo();
  }

  function stopSpeech() {
    if (speakReset) {
      const fn = speakReset;
      speakReset = null;
      fn();
    }
    if (currentAudio) {
      try {
        currentAudio.pause();
        currentAudio.currentTime = 0;
      } catch (_) {}
      currentAudio = null;
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }

  function speakWithSynthesis() {
    if (!currentWord || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(currentWord.speak);
    u.rate = 0.65;
    u.pitch = 1.05;
    u.lang = "en-AU";
    u.onend = u.onerror = () => {
      if (speakReset) {
        const fn = speakReset;
        speakReset = null;
        fn();
      }
    };
    window.speechSynthesis.speak(u);
  }

  function speakWord() {
    if (!currentWord) return;
    stopSpeech();
    const label = speakBtn.innerHTML;
    const resetUi = () => {
      speakBtn.classList.remove("speaking");
      speakBtn.innerHTML = label;
    };
    speakBtn.classList.add("speaking");
    speakBtn.innerHTML =
      '<span class="speak-icon" aria-hidden="true">🔊</span> Speaking…';
    speakReset = resetUi;

    const src = "audio/" + artId(currentWord.id) + ".mp3";
    const audio = new Audio(src);
    audio.preload = "auto";
    audio.muted = false;
    audio.volume = 1;
    currentAudio = audio;

    let usedFallback = false;
    const fallback = () => {
      if (usedFallback) return;
      usedFallback = true;
      if (currentAudio === audio) currentAudio = null;
      speakWithSynthesis();
    };
    audio.addEventListener("ended", () => {
      if (currentAudio === audio) currentAudio = null;
      if (speakReset === resetUi) {
        speakReset = null;
        resetUi();
      }
    });
    audio.addEventListener("error", fallback);
    const played = audio.play();
    if (played && typeof played.catch === "function") {
      played.catch(fallback);
    }
  }

  // Events
  backBtn.addEventListener("click", goHome);
  prevBtn.addEventListener("click", goPrev);
  nextBtn.addEventListener("click", goNext);
  speakBtn.addEventListener("click", speakWord);
  if (signVideoWrap) {
    signVideoWrap.addEventListener("click", replaySignVideo);
  }
  if (signVideo) {
    signVideo.addEventListener("playing", () => showSignPlayButton(false));
    signVideo.addEventListener("error", () => showSignPlayButton(true));
    signVideo.addEventListener("pause", () => {
      if (signVideoWrap && !signVideoWrap.hidden) showSignPlayButton(true);
    });
    signVideo.addEventListener("ended", () => {
      if (signVideoWrap && !signVideoWrap.hidden) showSignPlayButton(true);
    });
  }

  // Keyboard arrows (desktop)
  document.addEventListener("keydown", (e) => {
    if (!currentWord || screenWord.hidden) return;
    const tag = (e.target && e.target.tagName) || "";
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      goPrev();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      goNext();
    } else if (e.key === "Escape") {
      e.preventDefault();
      goHome();
    }
  });

  // Animated swipe: left = next, right = back
  const AXIS_LOCK = 10;
  const COMMIT_RATIO = 0.28;
  const COMMIT_MIN = 64;
  const FLICK = 0.5; // px/ms
  const ANIM_MS = 280;
  const SPRING_MS = 220;
  const RUBBER = 0.28;

  let drag = null;
  let swipeBusy = false;
  let suppressClick = false;

  function panelFor(s) {
    return document.querySelector('.step-panel[data-step="' + s + '"]');
  }

  function resetPanelStyles() {
    if (stepStage) {
      stepStage.classList.remove("is-swiping");
      stepStage.style.height = "";
    }
    document.querySelectorAll(".step-panel").forEach((el) => {
      el.style.transform = "";
      el.style.opacity = "";
      el.style.transition = "";
      el.classList.remove("is-peeking");
    });
  }

  function cancelSwipe() {
    drag = null;
    swipeBusy = false;
    resetPanelStyles();
  }

  function afterTransition(el, ms, cb) {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      cb();
    };
    if (reducedMotion || !el || ms <= 0) {
      finish();
      return;
    }
    el.addEventListener("transitionend", finish, { once: true });
    setTimeout(finish, ms + 50);
  }

  function beginSwipeLayer() {
    if (!stepStage) return;
    const h = stepStage.getBoundingClientRect().height;
    if (h > 0) stepStage.style.height = h + "px";
    stepStage.classList.add("is-swiping");
  }

  function applyDragVisual(x) {
    const width = Math.max(1, (stepStage && stepStage.clientWidth) || 300);
    const cur = panelFor(step);
    if (!cur) return;
    const rot = (x / width) * 8;
    const op = 1 - Math.min(0.35, Math.abs(x) / width * 0.45);
    if (!reducedMotion) {
      cur.style.transition = "none";
      cur.style.transform = "translateX(" + x + "px) rotate(" + rot + "deg)";
      cur.style.opacity = String(op);
    }
    const peekStep = x < 0 ? step + 1 : step - 1;
    document.querySelectorAll(".step-panel").forEach((el) => {
      if (el !== cur) {
        const s = Number(el.dataset.step);
        if (s !== peekStep) {
          el.hidden = true;
          el.classList.remove("is-peeking");
          el.style.transform = "";
          el.style.opacity = "";
        }
      }
    });
    if (peekStep >= 0 && peekStep <= 2) {
      const peek = panelFor(peekStep);
      if (peek) {
        peek.hidden = false;
        peek.classList.add("is-peeking");
        if (!reducedMotion) {
          const start = x < 0 ? width : -width;
          peek.style.transition = "none";
          peek.style.transform = "translateX(" + (start + x) + "px)";
          peek.style.opacity = String(Math.min(1, Math.abs(x) / width));
        }
      }
    }
  }

  function springBack(x) {
    const width = Math.max(1, (stepStage && stepStage.clientWidth) || 300);
    const cur = panelFor(step);
    const peekStep = x < 0 ? step + 1 : step - 1;
    const peek = peekStep >= 0 && peekStep <= 2 ? panelFor(peekStep) : null;
    const ms = reducedMotion ? 0 : SPRING_MS;
    if (cur && !reducedMotion) {
      cur.style.transition =
        "transform " + ms + "ms ease-out, opacity " + ms + "ms ease-out";
      cur.style.transform = "translateX(0) rotate(0deg)";
      cur.style.opacity = "1";
    }
    if (peek && !reducedMotion) {
      const end = x < 0 ? width : -width;
      peek.style.transition =
        "transform " + ms + "ms ease-out, opacity " + ms + "ms ease-out";
      peek.style.transform = "translateX(" + end + "px)";
      peek.style.opacity = "0";
    }
    swipeBusy = true;
    afterTransition(cur, ms, () => {
      resetPanelStyles();
      if (currentWord) {
        $("step-picture").hidden = step !== 0;
        $("step-say").hidden = step !== 1;
        $("step-auslan").hidden = step !== 2;
      }
      swipeBusy = false;
    });
  }

  function commitSwipe(dir) {
    const width = Math.max(1, (stepStage && stepStage.clientWidth) || 300);
    const cur = panelFor(step);
    const nextStep = step + dir;
    const peek = nextStep >= 0 && nextStep <= 2 ? panelFor(nextStep) : null;
    const ms = reducedMotion ? 0 : ANIM_MS;
    const endX = dir > 0 ? -width : width;
    const rot = dir > 0 ? -8 : 8;
    beginSwipeLayer();
    if (peek) {
      peek.hidden = false;
      peek.classList.add("is-peeking");
      if (!reducedMotion) {
        const start = dir > 0 ? width : -width;
        if (!peek.style.transform) {
          peek.style.transform = "translateX(" + start + "px)";
          peek.style.opacity = "0";
        }
      }
    }
    if (cur && !reducedMotion) {
      cur.style.transition =
        "transform " + ms + "ms ease-out, opacity " + ms + "ms ease-out";
      cur.style.transform =
        "translateX(" + endX + "px) rotate(" + rot + "deg)";
      cur.style.opacity = "0";
    }
    if (peek && !reducedMotion) {
      peek.style.transition =
        "transform " + ms + "ms ease-out, opacity " + ms + "ms ease-out";
      peek.style.transform = "translateX(0) rotate(0deg)";
      peek.style.opacity = "1";
    }
    swipeBusy = true;
    dismissHint();
    afterTransition(cur, ms, () => {
      resetPanelStyles();
      swipeBusy = false;
      if (dir < 0) goPrev();
      else goNext();
    });
  }

  function onPointerDown(e) {
    if (!currentWord || screenWord.hidden || swipeBusy) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (drag) return;
    drag = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      dx: 0,
      axis: null,
      lastX: e.clientX,
      lastT: performance.now(),
      vx: 0,
      started: false,
    };
  }

  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.axis) {
      if (Math.hypot(dx, dy) < AXIS_LOCK) return;
      drag.axis = Math.abs(dx) > Math.abs(dy) * 1.1 ? "x" : "y";
      if (drag.axis === "x") {
        drag.started = true;
        beginSwipeLayer();
      }
    }
    if (drag.axis !== "x") return;
    if (e.cancelable) e.preventDefault();
    let x = dx;
    // Rubber-band when there is no previous step
    if (step === 0 && x > 0) x *= RUBBER;
    drag.dx = x;
    const now = performance.now();
    const dt = now - drag.lastT;
    if (dt > 0) drag.vx = (e.clientX - drag.lastX) / dt;
    drag.lastX = e.clientX;
    drag.lastT = now;
    applyDragVisual(x);
  }

  function onPointerUp(e) {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    const session = drag;
    drag = null;
    if (!session.started || session.axis !== "x") return;
    const width = Math.max(1, (stepStage && stepStage.clientWidth) || 300);
    const threshold = Math.max(COMMIT_MIN, width * COMMIT_RATIO);
    const flickNext = session.vx <= -FLICK;
    const flickPrev = session.vx >= FLICK;
    const farNext = session.dx <= -threshold;
    const farPrev = session.dx >= threshold && step > 0;
    let dir = 0;
    if (flickNext || farNext) dir = 1;
    else if (flickPrev || farPrev) dir = -1;
    if (dir === -1 && step === 0) dir = 0;
    if (dir !== 0) {
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 400);
      commitSwipe(dir);
    } else {
      if (Math.abs(session.dx) > 6) {
        suppressClick = true;
        setTimeout(() => { suppressClick = false; }, 400);
      }
      springBack(session.dx);
    }
  }

  const swipeRoot = screenWord;
  swipeRoot.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove, { passive: false });
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
  swipeRoot.addEventListener(
    "click",
    (e) => {
      if (!suppressClick) return;
      e.preventDefault();
      e.stopPropagation();
      suppressClick = false;
    },
    true
  );

  // Service worker
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }

  buildGrid();
  showScreen(true);
})();
