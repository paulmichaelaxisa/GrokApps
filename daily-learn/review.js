/* Daily Learn 2.0.1: "Review later" list (Remy's handoff 2b·8, approved by Paul).
 * Wrong answers are saved; the boss quiz draws up to 40% of its questions from here;
 * an item clears after it is answered right twice. Stored locally only. */
(function (global) {
  "use strict";
  var KEY = "daily-learn-review-v1", CLEAR_AFTER = 2, MAX_ITEMS = 60, BOSS_SHARE = 0.4;
  var state = load();
  function load() {
    try { var v = JSON.parse(localStorage.getItem(KEY) || "null"); if (v && v.items) return v; } catch (e) {}
    return { items: {} };
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
  function hash(str) { var x = 5381; for (var i = 0; i < str.length; i++) x = ((x << 5) + x + str.charCodeAt(i)) | 0; return (x >>> 0).toString(36); }
  function itemId(topicId, card) { return topicId + ":" + hash(JSON.stringify(card)); }
  // Every review item is stored as a self-contained, boss-ready card (quiz or order).
  function toReviewCard(card, detail) {
    if (card.type === "quiz") return { type: "quiz", q: card.q, choices: card.choices.slice(), correct: card.correct, why: card.why || "" };
    if (card.type === "swipe" && detail && detail.statement) {
      var st = detail.statement;
      return { type: "quiz", q: "True or false: " + st.text, choices: ["True", "False"], correct: st.answer ? 0 : 1, why: st.why || "" };
    }
    if (card.type === "order") return { type: "order", prompt: card.prompt, steps: card.steps.slice(), why: card.why || "" };
    return null;
  }
  function list() { return Object.keys(state.items).map(function (k) { return state.items[k]; }).sort(function (a, b) { return a.added - b.added; }); }
  var api = {
    CLEAR_AFTER: CLEAR_AFTER,
    /** Save a wrongly-answered card. Returns the item (or null if the card type can't be reviewed). */
    add: function (topic, card, detail) {
      var rc = toReviewCard(card, detail); if (!rc) return null;
      var id = itemId(topic.id, rc);
      var it = state.items[id];
      if (it) { it.rights = 0; it.misses = (it.misses || 0) + 1; }
      else {
        it = state.items[id] = { id: id, topicId: topic.id, topicTitle: topic.title, card: rc, rights: 0, misses: 1, added: Date.now() };
        var all = list(); while (all.length > MAX_ITEMS) { delete state.items[all.shift().id]; }
      }
      save(); return it;
    },
    /** Record an answer to a review item (from the boss quiz). Clears it after CLEAR_AFTER right answers. */
    answer: function (id, correct) {
      var it = state.items[id]; if (!it) return null;
      if (correct) { it.rights = (it.rights || 0) + 1; if (it.rights >= CLEAR_AFTER) { delete state.items[id]; save(); return { cleared: true }; } }
      else it.rights = 0;
      save(); return { cleared: false, rights: it.rights };
    },
    /** Build a boss deck: review items first (up to 40%, this topic preferred), then the topic's own boss questions. */
    bossDeck: function (topic, boss) {
      var n = boss.length, take = Math.min(list().length, Math.max(1, Math.floor(n * BOSS_SHARE)));
      if (!list().length) return boss.slice();
      var mine = list().filter(function (i) { return i.topicId === topic.id; }), other = list().filter(function (i) { return i.topicId !== topic.id; });
      var picked = mine.concat(other).slice(0, take).map(function (i) { return Object.assign({}, i.card, { reviewId: i.id, reviewFrom: i.topicId === topic.id ? "" : i.topicTitle }); });
      return picked.concat(boss.slice(0, Math.max(1, n - picked.length)));
    },
    count: function () { return list().length; },
    list: list,
    reset: function () { state = { items: {} }; save(); }
  };
  global.DLReview = api;
})(window);
