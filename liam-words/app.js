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
    stopSpeech();
    currentWord = w;
    step = 0;
    renderStep();
    showScreen(false);
  }

  function goHome() {
    stopSpeech();
    stopSignVideo();
    currentWord = null;
    showScreen(true);
  }

  function renderStep() {
    if (!currentWord) return;
    const w = currentWord;

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
  prevBtn.addEventListener("click", () => {
    if (step > 0) {
      stopSpeech();
      step -= 1;
      renderStep();
    }
  });
  nextBtn.addEventListener("click", () => {
    if (step < 2) {
      stopSpeech();
      step += 1;
      renderStep();
    } else {
      goHome();
    }
  });
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

  // Swipe support (simple)
  let touchX = null;
  screenWord.addEventListener(
    "touchstart",
    (e) => {
      touchX = e.changedTouches[0].screenX;
    },
    { passive: true }
  );
  screenWord.addEventListener(
    "touchend",
    (e) => {
      if (touchX == null) return;
      const dx = e.changedTouches[0].screenX - touchX;
      touchX = null;
      if (Math.abs(dx) < 50) return;
      if (dx < 0 && step < 2) {
        stopSpeech();
        step += 1;
        renderStep();
      } else if (dx > 0 && step > 0) {
        stopSpeech();
        step -= 1;
        renderStep();
      }
    },
    { passive: true }
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
