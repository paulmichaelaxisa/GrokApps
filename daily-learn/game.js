/* Daily Learn v2: XP, levels and badges (localStorage). */
(function (global) {
  "use strict";
  var KEY = "daily-learn-game-v1";

  var XP = {
    cardRead: 3,        // text / reveal cards
    explainWatched: 5,  // animated explain card played to the end
    interactivePerfect: 10, interactiveOk: 5,  // match / order first try vs after retries
    swipeCorrect: 3,
    quizCorrect: 10, quizWrong: 2,
    sectionDone: 10,
    bossCorrect: 15, bossPerfectBonus: 25,
    topicDone: 20
  };

  // Remy's badge set (art in art/badge_<id>.svg + _locked)
  var BADGES = [
    { id: "first_lesson", name: "First Lesson", desc: "Finish your first lesson part" },
    { id: "perfect_quiz", name: "Perfect Quiz", desc: "Finish a part with no mistakes" },
    { id: "boss_slayer", name: "Boss Slayer", desc: "Pass a boss quiz (3 of 4 or better)" },
    { id: "topic_mastered", name: "Topic Mastered", desc: "Clear every node and ace the boss" },
    { id: "deep_diver", name: "Deep Diver", desc: "Watch 10 animated explainers" },
    { id: "level_10", name: "Level 10", desc: "Reach level 10" }
  ];
  var TITLES = ["New spark", "Curious mind", "Question asker", "Idea explorer", "Pattern spotter", "Deep thinker", "Bright spark", "Big-picture brain", "Knowledge keeper", "Lamplighter"];
  function titleFor(level) { return TITLES[Math.min(TITLES.length - 1, level - 1)]; }

  function need(level) { return 60 + 30 * (level - 1); }      // XP to go from level -> level+1
  function levelFor(xp) {
    var L = 1, rem = xp;
    while (rem >= need(L)) { rem -= need(L); L++; }
    return { level: L, into: rem, need: need(L), pct: rem / need(L) };
  }

  function load() {
    var s;
    try { s = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { s = {}; }
    if (!s || typeof s !== "object") s = {};
    s.xp = typeof s.xp === "number" && s.xp >= 0 ? s.xp : 0;
    s.badges = s.badges && typeof s.badges === "object" ? s.badges : {};
    ["topicsDone", "perfectBosses", "explainersWatched", "partsDone", "perfectParts", "bossesPassed", "topicsMastered"].forEach(function (k) { if (typeof s[k] !== "number") s[k] = 0; });
    return s;
  }
  var state = load();
  var listeners = [];
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
  function emit(type, data) { listeners.forEach(function (fn) { try { fn(type, data); } catch (e) {} }); }

  function addXp(amount, reason) {
    if (!amount) return null;
    var before = levelFor(state.xp).level;
    state.xp += amount;
    var after = levelFor(state.xp);
    save();
    emit("xp", { amount: amount, reason: reason, info: after });
    if (after.level > before) {
      emit("level", { level: after.level });
      checkBadges();
    }
    return after;
  }

  function earn(id) {
    if (state.badges[id]) return false;
    state.badges[id] = new Date().toISOString();
    save();
    var b = BADGES.filter(function (x) { return x.id === id; })[0];
    emit("badge", b);
    return true;
  }

  function checkBadges() {
    if (state.partsDone >= 1) earn("first_lesson");
    if (state.perfectParts >= 1) earn("perfect_quiz");
    if (state.bossesPassed >= 1) earn("boss_slayer");
    if (state.topicsMastered >= 1) earn("topic_mastered");
    if (state.explainersWatched >= 10) earn("deep_diver");
    if (levelFor(state.xp).level >= 10) earn("level_10");
  }

  function bump(counter, by, ctx) {
    state[counter] = (state[counter] || 0) + (by || 1);
    save();
    checkBadges(ctx);
  }

  global.DLGame = {
    XP: XP, BADGES: BADGES, levelFor: levelFor, titleFor: titleFor,
    get state() { return state; },
    addXp: addXp, bump: bump, checkBadges: checkBadges,
    on: function (fn) { listeners.push(fn); },
    reset: function () { state = { xp: 0, badges: {}, topicsDone: 0, perfectBosses: 0, explainersWatched: 0, partsDone: 0, perfectParts: 0, bossesPassed: 0, topicsMastered: 0 }; save(); }
  };
})(window);
