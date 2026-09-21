(function () {
  "use strict";
  var STORAGE_KEY = "daily-learn-v1";
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
  function hashDate(iso) {
    var h = 2166136261;
    for (var i = 0; i < iso.length; i++) {
      h ^= iso.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function topicForDate(iso) {
    var topics = window.DAILY_LEARN_TOPICS || [];
    if (!topics.length) return null;
    var idx = hashDate(iso) % topics.length;
    return { topic: topics[idx], index: idx };
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
  var runtime = {
    dateIso: sydneyDateISO(),
    topic: null,
    sectionIndex: 0,
    mode: "home",
    score: 0,
    answered: false,
    selectedChoice: null
  };
  function showScreen(id) {
    $$(".screen").forEach(function (el) { el.classList.toggle("active", el.id === id); });
  }
  function renderHome() {
    var found = topicForDate(runtime.dateIso);
    runtime.topic = found.topic;
    var store = ensureState();
    var doneToday = !!store.completedDates[runtime.dateIso];
    var streak = currentStreakDisplay(store, runtime.dateIso);
    var completedCount = Object.keys(store.completedDates).length;
    $("#dateLabel").textContent = formatNiceDate(runtime.dateIso);
    $("#streakChip").innerHTML = "🔥 <strong>" + streak + "</strong> streak";
    $("#topicEmoji").textContent = runtime.topic.emoji;
    $("#topicTitle").textContent = runtime.topic.title;
    $("#topicBlurb").textContent = runtime.topic.blurb;
    $("#statStreak").textContent = String(streak);
    $("#statDone").textContent = String(completedCount);
    $("#startBtn").textContent = doneToday ? "Review today's lesson" : "Start today's lesson";
    $("#homeStatus").textContent = doneToday
      ? ("Completed today · score " + store.completedDates[runtime.dateIso].score + "/" + store.completedDates[runtime.dateIso].total)
      : "One topic per day · Sydney calendar date";
    showScreen("screen-home");
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
    $("#doneEmoji").textContent = runtime.score === total ? "🏆" : "✨";
    $("#doneTitle").textContent = runtime.score === total ? "Perfect day!" : "Lesson complete!";
    $("#doneScore").textContent = runtime.score + " / " + total + " quizzes correct";
    $("#doneStreak").textContent = "🔥 " + streak + "-day streak";
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
    runtime.sectionIndex = 0;
    runtime.score = 0;
    runtime.answered = false;
    renderLesson();
  }
  function bind() {
    $("#startBtn").addEventListener("click", startLesson);
    $("#toQuizBtn").addEventListener("click", renderQuiz);
    $("#checkBtn").addEventListener("click", checkAnswer);
    $("#nextBtn").addEventListener("click", advance);
    $("#backHomeBtn").addEventListener("click", renderHome);
    $("#againBtn").addEventListener("click", startLesson);
    $("#homeFromLesson").addEventListener("click", renderHome);
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
    renderHome();
    registerSW();
    window.DailyLearn = {
      sydneyDateISO: sydneyDateISO,
      topicForDate: topicForDate,
      hashDate: hashDate,
      state: runtime
    };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
