(function () {
  "use strict";

  var STORAGE_KEY = "daily-learn-v1";
  var API_KEY_STORAGE = "daily-learn-xai-key";
  var RECENT_TITLES_KEY = "daily-learn-recent-titles";
  var MAX_RECENT = 30;
  var TZ = "Australia/Sydney";

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function sydneyDateISO(d) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit"
    }).format(d || new Date());
  }

  function formatNiceDate(iso) {
    var p = iso.split("-").map(Number);
    var utc = new Date(Date.UTC(p[0], p[1] - 1, p[2], 12));
    return new Intl.DateTimeFormat("en-AU", {
      weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC"
    }).format(utc);
  }

  function loadState() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
    catch (e) { return {}; }
  }
  function saveState(state) { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  function defaultState() { return { streak: 0, lastCompletedDate: null, completedDates: {} }; }
  function ensureState() {
    var s = Object.assign(defaultState(), loadState());
    if (!s.completedDates) s.completedDates = {};
    return s;
  }

  function getApiKey() {
    try { return (localStorage.getItem(API_KEY_STORAGE) || "").trim();
    } catch (e) { return ""; }
  }
  function normalizeApiKey(raw) {
    var k = (raw || "").trim();
    // Strip wrapping quotes / accidental newlines from mobile paste
    if ((k.charAt(0) === '"' && k.charAt(k.length - 1) === '"') ||
        (k.charAt(0) === "'" && k.charAt(k.length - 1) === "'")) {
      k = k.slice(1, -1).trim();
    }
    k = k.replace(/\s+/g, "");
    return k;
  }

  function setApiKey(key) {
    try {
      if (key) localStorage.setItem(API_KEY_STORAGE, key);
      else localStorage.removeItem(API_KEY_STORAGE);
      return true;
    } catch (e) {
      return false;
    }
  }

  function getRecentTitles() {
    try {
      var arr = JSON.parse(localStorage.getItem(RECENT_TITLES_KEY) || "[]");
      return Array.isArray(arr) ? arr.filter(function (t) { return typeof t === "string"; }) : [];
    } catch (e) { return []; }
  }
  function rememberTitle(title) {
    if (!title) return;
    var list = getRecentTitles().filter(function (t) {
      return t.toLowerCase() !== title.toLowerCase();
    });
    list.unshift(title);
    if (list.length > MAX_RECENT) list = list.slice(0, MAX_RECENT);
    try { localStorage.setItem(RECENT_TITLES_KEY, JSON.stringify(list)); } catch (e) {}
  }

  function previousSydneyDate(iso) {
    var p = iso.split("-").map(Number);
    var dt = new Date(Date.UTC(p[0], p[1] - 1, p[2], 12));
    dt.setUTCDate(dt.getUTCDate() - 1);
    return dt.toISOString().slice(0, 10);
  }

  function recordCompletion(iso, score, total) {
    var state = ensureState();
    var already = !!state.completedDates[iso];
    state.completedDates[iso] = { score: score, total: total, finishedAt: new Date().toISOString() };
    if (!already) {
      if (state.lastCompletedDate === previousSydneyDate(iso)) state.streak = (state.streak || 0) + 1;
      else state.streak = 1;
      state.lastCompletedDate = iso;
    }
    saveState(state);
    return state;
  }

  function currentStreakDisplay(state, todayIso) {
    if (!state.lastCompletedDate) return 0;
    if (state.lastCompletedDate === todayIso) return state.streak || 0;
    if (state.lastCompletedDate === previousSydneyDate(todayIso)) return state.streak || 0;
    return 0;
  }

  function pickRandomCurated() {
    var topics = window.DAILY_LEARN_TOPICS || [];
    if (!topics.length) return null;
    var idx = Math.floor(Math.random() * topics.length);
    return topics[idx];
  }

  var runtime = {
    dateIso: sydneyDateISO(),
    topic: null,
    sectionIndex: 0,
    mode: "home",
    score: 0,
    answered: false,
    selectedChoice: null,
    source: "offline",
    loading: false,
    loadToken: 0
  };

  function showScreen(id) {
    $$(".screen").forEach(function (el) { el.classList.toggle("active", el.id === id); });
  }

  function setLoading(on) {
    runtime.loading = !!on;
    var banner = $("#offlineBanner");
    var loadingEl = $("#loadingState");
    var topicBlock = $("#topicBlock");
    var startBtn = $("#startBtn");
    var newBtn = $("#newTopicBtn");
    if (loadingEl) loadingEl.hidden = !on;
    if (topicBlock) topicBlock.hidden = !!on;
    if (startBtn) startBtn.disabled = !!on || !runtime.topic;
    if (newBtn) newBtn.disabled = !!on;
    if (on && banner) banner.hidden = true;
  }

  function showOfflineBanner(show, message) {
    var banner = $("#offlineBanner");
    if (!banner) return;
    if (message) banner.textContent = message;
    banner.hidden = !show;
  }

  function updateHomeChrome() {
    var store = ensureState();
    var streak = currentStreakDisplay(store, runtime.dateIso);
    var completedCount = Object.keys(store.completedDates).length;
    var doneToday = !!store.completedDates[runtime.dateIso];
    $("#dateLabel").textContent = formatNiceDate(runtime.dateIso);
    $("#streakChip").innerHTML = "\uD83D\uDD25 <strong>" + streak + "</strong> streak";
    $("#statStreak").textContent = String(streak);
    $("#statDone").textContent = String(completedCount);
    if (runtime.topic) {
      $("#topicEmoji").textContent = runtime.topic.emoji;
      $("#topicTitle").textContent = runtime.topic.title;
      $("#topicBlurb").textContent = runtime.topic.blurb;
      $("#startBtn").textContent = doneToday ? "Review lesson" : "Start lesson";
      $("#startBtn").disabled = false;
      var srcNote = runtime.source === "ai" ? "AI topic \u00b7 unique each open" : "Offline curated topic";
      $("#homeStatus").textContent = doneToday
        ? ("Completed today \u00b7 score " + store.completedDates[runtime.dateIso].score + "/" + store.completedDates[runtime.dateIso].total + " \u00b7 " + srcNote)
        : (srcNote + " \u00b7 finish a lesson to keep your streak");
    }
  }

  function renderHomeTopic() {
    updateHomeChrome();
    if (runtime.source === "offline") {
      showOfflineBanner(true, offlineBannerMessage(runtime.lastOfflineReason));
    } else {
      showOfflineBanner(false);
    }
    setLoading(false);
    showScreen("screen-home");
  }

  function offlineBannerMessage(reason) {
    if (reason === "no key") {
      return "No xAI key yet — open Settings (gear), paste your key, tap Save key.";
    }
    if (reason === "api failed") {
      return "AI call failed — check the key in Settings, or try New topic again.";
    }
    if (reason === "AI helper missing") {
      return "AI helper failed to load — hard-refresh the page and try again.";
    }
    if (reason === "storage blocked") {
      return "This browser blocked saving the key (private mode?). Try normal Chrome/Safari.";
    }
    return "Using offline curated topic.";
  }

  function useOfflineTopic(reason) {
    runtime.lastOfflineReason = reason || "offline";
    var topic = pickRandomCurated();
    if (!topic) {
      $("#topicEmoji").textContent = "\uD83D\uDCDA";
      $("#topicTitle").textContent = "No topics available";
      $("#topicBlurb").textContent = reason || "Add curated topics or an xAI key.";
      runtime.topic = null;
      setLoading(false);
      showOfflineBanner(true, offlineBannerMessage(reason));
      showScreen("screen-home");
      return;
    }
    runtime.topic = topic;
    runtime.source = "offline";
    rememberTitle(topic.title);
    renderHomeTopic();
  }

  function loadTopic(forceNew) {
    var token = ++runtime.loadToken;
    var key = getApiKey();
    showScreen("screen-home");
    setLoading(true);
    $("#loadingState").textContent = "Thinking up a new topic\u2026";
    showOfflineBanner(false);

    if (!key || !(window.DailyLearnAI && window.DailyLearnAI.generateTopic)) {
      useOfflineTopic(key ? "AI helper missing" : "no key");
      return;
    }

    window.DailyLearnAI.generateTopic({
      apiKey: key,
      avoidTitles: getRecentTitles()
    }).then(function (topic) {
      if (token !== runtime.loadToken) return;
      runtime.topic = topic;
      runtime.source = "ai";
      rememberTitle(topic.title);
      renderHomeTopic();
    }).catch(function (err) {
      if (token !== runtime.loadToken) return;
      console.warn("Daily Learn AI failed", err && err.message ? err.message : err);
      useOfflineTopic("api failed");
    });
  }

  function maskKeyStatus() {
    var key = getApiKey();
    var status = $("#keyStatus");
    var input = $("#apiKeyInput");
    if (!status) return;
    if (key) {
      var tail = key.length > 4 ? key.slice(-4) : "****";
      status.textContent = "Key set (\u2026" + tail + ")";
      status.classList.add("set");
      status.classList.remove("unset");
      if (input) input.placeholder = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
    } else {
      status.textContent = "Key not set";
      status.classList.add("unset");
      status.classList.remove("set");
      if (input) input.placeholder = "xai-\u2026 paste your key";
    }
  }

  function openSettings() {
    var panel = $("#settingsPanel");
    if (!panel) return;
    panel.hidden = false;
    panel.setAttribute("aria-hidden", "false");
    maskKeyStatus();
    var input = $("#apiKeyInput");
    if (input) input.value = "";
  }

  function closeSettings() {
    var panel = $("#settingsPanel");
    if (!panel) return;
    panel.hidden = true;
    panel.setAttribute("aria-hidden", "true");
  }

  function saveSettingsKey() {
    var input = $("#apiKeyInput");
    var status = $("#keyStatus");
    var val = normalizeApiKey(input ? input.value : "");
    if (!val) {
      if (status) {
        status.textContent = "Paste your xai-… key first, then tap Save key.";
        status.classList.add("unset");
        status.classList.remove("set");
      }
      if (input) input.focus();
      return;
    }
    if (!/^xai-/i.test(val)) {
      if (status) {
        status.textContent = "That doesn’t look like an xAI key (should start with xai-).";
        status.classList.add("unset");
        status.classList.remove("set");
      }
      return;
    }
    val = "xai-" + val.replace(/^xai-/i, "");

    if (!setApiKey(val)) {
      if (status) {
        status.textContent = "Couldn’t save — browser blocked storage (try non-private mode).";
        status.classList.add("unset");
        status.classList.remove("set");
      }
      return;
    }
    maskKeyStatus();
    if (input) input.value = "";
    closeSettings();
    loadTopic(true);
  }

  function clearSettingsKey() {
    setApiKey("");
    maskKeyStatus();
    var input = $("#apiKeyInput");
    if (input) input.value = "";
  }

  function renderProgress() {
    var total = runtime.topic.sections.length;
    var rail = $("#progressRail");
    rail.innerHTML = "";
    for (var i = 0; i < total; i++) {
      var seg = document.createElement("div");
      seg.className = "seg";
      if (i < runtime.sectionIndex) seg.classList.add("done");
      else if (i === runtime.sectionIndex) seg.classList.add(runtime.mode === "quiz" ? "done" : "active");
      if (runtime.mode === "done") seg.classList.add("done");
      seg.innerHTML = "<i></i>";
      rail.appendChild(seg);
    }
  }

  function renderLesson() {
    var sec = runtime.topic.sections[runtime.sectionIndex];
    var n = runtime.sectionIndex + 1;
    var total = runtime.topic.sections.length;
    runtime.mode = "lesson";
    runtime.answered = false;
    runtime.selectedChoice = null;
    $("#lessonTopic").textContent = runtime.topic.emoji + " " + runtime.topic.title;
    $("#lessonStep").textContent = "Section " + n + " of " + total;
    $("#lessonTitle").textContent = sec.title;
    $("#metaphorText").textContent = sec.metaphor;
    $("#explainText").textContent = sec.explanation;
    $("#exampleText").textContent = sec.example;
    renderProgress();
    showScreen("screen-lesson");
  }

  function renderQuiz() {
    var quiz = runtime.topic.sections[runtime.sectionIndex].quiz;
    runtime.mode = "quiz";
    runtime.answered = false;
    runtime.selectedChoice = null;
    $("#quizTopic").textContent = runtime.topic.emoji + " " + runtime.topic.title;
    $("#quizStep").textContent = "Quiz " + (runtime.sectionIndex + 1) + " of " + runtime.topic.sections.length;
    $("#quizQuestion").textContent = quiz.q;
    var box = $("#choices");
    box.innerHTML = "";
    quiz.choices.forEach(function (label, i) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice";
      btn.textContent = label;
      btn.addEventListener("click", function () { selectChoice(i); });
      box.appendChild(btn);
    });
    var fb = $("#feedback");
    fb.className = "feedback";
    fb.textContent = "";
    $("#checkBtn").disabled = true;
    $("#checkBtn").hidden = false;
    $("#nextBtn").hidden = true;
    renderProgress();
    showScreen("screen-quiz");
  }

  function selectChoice(i) {
    if (runtime.answered) return;
    runtime.selectedChoice = i;
    $$("#choices .choice").forEach(function (el, idx) {
      el.classList.toggle("selected", idx === i);
    });
    $("#checkBtn").disabled = false;
  }

  function checkAnswer() {
    if (runtime.selectedChoice == null || runtime.answered) return;
    runtime.answered = true;
    var quiz = runtime.topic.sections[runtime.sectionIndex].quiz;
    var correct = runtime.selectedChoice === quiz.correct;
    if (correct) runtime.score += 1;
    $$("#choices .choice").forEach(function (el, idx) {
      el.disabled = true;
      if (idx === quiz.correct) el.classList.add("correct");
      if (idx === runtime.selectedChoice && !correct) el.classList.add("wrong");
    });
    var fb = $("#feedback");
    fb.className = "feedback show " + (correct ? "ok" : "bad");
    fb.innerHTML = "<strong>" + (correct ? "Nice!" : "Not quite.") + "</strong> " + quiz.why;
    $("#checkBtn").hidden = true;
    var next = $("#nextBtn");
    next.hidden = false;
    var last = runtime.sectionIndex >= runtime.topic.sections.length - 1;
    next.textContent = last ? "See results" : "Next section";
  }

  function advance() {
    if (runtime.sectionIndex >= runtime.topic.sections.length - 1) finishDay();
    else { runtime.sectionIndex += 1; renderLesson(); }
  }

  function finishDay() {
    runtime.mode = "done";
    var total = runtime.topic.sections.length;
    var store = recordCompletion(runtime.dateIso, runtime.score, total);
    var streak = currentStreakDisplay(store, runtime.dateIso);
    $("#doneEmoji").textContent = runtime.score === total ? "\uD83C\uDFC6" : "\u2728";
    $("#doneTitle").textContent = runtime.score === total ? "Perfect!" : "Lesson complete!";
    $("#doneScore").textContent = runtime.score + " / " + total + " quizzes correct";
    $("#doneStreak").textContent = "\uD83D\uDD25 " + streak + "-day streak";
    $("#doneTopic").textContent = "You learned: " + runtime.topic.title;
    renderProgress();
    showScreen("screen-done");
    burstConfetti();
  }

  function burstConfetti() {
    var layer = $("#confetti");
    if (!layer) return;
    layer.innerHTML = "";
    var colors = ["#818cf8", "#a78bfa", "#34d399", "#fbbf24", "#fb7185"];
    for (var i = 0; i < 36; i++) {
      var bit = document.createElement("i");
      bit.style.left = Math.random() * 100 + "%";
      bit.style.background = colors[i % colors.length];
      bit.style.animationDuration = (1.4 + Math.random() * 1.4) + "s";
      bit.style.animationDelay = (Math.random() * 0.3) + "s";
      layer.appendChild(bit);
    }
    setTimeout(function () { layer.innerHTML = ""; }, 3200);
  }

  function startLesson() {
    if (!runtime.topic || runtime.loading) return;
    runtime.sectionIndex = 0;
    runtime.score = 0;
    runtime.answered = false;
    renderLesson();
  }

  function goHome() {
    updateHomeChrome();
    if (runtime.source === "offline") {
      showOfflineBanner(true, offlineBannerMessage(runtime.lastOfflineReason));
    } else {
      showOfflineBanner(false);
    }
    setLoading(false);
    showScreen("screen-home");
  }

  function bind() {
    $("#startBtn").addEventListener("click", startLesson);
    $("#toQuizBtn").addEventListener("click", renderQuiz);
    $("#checkBtn").addEventListener("click", checkAnswer);
    $("#nextBtn").addEventListener("click", advance);
    $("#backHomeBtn").addEventListener("click", goHome);
    $("#againBtn").addEventListener("click", startLesson);
    $("#homeFromLesson").addEventListener("click", goHome);
    var newBtn = $("#newTopicBtn");
    if (newBtn) newBtn.addEventListener("click", function () { loadTopic(true); });
    var gear = $("#settingsBtn");
    if (gear) gear.addEventListener("click", openSettings);
    var closeBtn = $("#settingsClose");
    if (closeBtn) closeBtn.addEventListener("click", closeSettings);
    var backdrop = $("#settingsBackdrop");
    if (backdrop) backdrop.addEventListener("click", closeSettings);
    var saveBtn = $("#settingsSave");
    if (saveBtn) saveBtn.addEventListener("click", saveSettingsKey);
    var clearBtn = $("#settingsClear");
    if (clearBtn) clearBtn.addEventListener("click", clearSettingsKey);
  }

  function registerSW() {
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol !== "http:" && location.protocol !== "https:") return;
    navigator.serviceWorker.register("./sw.js").catch(function () {});
  }

  function init() {
    if (!(window.DAILY_LEARN_TOPICS && window.DAILY_LEARN_TOPICS.length)) {
      setTimeout(init, 40);
      return;
    }
    bind();
    maskKeyStatus();
    registerSW();
    window.DailyLearn = {
      sydneyDateISO: sydneyDateISO,
      state: runtime,
      loadTopic: loadTopic,
      getApiKey: function () { return !!getApiKey(); }
    };
    loadTopic(false);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
