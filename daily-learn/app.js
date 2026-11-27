/* Daily Learn v2 — gamified, animated lessons. */
(function () {
  "use strict";

  var STORAGE_KEY = "daily-learn-v1";            // streak store (unchanged)
  var API_KEY_STORAGE = "daily-learn-xai-key";
  var RECENT_TITLES_KEY = "daily-learn-recent-titles";
  var SESSION_V1 = "daily-learn-session-v1";
  var SESSION_KEY = "daily-learn-session-v2";
  var HISTORY_KEY = "daily-learn-history-v1";
  var MAX_RECENT = 30, MAX_HISTORY = 30;
  var TZ = "Australia/Sydney";
  var G = window.DLGame, C = window.DLCards;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function h(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  // ---------- dates / streak (unchanged rules) ----------
  function sydneyDateISO(d) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d || new Date());
  }
  function formatNiceDate(iso) {
    var p = iso.split("-").map(Number);
    return new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(p[0], p[1] - 1, p[2], 12)));
  }
  function previousSydneyDate(iso) {
    var p = iso.split("-").map(Number);
    var dt = new Date(Date.UTC(p[0], p[1] - 1, p[2], 12));
    dt.setUTCDate(dt.getUTCDate() - 1);
    return dt.toISOString().slice(0, 10);
  }
  function loadState() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch (e) { return {}; } }
  function ensureState() {
    var s = Object.assign({ streak: 0, lastCompletedDate: null, completedDates: {} }, loadState());
    if (!s.completedDates) s.completedDates = {};
    return s;
  }
  function recordCompletion(iso, score, total) {
    var state = ensureState();
    var already = !!state.completedDates[iso];
    state.completedDates[iso] = { score: score, total: total, finishedAt: new Date().toISOString() };
    if (!already) {
      state.streak = state.lastCompletedDate === previousSydneyDate(iso) ? (state.streak || 0) + 1 : 1;
      state.lastCompletedDate = iso;
    }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
    return state;
  }
  function currentStreak() {
    var s = ensureState(), today = sydneyDateISO();
    if (!s.lastCompletedDate) return 0;
    if (s.lastCompletedDate === today || s.lastCompletedDate === previousSydneyDate(today)) return s.streak || 0;
    return 0;
  }

  // ---------- key ----------
  function getBuiltInKey() { var c = window.DAILY_LEARN_CONFIG; return (c && typeof c.xaiKey === "string") ? c.xaiKey.trim() : ""; }
  function getStoredKey() { try { return (localStorage.getItem(API_KEY_STORAGE) || "").trim(); } catch (e) { return ""; } }
  function getApiKey() { return getStoredKey() || getBuiltInKey(); }
  function setApiKey(key) {
    try { if (key) localStorage.setItem(API_KEY_STORAGE, key); else localStorage.removeItem(API_KEY_STORAGE); return true; } catch (e) { return false; }
  }

  // ---------- history ----------
  function readJSON(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (e) { return d; } }
  function getRecentTitles() { var a = readJSON(RECENT_TITLES_KEY, []); return Array.isArray(a) ? a.filter(function (t) { return typeof t === "string"; }) : []; }
  function rememberTitle(title) {
    var list = getRecentTitles().filter(function (t) { return t.toLowerCase() !== title.toLowerCase(); });
    list.unshift(title);
    try { localStorage.setItem(RECENT_TITLES_KEY, JSON.stringify(list.slice(0, MAX_RECENT))); } catch (e) {}
  }
  function getHistory() { var a = readJSON(HISTORY_KEY, []); return Array.isArray(a) ? a : []; }
  function upsertHistory(topic, patch) {
    var list = getHistory(), entry = null;
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].title === topic.title) { entry = list.splice(i, 1)[0]; break; }
    entry = entry || { id: topic.id, title: topic.title, emoji: topic.emoji, source: topic.source, startedOn: sydneyDateISO(), completed: false };
    Object.keys(patch || {}).forEach(function (k) { entry[k] = patch[k]; });
    list.unshift(entry);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, MAX_HISTORY))); } catch (e) {}
  }
  function avoidTitles() {
    var seen = {}, out = [];
    getHistory().map(function (x) { return x && x.title; }).concat(getRecentTitles()).forEach(function (t) {
      if (t && !seen[t.toLowerCase()]) { seen[t.toLowerCase()] = 1; out.push(t); }
    });
    return out.slice(0, MAX_RECENT);
  }

  // ---------- offline topics ----------
  function offlinePool() {
    var v2 = (window.DL_V2_TOPICS || []).map(function (t) { var r = C.normalizeTopic(t); if (r.ok) { r.topic.source = "offline"; r.topic.animated = true; } return r.ok ? r.topic : null; }).filter(Boolean);
    var legacy = (window.DAILY_LEARN_TOPICS || []).map(function (t) { var r = C.normalizeTopic(t); if (r.ok) r.topic.source = "offline"; return r.ok ? r.topic : null; }).filter(Boolean);
    return { v2: v2, legacy: legacy };
  }
  function pickOffline() {
    var avoid = {};
    avoidTitles().forEach(function (t) { avoid[t.toLowerCase()] = 1; });
    var pool = offlinePool();
    var fresh = function (arr) { return arr.filter(function (t) { return !avoid[t.title.toLowerCase()]; }); };
    var cand = fresh(pool.v2);
    if (!cand.length) cand = fresh(pool.legacy);
    if (!cand.length) cand = pool.v2.concat(pool.legacy);
    return cand.length ? cand[Math.floor(Math.random() * cand.length)] : null;
  }

  // ---------- session ----------
  var S = null; // { topic, node, card, cards:{}, nodeDone:[], topicXp, startedOn, finished, mode, replay }
  function newSession(topic) {
    S = { v: 2, topic: topic, node: 0, card: 0, cards: {}, nodeDone: topic.sections.map(function () { return false; }).concat([false]),
      topicXp: 0, startedOn: sydneyDateISO(), finished: false, mode: "map", replay: false, bossScore: 0 };
    rememberTitle(topic.title);
    upsertHistory(topic, {});
    saveSession();
  }
  function saveSession() { if (S) try { localStorage.setItem(SESSION_KEY, JSON.stringify(S)); } catch (e) {} }
  function loadSession() {
    var s = readJSON(SESSION_KEY, null);
    if (s && s.topic) {
      var r = C.normalizeTopic(s.topic);
      if (r.ok) {
        r.topic.source = s.topic.source; r.topic.animated = s.topic.animated;
        s.topic = r.topic;
        var n = r.topic.sections.length + 1;
        if (!Array.isArray(s.nodeDone) || s.nodeDone.length !== n) s.nodeDone = new Array(n).fill(false);
        if (!(s.node >= 0 && s.node < n)) s.node = 0;
        if (typeof s.card !== "number" || s.card < 0) s.card = 0;
        s.cards = s.cards && typeof s.cards === "object" ? s.cards : {};
        return s;
      }
    }
    // migrate a v1.1 saved lesson (legacy topic shape)
    var old = readJSON(SESSION_V1, null);
    if (old && old.topic) {
      var r1 = C.normalizeTopic(old.topic);
      if (r1.ok) {
        r1.topic.source = old.source === "ai" ? "ai" : "offline";
        var sess = { v: 2, topic: r1.topic, node: 0, card: 0, cards: {}, nodeDone: new Array(r1.topic.sections.length + 1).fill(false),
          topicXp: 0, startedOn: old.startedOn || sydneyDateISO(), finished: false, mode: "map", replay: false, bossScore: 0 };
        var done = old.mode === "done" ? r1.topic.sections.length : Math.min(old.sectionIndex || 0, r1.topic.sections.length);
        for (var i = 0; i < done; i++) sess.nodeDone[i] = true;
        sess.node = Math.min(done, r1.topic.sections.length);
        if (old.mode === "done") { sess.nodeDone[sess.nodeDone.length - 1] = true; sess.finished = true; }
        try { localStorage.removeItem(SESSION_V1); } catch (e) {}
        return sess;
      }
    }
    return null;
  }

  function nodeCount() { return S.topic.sections.length + 1; }
  function isBoss(n) { return n === S.topic.sections.length; }
  function nodeCards(n) { return isBoss(n) ? (S.bossDeck || S.topic.boss) : S.topic.sections[n].cards; }
  // Boss deck = up to 40% Review-later items + the topic's own boss questions. Built once per boss attempt, saved in the session.
  function buildBossDeck() { S.bossDeck = window.DLReview ? window.DLReview.bossDeck(S.topic, S.topic.boss) : S.topic.boss.slice(); }
  function unlocked(n) { return n === 0 || S.nodeDone[n - 1]; }
  function currentNode() { for (var i = 0; i < nodeCount(); i++) if (!S.nodeDone[i]) return i; return nodeCount() - 1; }

  // ---------- UI: chrome ----------
  function showScreen(id) { $$(".screen").forEach(function (el) { el.classList.toggle("active", el.id === id); }); document.body.setAttribute("data-screen", id); window.scrollTo(0, 0); }
  function renderXp(animate) {
    var info = G.levelFor(G.state.xp);
    $("#levelNum").textContent = info.level;
    $("#levelName").textContent = "\u00b7 " + G.titleFor(info.level);
    $("#xpLv").textContent = info.level;
    $("#xpFill").style.width = Math.max(0, Math.min(100, info.pct * 100)) + "%";
    $("#xpText").innerHTML = "<b>" + info.into + "</b> / " + info.need + " XP";
    var left = info.need - info.into;
    $("#xpHint").textContent = left + " XP to Level " + (info.level + 1) + " \u00b7 about " + Math.max(1, Math.ceil(left / 35)) + " part" + (left > 35 ? "s" : "");
    $("#xpBar").classList.toggle("full", info.pct >= 0.98);
    if (animate) { var b = $("#xpBar"); b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump"); }
  }
  function isDark() { return document.documentElement.getAttribute("data-theme") === "dark"; }
  function applyTheme() {
    var t = "auto";
    try { t = localStorage.getItem("daily-learn-theme") || "auto"; } catch (e) {}
    var eff = t === "auto" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : t;
    document.documentElement.setAttribute("data-theme", eff);
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute("content", eff === "dark" ? "#11121A" : "#F6F4EF");
  }
  function lumi(img, pose) {
    var T = window.DL_THEME || {};
    if (!img) return;
    if (!T.lumi || !T.mascot || !T.mascot[pose]) { img.hidden = true; return; }
    img.src = T.mascot[pose]; img.hidden = false;
  }

  function toast(text, cls) {
    var t = h("div", "toast " + (cls || ""), text);
    var host = $("#toasts");
    while (host.children.length >= 2) host.removeChild(host.firstChild);
    host.appendChild(t);
    setTimeout(function () { t.classList.add("out"); }, 1500);
    setTimeout(function () { t.remove(); }, 2100);
  }
  function xpPop(text) {
    var host = $("#xpPops"), t = h("span", "xp-pop", text + " XP");
    host.appendChild(t);
    setTimeout(function () { t.remove(); }, 1300);
  }
  var levelQueue = [];
  function showLevelUp(level, settled) {
    // XP lands just before the feedback sheet opens: give the sheet a beat, then wait for it to be dismissed
    if (!settled) { setTimeout(function () { showLevelUp(level, true); }, 80); return; }
    if (window.DLSheet && window.DLSheet.open) { setTimeout(function () { showLevelUp(level, true); }, 350); return; }
    var ov = $("#levelUp"), T = (window.DL_THEME || {}).levelUpSheet;
    $("#levelUpNum").textContent = level;
    $("#levelUpNum2").textContent = level;
    $("#luSub").textContent = "You're a " + G.titleFor(level) + " now.";
    $("#luXp").textContent = G.state.xp;
    $("#luParts").textContent = G.state.partsDone || 0;
    $("#luBadges").textContent = Object.keys(G.state.badges).length;
    lumi($("#luLumi"), "cheer");
    var burst = $("#luBurst");
    ov.hidden = false;
    ov.classList.remove("show"); void ov.offsetWidth; ov.classList.add("show");
    clearInterval(burst._t);
    if (!T) return;
    var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { burst.style.backgroundImage = "url(" + T.still + ")"; burst.style.backgroundSize = "contain"; burst.style.backgroundPosition = "center"; return; }
    burst.style.backgroundImage = "url(" + T.src + ")";
    burst.style.backgroundSize = (T.cols * 100) + "% " + (T.rows * 100) + "%";
    var f = 0;
    var frame = function () {
      var c = f % T.cols, r = Math.floor(f / T.cols);
      burst.style.backgroundPosition = (c * 100 / (T.cols - 1)) + "% " + (r * 100 / (T.rows - 1)) + "%";
      f++;
      if (f >= T.frames) clearInterval(burst._t); // hold the last (glow) frame
    };
    frame();
    burst._t = setInterval(frame, 1000 / T.fps);
    try { if (navigator.vibrate) setTimeout(function () { navigator.vibrate(18); }, 300); } catch (e) {}
  }

  function badgeArt(b, earned) {
    var T = window.DL_THEME;
    if (T && T.badge) { var img = h("img", "badge-img"); img.src = T.badge(b.id, earned, isDark()); img.alt = ""; return img; }
    return h("span", "badge-emoji", "\uD83C\uDFC5");
  }

  function renderReview() {
    var box = $("#reviewCard"); if (!box || !window.DLReview) return;
    var n = window.DLReview.count();
    box.hidden = n === 0;
    $("#reviewCount").textContent = n + (n === 1 ? " question" : " questions");
    $("#reviewText").textContent = "Saved from wrong answers. Up to 40% of your next boss quiz comes from here; each one clears after " + window.DLReview.CLEAR_AFTER + " right answers.";
    var ul = $("#reviewList"); ul.innerHTML = "";
    window.DLReview.list().slice(-5).reverse().forEach(function (it) {
      var q = it.card.type === "order" ? it.card.prompt : it.card.q;
      var li = h("li", null, q);
      if (it.rights) li.appendChild(h("span", "meta", " \u00b7 " + it.rights + " of " + window.DLReview.CLEAR_AFTER + " right"));
      ul.appendChild(li);
    });
  }
  function renderBadges() {
    renderReview();
    var box = $("#badges");
    box.innerHTML = "";
    G.BADGES.forEach(function (b) {
      var earned = !!G.state.badges[b.id];
      var el = h("div", "badge" + (earned ? " earned" : ""));
      el.title = b.desc;
      el.appendChild(badgeArt(b, earned));
      el.appendChild(h("span", "badge-name", b.name));
      el.appendChild(h("span", "badge-desc", b.desc));
      box.appendChild(el);
    });
    $("#badgeCount").textContent = Object.keys(G.state.badges).length + " of " + G.BADGES.length + " earned";
  }

  // ---------- map ----------
  function renderMap(highlight) {
    renderXp(false);
    var home = $("#homeTopic");
    if (!S) { home.hidden = true; $("#loadingState").hidden = false; return; }
    home.hidden = false;
    var n = nodeCount(), cur = currentNode(), doneCount = S.nodeDone.filter(Boolean).length;
    $("#topicEyebrow").textContent = formatNiceDate(sydneyDateISO()) + (currentStreak() > 1 ? " \u00b7 " + currentStreak() + "-day streak" : "");
    $("#topicTitle").textContent = S.topic.title;
    $("#topicEmoji").textContent = S.topic.emoji;
    $("#topicBlurb").textContent = S.topic.blurb;
    $("#topicCount").textContent = doneCount + " / " + n + " done";
    $("#topicSource").textContent = (S.topic.source === "ai" ? "\u00b7 Made by Grok" : (S.topic.animated ? "\u00b7 Offline animated lesson" : "\u00b7 Offline lesson")) + (S.restored ? " \u00b7 saved from last time" : "");
    var map = $("#pathMap");
    map.innerHTML = "";
    var W = map.clientWidth || 358, cx = W / 2, rowH = 104, top = 58, dark = isDark();
    var pts = [];
    for (var i = 0; i < n; i++) pts.push([cx + (i % 2 === 0 ? -1 : 1) * Math.min(56, W * 0.15), top + i * rowH]);
    var H = top + (n - 1) * rowH + 70;
    map.style.height = H + "px";
    // trail (Catmull-Rom through node centres)
    var NS = "http://www.w3.org/2000/svg", svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "trail"); svg.setAttribute("width", W); svg.setAttribute("height", H);
    function seg(a, b, c, d) {
      return " C" + (b[0] + (c[0] - a[0]) / 6) + " " + (b[1] + (c[1] - a[1]) / 6) + " " + (c[0] - (d[0] - b[0]) / 6) + " " + (c[1] - (d[1] - b[1]) / 6) + " " + c[0] + " " + c[1];
    }
    function pathThrough(from, to) {
      var d = "M" + pts[from][0] + " " + pts[from][1];
      for (var k = from; k < to; k++) d += seg(pts[Math.max(0, k - 1)], pts[k], pts[k + 1], pts[Math.min(n - 1, k + 2)]);
      return d;
    }
    var lastDone = -1; for (var q = 0; q < n; q++) if (S.nodeDone[q]) lastDone = q;
    var todo = document.createElementNS(NS, "path"); todo.setAttribute("d", pathThrough(0, n - 1)); todo.setAttribute("class", "trail-todo"); svg.appendChild(todo);
    var reach = Math.min(n - 1, lastDone + 1);
    if (reach > 0) { var dn = document.createElementNS(NS, "path"); dn.setAttribute("d", pathThrough(0, reach)); dn.setAttribute("class", "trail-done"); svg.appendChild(dn); }
    map.appendChild(svg);
    for (var j = 0; j < n; j++) {
      var boss = isBoss(j), done = S.nodeDone[j], open = unlocked(j);
      var state = boss ? (open ? "boss" : "boss_locked") : (done ? "done" : (open ? "current" : "locked"));
      if (boss && done) state = "boss";
      var btn = h("button", "node node-" + (done ? "done" : (open ? "current" : "locked")) + (boss ? " node-boss" : ""));
      btn.type = "button"; btn.dataset.n = j;
      btn.style.left = pts[j][0] + "px"; btn.style.top = pts[j][1] + "px";
      btn.setAttribute("aria-label", (boss ? "Boss quiz" : "Part " + (j + 1) + ": " + S.topic.sections[j].title) + (done ? ", done" : (open ? "" : ", locked")));
      var T = window.DL_THEME;
      if (T && T.node) { var img = h("img", "node-art"); img.src = T.node(state, dark); img.alt = ""; btn.appendChild(img); }
      if (boss && done) btn.appendChild(h("span", "node-check", "\u2713"));
      if (highlight === j) btn.classList.add("just-done");
      map.appendChild(btn);
      var isCur = j === cur && !S.finished;
      var side = pts[j][0] < cx ? "right" : "left";
      if (isCur) {
        var bub = h("div", "bubble bubble-" + side);
        bub.style.top = pts[j][1] + "px";
        if (side === "right") bub.style.left = (pts[j][0] + 50) + "px"; else bub.style.right = (W - pts[j][0] + 50) + "px";
        var cards = nodeCards(j), xpEst = boss ? (cards.length * G.XP.bossCorrect + G.XP.topicDone) : (G.XP.sectionDone + cards.length * 7);
        bub.appendChild(h("p", "eyebrow", boss ? "Boss quiz \u00b7 " + cards.length + " questions" : "Part " + (j + 1) + " \u00b7 " + cards.length + " cards" + (cards.some(function (c) { return c.type === "explain"; }) ? " \u00b7 animated" : "")));
        bub.appendChild(h("strong", null, boss ? "Beat the boss to finish the topic" : S.topic.sections[j].title));
        var go = h("button", "btn btn-primary btn-sm", (S.node === j && S.card > 0 ? "Continue" : "Start") + " \u00b7 +" + xpEst + " XP");
        go.type = "button"; go.id = "bubbleGo"; go.dataset.n = j;
        bub.appendChild(go);
        map.appendChild(bub);
        var lu = h("img", "lumi map-lumi"); lu.alt = "";
        lu.style.top = (pts[j][1] - 30) + "px";
        if (side === "right") lu.style.left = Math.max(0, pts[j][0] - 120) + "px"; else lu.style.left = Math.min(W - 70, pts[j][0] + 56) + "px";
        lumi(lu, "idle");
        if (!lu.hidden) map.appendChild(lu);
      } else {
        var lab = h("div", "node-label node-label-" + side);
        lab.style.top = pts[j][1] + "px";
        if (side === "right") lab.style.left = (pts[j][0] + 50) + "px"; else lab.style.right = (W - pts[j][0] + 50) + "px";
        lab.appendChild(h("strong", null, boss ? "Boss quiz" : S.topic.sections[j].title));
        var rvN = boss && window.DLReview ? Math.min(window.DLReview.count(), Math.max(1, Math.floor(S.topic.boss.length * 0.4))) : 0;
        if (rvN && !done) lab.appendChild(h("span", "review-hint", rvN + " from Review later"));
        lab.appendChild(h("span", null, boss ? nodeCards(j).length + " questions \u00b7 +" + (nodeCards(j).length * G.XP.bossCorrect + G.XP.topicDone) + " XP" : (done ? "Done \u00b7 tap to replay" : nodeCards(j).length + " cards")));
        map.appendChild(lab);
      }
    }
    var main = $("#startBtn");
    main.hidden = !S.finished;
    main.textContent = "Replay the boss quiz";
    renderBadges();
    renderHistory();
  }

  function pathSeg(leftToRight, done, toBoss) {
    var NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 100 30"); svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("class", "path-seg" + (done ? " done" : ""));
    var a = 18, b = toBoss ? 49.5 : 48;
    if (!leftToRight) { a = 48; b = toBoss ? 19.5 : 18; }
    var path = document.createElementNS(NS, "path");
    path.setAttribute("d", "M" + a + " 0 C" + a + " 18 " + b + " 12 " + b + " 30");
    path.setAttribute("vector-effect", "non-scaling-stroke");
    svg.appendChild(path);
    return svg;
  }
  function cardTypesNote(cards) {
    var hasAnim = cards.some(function (c) { return c.type === "explain"; });
    return hasAnim ? " \u00b7 \uD83C\uDFAC" : "";
  }
  function renderHistory() {
    var list = $("#historyList"), items = getHistory().filter(function (x) { return x && (!S || x.title !== S.topic.title); }).slice(0, 5);
    list.innerHTML = "";
    $("#historyBlock").hidden = !items.length;
    items.forEach(function (x) {
      list.appendChild(h("li", null, (x.emoji || "\u2022") + " " + x.title + (x.completed ? " \u00b7 \u2713" + (x.score != null ? " " + x.score + "/" + x.total : "") : "")));
    });
  }

  // ---------- play ----------
  var active = null; // card api
  var footOverride = null; // a card can take over the bottom button (Reveal / Next step / Check)
  function cardKey(n, c) { return n + "-" + c; }
  function enterNode(n) {
    if (!unlocked(n)) return;
    if (S.nodeDone[n] || (S.finished && isBoss(n))) {
      // replay a finished node: no XP for repeats
      Object.keys(S.cards).forEach(function (k) { if (k.indexOf(n + "-") === 0) delete S.cards[k]; });
      S.replay = true; S.card = 0;
      if (isBoss(n)) { S.bossScore = 0; buildBossDeck(); }
    } else if (S.node !== n) { S.card = 0; S.replay = false; }
    if (isBoss(n) && !S.bossDeck) buildBossDeck();
    S.node = n; S.mode = "play";
    saveSession();
    renderCard();
    showScreen("screen-play");
  }
  function renderCard() {
    if (active && active.destroy) active.destroy();
    var n = S.node, cards = nodeCards(n), idx = Math.min(S.card, cards.length - 1), card = cards[idx];
    S.card = idx;
    var boss = isBoss(n);
    var TYPE_NAME = { explain: "Explainer", reveal: "Tap to reveal", text: "Read", match: "Match", swipe: "True or false", order: "Put in order", quiz: "Quick check" };
    $("#playTitle").textContent = (boss ? "Boss quiz \u00b7 Q" + (idx + 1) + " of " + cards.length : "Part " + (n + 1) + " \u00b7 " + S.topic.sections[n].title + " \u00b7 " + TYPE_NAME[card.type]);
    $("#playTopic").textContent = S.topic.title;
    $("#playXp").textContent = "+" + (S.topicXp || 0) + " XP";
    var prog = $("#playProgress");
    prog.innerHTML = "";
    cards.forEach(function (_, i) {
      var seg = h("i");
      if (i < idx || (S.cards[cardKey(n, i)] || {}).done) seg.className = "done";
      if (i === idx) seg.className += " cur";
      prog.appendChild(seg);
    });
    var saved = S.cards[cardKey(n, idx)] || null;
    var next = $("#nextCardBtn");
    var defLabel = idx === cards.length - 1 ? (boss ? "Finish boss" : "Finish part") : "Continue";
    var cardDone = !!(saved && saved.done);
    footOverride = null;
    function setFoot(o) {
      footOverride = o && o.onClick ? o : null;
      next.classList.toggle("btn-outline", !!(o && o.style === "outline"));
      if (o) { next.textContent = o.label; next.disabled = !o.enabled; }
      else { next.textContent = defLabel; next.disabled = !cardDone; }
    }
    setFoot(null);
    var host = $("#cardHost");
    host.classList.remove("card-enter"); void host.offsetWidth; host.classList.add("card-enter");
    active = C.render(card, host, {
      mode: boss ? "boss" : "lesson",
      saved: saved,
      setFoot: setFoot,
      advance: function () { if (S.node === n && S.card === idx && $("#screen-play").classList.contains("active")) nextCard(); },
      // wrong answer -> Review later (not during replays of finished nodes)
      missed: function (c, detail) {
        if (!window.DLReview || S.replay) return null;
        if (c.reviewId) return { id: c.reviewId }; // already on the list; reviewAnswer() resets its count
        var it = window.DLReview.add(S.topic, c, detail); renderReview(); return it;
      },
      reviewAnswer: function (id, ok) { if (window.DLReview && !S.replay) { var r = window.DLReview.answer(id, ok); if (r && r.cleared) toast("Cleared from Review later"); } },
      complete: function (result) {
        var k = cardKey(n, idx);
        if (S.cards[k] && S.cards[k].done) return;
        S.cards[k] = { done: true, result: result };
        if (boss && result.correct) S.bossScore = (S.bossScore || 0) + 1;
        if (!S.replay && result.xp) award(result.xp, card.type);
        saveSession();
        cardDone = true;
        if (!footOverride) next.disabled = false;
        var segs = prog.children; if (segs[idx]) segs[idx].className = "done cur";
      }
    });
  }
  function award(xp, reason) {
    S.topicXp = (S.topicXp || 0) + xp;
    var chip = $("#playXp");
    if (chip) { chip.textContent = "+" + S.topicXp + " XP"; chip.classList.remove("bump"); void chip.offsetWidth; chip.classList.add("bump"); }
    G.addXp(xp, reason);
  }
  function nextCard() {
    var cards = nodeCards(S.node);
    if (S.card < cards.length - 1) { S.card++; saveSession(); renderCard(); return; }
    finishNode();
  }
  function finishNode() {
    var n = S.node, wasDone = S.nodeDone[n], replay = S.replay;
    S.nodeDone[n] = true; S.card = 0; S.mode = "map"; S.replay = false;
    if (active && active.destroy) active.destroy();
    if (isBoss(n)) { finishTopic(wasDone || replay); return; }
    if (!wasDone && !replay) {
      var cards = nodeCards(n), perfectPart = true;
      cards.forEach(function (_, i) { var r = (S.cards[cardKey(n, i)] || {}).result || {}; if (r.perfect === false || r.correct === false) perfectPart = false; });
      award(G.XP.sectionDone, "section");
      G.bump("partsDone", 1);
      if (perfectPart) G.bump("perfectParts", 1);
      toast("Part " + (n + 1) + " complete \u00b7 +" + G.XP.sectionDone + " XP" + (perfectPart ? " \u00b7 no mistakes!" : ""), "big");
    }
    S.node = currentNode();
    saveSession();
    renderMap(n);
    showScreen("screen-home");
  }
  function finishTopic(repeat) {
    var total = nodeCards(S.topic.sections.length).length, score = S.bossScore || 0, perfect = score === total;
    collectingBadges = [];
    if (!repeat) {
      if (perfect) { award(G.XP.bossPerfectBonus, "perfect boss"); G.bump("perfectBosses", 1); G.bump("topicsMastered", 1); }
      if (score >= Math.ceil(total * 0.75)) G.bump("bossesPassed", 1);
      award(G.XP.topicDone, "topic");
      recordCompletion(sydneyDateISO(), score, total);
      G.bump("topicsDone", 1);
      upsertHistory(S.topic, { completed: true, score: score, total: total, completedOn: sydneyDateISO() });
    }
    renderXp(false);
    S.finished = true; S.node = nodeCount() - 1;
    saveSession();
    $("#doneEmoji").textContent = "";
    $("#doneTitle").textContent = perfect ? "Flawless victory!" : "Topic complete!";
    $("#doneTopic").textContent = "You learned: " + S.topic.title;
    $("#doneScore").textContent = score + " / " + total;
    $("#doneXp").textContent = "+" + (S.topicXp || 0);
    $("#doneStreak").textContent = String(currentStreak());
    lumi($("#doneLumi"), "cheer");
    var nb = $("#doneBadges");
    nb.innerHTML = "";
    setTimeout(function () {
      collectingBadges.forEach(function (b) {
        var el = h("div", "badge earned pop");
        el.appendChild(badgeArt(b, true)); el.appendChild(h("span", "badge-name", b.name));
        nb.appendChild(el);
      });
      $("#doneBadgesWrap").hidden = !collectingBadges.length;
      collectingBadges = null;
    }, 30);
    showScreen("screen-done");
    confetti();
  }
  var collectingBadges = null;

  function confetti() {
    var layer = $("#confetti");
    if (!layer || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    layer.innerHTML = "";
    var colors = ["#5B4FE0", "#8B83FF", "#1F9E90", "#F2B630", "#E07A5F"];
    for (var i = 0; i < 40; i++) {
      var bit = h("i");
      bit.style.left = Math.random() * 100 + "%";
      bit.style.background = colors[i % colors.length];
      bit.style.animationDuration = (1.4 + Math.random() * 1.4) + "s";
      bit.style.animationDelay = (Math.random() * 0.3) + "s";
      layer.appendChild(bit);
    }
    setTimeout(function () { layer.innerHTML = ""; }, 3200);
  }

  // ---------- topic loading ----------
  var loadToken = 0;
  function setLoading(on, msg) {
    $("#loadingState").hidden = !on;
    $("#homeTopic").hidden = !!on;
    if (msg) $("#loadingMsg").textContent = msg;
    $("#newTopicBtn").disabled = !!on;
    $("#offlineNowBtn").hidden = true;
    if (on) setTimeout(function () { if (!$("#loadingState").hidden) $("#offlineNowBtn").hidden = false; }, 6000);
  }
  function showBanner(text) { var b = $("#offlineBanner"); b.textContent = text || ""; b.hidden = !text; }
  function loadTopic(subject) {
    var token = ++loadToken, key = getApiKey();
    showScreen("screen-home");
    showBanner("");
    if (!key || !window.DailyLearnAI) { useOffline("No xAI key available \u2014 using an offline lesson."); return; }
    setLoading(true, subject ? "Building a lesson about \u201C" + subject + "\u201D\u2026" : "Dreaming up a fresh lesson\u2026");
    $("#loadingProgress").textContent = "Grok usually takes 15\u201330 seconds.";
    window.DailyLearnAI.generateTopic({ apiKey: key, avoidTitles: avoidTitles(), subject: subject, onProgress: function (p) {
      if (token !== loadToken) return;
      $("#loadingProgress").textContent = p.chars ? "Writing cards and animations\u2026 " + Math.min(99, Math.round(p.chars / 55)) + "%" : "Thinking\u2026";
    } }).then(function (topic) {
      if (token !== loadToken) return;
      if (topic.warnings) console.info("Daily Learn: AI topic repaired", topic.warnings);
      newSession(topic);
      setLoading(false);
      renderMap();
    }).catch(function (err) {
      if (token !== loadToken) return;
      console.warn("Daily Learn AI failed", err && err.message);
      useOffline("Couldn\u2019t reach Grok (" + (navigator.onLine === false ? "offline" : "AI error") + ") \u2014 here\u2019s an offline lesson. Tap New topic to try again.");
    });
  }
  function useOffline(msg) {
    ++loadToken;
    var t = pickOffline();
    setLoading(false);
    if (!t) { showBanner("No lessons available."); return; }
    newSession(t);
    showBanner(msg || "");
    renderMap();
  }

  // ---------- settings ----------
  function maskKeyStatus() {
    var key = getApiKey(), status = $("#keyStatus");
    if (!status) return;
    if (key) {
      status.textContent = (getStoredKey() ? "Custom key set (\u2026" : "Built-in key in use (\u2026") + key.slice(-4) + ")";
      status.className = "key-status set";
    } else { status.textContent = "Key not set"; status.className = "key-status unset"; }
  }
  function openSettings() {
    var p = $("#settingsPanel"); p.hidden = false; maskKeyStatus(); $("#apiKeyInput").value = "";
    try { $("#autoplayToggle").checked = localStorage.getItem("daily-learn-autoplay") === "1"; $("#themeSelect").value = localStorage.getItem("daily-learn-theme") || "auto"; } catch (e) {}
  }
  function closeSettings() { $("#settingsPanel").hidden = true; }
  function saveSettingsKey() {
    var input = $("#apiKeyInput"), status = $("#keyStatus");
    var val = (input.value || "").trim().replace(/^["']|["']$/g, "").replace(/\s+/g, "");
    if (!/^xai-/i.test(val)) { status.textContent = "That doesn\u2019t look like an xAI key (should start with xai-)."; status.className = "key-status unset"; return; }
    if (!setApiKey("xai-" + val.replace(/^xai-/i, ""))) { status.textContent = "Couldn\u2019t save on this device."; return; }
    input.value = ""; maskKeyStatus(); closeSettings();
  }

  // ---------- events ----------
  function bind() {
    $("#startBtn").addEventListener("click", function () {
      if (!S) return;
      if (S.finished) { enterNode(nodeCount() - 1); return; }
      enterNode(S.mode === "play" || S.card > 0 ? S.node : currentNode());
    });
    $("#pathMap").addEventListener("click", function (e) {
      var b = e.target.closest(".node, #bubbleGo"); if (!b) return;
      var n = +b.dataset.n;
      if (!unlocked(n)) {
        b.classList.remove("nudge"); void b.offsetWidth; b.classList.add("nudge");
        toast("Finish " + (n === 1 ? "Part 1" : (isBoss(n) ? "every part" : "Part " + n)) + " first");
        return;
      }
      if (n !== S.node) S.card = 0;
      enterNode(n);
    });
    $("#autoplayToggle").addEventListener("change", function (e) { try { localStorage.setItem("daily-learn-autoplay", e.target.checked ? "1" : "0"); } catch (er) {} });
    $("#themeSelect").addEventListener("change", function (e) { try { localStorage.setItem("daily-learn-theme", e.target.value); } catch (er) {} applyTheme(); if (S) renderMap(); });
    try { matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () { applyTheme(); if (S && $("#screen-home").classList.contains("active")) renderMap(); }); } catch (e) {}
    window.addEventListener("resize", function () { if (S && $("#screen-home").classList.contains("active")) renderMap(); });
    $("#nextCardBtn").addEventListener("click", function () { if (footOverride && footOverride.onClick) footOverride.onClick(); else nextCard(); });
    $("#exitPlay").addEventListener("click", function () {
      if (window.DLSheet) window.DLSheet.close(false);
      if (active && active.destroy) active.destroy();
      S.mode = "map"; saveSession(); renderMap(); showScreen("screen-home");
    });
    $("#newTopicBtn").addEventListener("click", function () {
      var subj = ($("#subjectInput").value || "").trim();
      $("#subjectInput").value = "";
      loadTopic(subj);
    });
    $("#subjectInput").addEventListener("keydown", function (e) { if (e.key === "Enter") $("#newTopicBtn").click(); });
    $("#offlineNowBtn").addEventListener("click", function () { useOffline("Offline lesson while Grok was thinking."); });
    $("#doneNewBtn").addEventListener("click", function () { loadTopic(""); });
    $("#doneMapBtn").addEventListener("click", function () { renderMap(); showScreen("screen-home"); });
    $("#luKeep").addEventListener("click", function () {
      $("#levelUp").hidden = true;
      if (levelQueue.length) showLevelUp(levelQueue.shift());
    });
    $("#settingsBtn").addEventListener("click", openSettings);
    $("#settingsClose").addEventListener("click", closeSettings);
    $("#settingsBackdrop").addEventListener("click", closeSettings);
    $("#settingsSave").addEventListener("click", saveSettingsKey);
    $("#settingsClear").addEventListener("click", function () { setApiKey(""); maskKeyStatus(); });
    G.on(function (type, d) {
      if (type === "xp") { renderXp(true); xpPop("+" + d.amount); }
      if (type === "level") { if ($("#levelUp").hidden) showLevelUp(d.level); else levelQueue.push(d.level); }
      if (type === "badge") { if (collectingBadges) collectingBadges.push(d); else toast("Badge earned: " + d.name, "badge-toast"); renderBadges(); }
    });
  }

  function registerSW() {
    if (window.Capacitor || !("serviceWorker" in navigator)) return;
    if (location.protocol !== "http:" && location.protocol !== "https:") return;
    navigator.serviceWorker.register("./sw.js").catch(function () {});
  }

  function init() {
    if (!(window.DAILY_LEARN_TOPICS && window.DAILY_LEARN_TOPICS.length) && (window.__DL_INIT_TRIES = (window.__DL_INIT_TRIES || 0) + 1) < 100) {
      setTimeout(init, 40); return;
    }
    bind();
    registerSW();
    applyTheme();
    G.checkBadges();
    renderXp(false);
    S = loadSession();
    if (S) {
      S.restored = true;
      if (S.mode === "play") { renderMap(); enterNode(S.node); }
      else { renderMap(); showScreen("screen-home"); }
    } else {
      loadTopic("");
    }
    window.DailyLearn = {
      get session() { return S; }, loadTopic: loadTopic, useOffline: useOffline, enterNode: enterNode,
      hasKey: function () { return !!getApiKey(); }, sydneyDateISO: sydneyDateISO
    };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
