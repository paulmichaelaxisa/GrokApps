/* Liam Words — toddler PWA prototype
   Auslan: open Signbank video only — no in-app tips or hand diagrams. */

(function () {
  "use strict";

  const { ART } = window.LIAM_ART;
  const { SIGNBANK_SEARCH, WORDS } = window.LIAM_WORDS;

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
    currentWord = w;
    step = 0;
    renderStep();
    showScreen(false);
  }

  function goHome() {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
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

    // Auslan — Signbank link only
    $("auslanWord").textContent = w.label;
    const link = $("signbankLink");
    link.href =
      w.signbankUrl || SIGNBANK_SEARCH + encodeURIComponent(w.label);
    link.setAttribute(
      "aria-label",
      `Watch Auslan Signbank video for ${w.label}`
    );

    prevBtn.disabled = step === 0;
    nextBtn.textContent = step === 2 ? "Done" : "Next";
  }

  function speakWord() {
    if (!currentWord || !window.speechSynthesis) {
      speakBtn.textContent = "Speech not available";
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(currentWord.speak);
    u.rate = 0.65;
    u.pitch = 1.05;
    u.lang = "en-AU";
    speakBtn.classList.add("speaking");
    const label = speakBtn.innerHTML;
    speakBtn.innerHTML =
      '<span class="speak-icon" aria-hidden="true">🔊</span> Speaking…';
    u.onend = u.onerror = () => {
      speakBtn.classList.remove("speaking");
      speakBtn.innerHTML = label;
    };
    window.speechSynthesis.speak(u);
  }

  // Events
  backBtn.addEventListener("click", goHome);
  prevBtn.addEventListener("click", () => {
    if (step > 0) {
      step -= 1;
      renderStep();
    }
  });
  nextBtn.addEventListener("click", () => {
    if (step < 2) {
      step += 1;
      renderStep();
    } else {
      goHome();
    }
  });
  speakBtn.addEventListener("click", speakWord);

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
        step += 1;
        renderStep();
      } else if (dx > 0 && step > 0) {
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
