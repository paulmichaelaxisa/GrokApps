/* Daily Learn v2: lesson card schema, topic normalisation, and interactive card renderers. */
(function (global) {
  "use strict";
  var TYPES = ["explain", "reveal", "text", "match", "swipe", "order", "quiz"];

  function s(v, max) {
    if (typeof v !== "string" && typeof v !== "number") return "";
    var t = String(v).replace(/\s+/g, " ").trim();
    if (max && t.length > max) t = t.slice(0, max - 1).replace(/\s+\S*$/, "") + "\u2026";
    return t;
  }
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function shuffledNotIdentity(n) {
    var idx = [];
    for (var i = 0; i < n; i++) idx.push(i);
    if (n < 2) return idx;
    var out, tries = 0;
    do { out = shuffle(idx); tries++; } while (out.every(function (v, i) { return v === i; }) && tries < 20);
    return out;
  }

  // ---------- validation ----------
  function shapeOf(v) { return (global.DLAnim && v && global.DLAnim.shapeFor(v)) || undefined; }
  function validateQuiz(q) {
    if (!q || typeof q !== "object") return null;
    var question = s(q.q || q.question, 220);
    var choices = Array.isArray(q.choices) ? q.choices.map(function (c) { return s(c, 100); }).filter(Boolean) : [];
    if (!question || choices.length < 3) return null;
    if (choices.length > 4) choices = choices.slice(0, 4);
    var correct = typeof q.correct === "number" ? Math.round(q.correct) : parseInt(q.correct, 10);
    if (!(correct >= 0 && correct < choices.length)) return null;
    return { type: "quiz", q: question, choices: choices, correct: correct, why: s(q.why, 240) || "" };
  }

  function validateCard(c) {
    if (!c || typeof c !== "object") return null;
    var type = String(c.type || "").toLowerCase();
    if (TYPES.indexOf(type) < 0) return null;
    if (type === "quiz") return validateQuiz(c);
    if (type === "text") {
      var text = s(c.text || c.explanation, 480);
      if (!text) return null;
      return { type: "text", title: s(c.title, 60), text: text, example: s(c.example, 320) };
    }
    if (type === "reveal") {
      var rv = s(c.reveal || c.metaphor, 320);
      if (!rv) return null;
      return { type: "reveal", title: s(c.title, 60), prompt: s(c.prompt, 120) || "Think of it like\u2026", reveal: rv, shape: shapeOf(c.shape || c.icon) };
    }
    if (type === "explain") {
      var sceneIn = c.scene && typeof c.scene === "object" ? Object.assign({}, c.scene) : c.scene;
      if (sceneIn && !sceneIn.steps && Array.isArray(c.steps)) sceneIn.steps = c.steps;
      if (sceneIn && !sceneIn.items && Array.isArray(c.items)) sceneIn.items = c.items;
      var res = global.DLAnim ? global.DLAnim.validate(sceneIn) : { ok: false };
      var fallback = s(c.text, 400);
      if (!res.ok) {
        var caps = c.scene && Array.isArray(c.scene.steps) ? c.scene.steps.map(function (st) { return s(typeof st === "string" ? st : st && st.caption, 110); }).filter(Boolean).join(" ") : "";
        var t = fallback || s(caps, 480);
        if (!t) return null;
        return { type: "text", title: s(c.title, 60), text: t, example: "", fromExplain: res.error || "invalid" };
      }
      return { type: "explain", title: s(c.title, 60) || res.scene.title, scene: res.scene, text: fallback };
    }
    if (type === "match") {
      var seen = {};
      var pairs = (Array.isArray(c.pairs) ? c.pairs : []).map(function (p) {
        return p && { term: s(p.term, 32), meaning: s(p.meaning, 90) };
      }).filter(function (p) {
        if (!p || !p.term || !p.meaning) return false;
        var k = p.term.toLowerCase();
        if (seen[k]) return false;
        seen[k] = 1; return true;
      });
      if (pairs.length < 2) return null;
      return { type: "match", prompt: s(c.prompt, 100) || "Match each term to its meaning", pairs: pairs.slice(0, 4) };
    }
    if (type === "swipe") {
      var st = (Array.isArray(c.statements) ? c.statements : []).map(function (x) {
        if (!x) return null;
        var ans = x.answer === true || x.answer === "true" || x.answer === "True" ? true : (x.answer === false || x.answer === "false" || x.answer === "False" ? false : null);
        var tx = s(x.text, 130);
        if (!tx || ans === null) return null;
        return { text: tx, answer: ans, why: s(x.why, 180), shape: shapeOf(x.shape || x.icon) };
      }).filter(Boolean);
      if (st.length < 2) return null;
      return { type: "swipe", prompt: s(c.prompt, 100) || "True or false? Swipe or tap", statements: st.slice(0, 4) };
    }
    if (type === "order") {
      var seenS = {};
      var steps = (Array.isArray(c.steps) ? c.steps : []).map(function (x) { return s(typeof x === "string" ? x : x && (x.text || x.label), 80); })
        .filter(function (x) { if (!x || seenS[x.toLowerCase()]) return false; seenS[x.toLowerCase()] = 1; return true; });
      if (steps.length < 3) return null;
      return { type: "order", prompt: s(c.prompt, 100) || "Put the steps in order", steps: steps.slice(0, 5), why: s(c.why, 220) };
    }
    return null;
  }

  function legacyToV2(t) {
    var sections = t.sections.map(function (sec) {
      var cards = [];
      if (sec.metaphor) cards.push({ type: "reveal", prompt: "Think of it like\u2026", reveal: sec.metaphor });
      cards.push({ type: "text", text: sec.explanation, example: sec.example });
      if (sec.quiz) cards.push(Object.assign({ type: "quiz" }, sec.quiz));
      return { title: sec.title, cards: cards };
    });
    var boss = t.sections.map(function (sec) { return sec.quiz; }).filter(Boolean).map(function (q) {
      var order = shuffle(q.choices.map(function (_, i) { return i; }));
      return { type: "quiz", q: q.q, choices: order.map(function (i) { return q.choices[i]; }), correct: order.indexOf(q.correct), why: q.why };
    });
    return { v: 2, id: t.id, emoji: t.emoji, title: t.title, blurb: t.blurb, sections: sections, boss: boss, legacy: true };
  }

  /** Returns {ok, topic, warnings[]} — topic always v2 shape when ok. */
  function normalizeTopic(raw) {
    var warnings = [];
    if (!raw || typeof raw !== "object") return { ok: false, error: "not an object" };
    var title = s(raw.title, 70), emoji = s(raw.emoji, 12) || "\uD83D\uDCA1";
    if (!title) return { ok: false, error: "missing title" };
    if (!Array.isArray(raw.sections) || !raw.sections.length) return { ok: false, error: "missing sections" };
    var src = raw;
    if (!Array.isArray(raw.sections[0].cards)) {
      if (!raw.sections.every(function (x) { return x && x.explanation; })) return { ok: false, error: "bad legacy sections" };
      src = legacyToV2(raw);
    }
    var sections = [];
    src.sections.slice(0, 5).forEach(function (sec, i) {
      if (!sec || !Array.isArray(sec.cards)) { warnings.push("section " + i + " dropped"); return; }
      var cards = [];
      sec.cards.slice(0, 7).forEach(function (c, j) {
        var v = validateCard(c);
        if (v) { if (v.fromExplain) warnings.push("s" + i + "c" + j + " explain->text: " + v.fromExplain); cards.push(v); }
        else warnings.push("s" + i + "c" + j + " dropped (" + (c && c.type) + ")");
      });
      if (!cards.length) { warnings.push("section " + i + " empty"); return; }
      sections.push({ title: s(sec.title, 60) || ("Part " + (i + 1)), cards: cards });
    });
    if (sections.length < 2) return { ok: false, error: "need 2+ valid sections", warnings: warnings };
    var boss = (Array.isArray(src.boss) ? src.boss : []).map(validateQuiz).filter(Boolean).slice(0, 5);
    if (boss.length < 3) {
      sections.forEach(function (sec) { sec.cards.forEach(function (c) { if (c.type === "quiz" && boss.length < 5) boss.push(c); }); });
      warnings.push("boss padded from section quizzes");
    }
    if (boss.length < 2) return { ok: false, error: "need 2+ boss questions", warnings: warnings };
    var id = s(raw.id, 60).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return {
      ok: true, warnings: warnings,
      topic: { v: 2, id: id, emoji: emoji, title: title, blurb: s(raw.blurb, 120) || "", sections: sections, boss: boss, legacy: !!src.legacy }
    };
  }

  // ---------- rendering ----------
  function h(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  /**
   * ctx: { saved: {done, result} | null, complete(result), mode: "lesson"|"boss" }
   * result: { xp, perfect, correct?, detail? }
   */
  function render(card, host, ctx) {
    host.innerHTML = "";
    var wrap = h("div", "dl-card dl-card-" + card.type);
    host.appendChild(wrap);
    var R = RENDER[card.type];
    var api = R(card, wrap, ctx) || {};
    return api;
  }

  var RENDER = {};

  RENDER.text = function (card, wrap, ctx) {
    if (card.title) wrap.appendChild(h("h2", "dl-card-title", card.title));
    wrap.appendChild(h("p", "dl-body", card.text));
    if (card.example) {
      var ex = h("div", "dl-example");
      ex.appendChild(h("div", "dl-mini", "Example"));
      ex.appendChild(h("p", null, card.example));
      wrap.appendChild(ex);
    }
    if (!(ctx.saved && ctx.saved.done)) ctx.complete({ xp: global.DLGame.XP.cardRead });
  };

  // ---------- shared: haptics, glyphs, bottom sheet ----------
  var HAPTIC = { tick: 8, confirm: [14], wrong: [10, 60, 10], medium: 24 };
  function haptic(kind) {
    try { if (localStorage.getItem("daily-learn-haptics") === "0") return; } catch (e) {}
    try { if (navigator.vibrate) navigator.vibrate(HAPTIC[kind] || 8); } catch (e) {}
  }
  function glyphHTML(shape, tone, size) {
    var shp = global.DLAnim && global.DLAnim.shapeFor(shape);
    return shp ? global.DLAnim.shapeSvg(shp, tone, size) : "";
  }
  function reduced() { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } }
  function ordinal(n) { return n + (n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"); }
  var SVG_CHECK = '<svg viewBox="0 0 20 20" width="28" height="28" aria-hidden="true"><circle cx="10" cy="10" r="10" fill="var(--success)"/><path d="M6 10.2l2.6 2.6L14 7.6" fill="none" stroke="var(--on-success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var SVG_X = '<svg viewBox="0 0 20 20" width="28" height="28" aria-hidden="true"><circle cx="10" cy="10" r="10" fill="var(--error-soft)"/><path d="M7 7l6 6M13 7l-6 6" stroke="var(--error-ink)" stroke-width="2" stroke-linecap="round"/></svg>';
  var SVG_BOOKMARK = '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M5 3h10v14l-5-3.4L5 17z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M7.6 8.4l1.7 1.7 3.2-3.3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /**
   * Bottom feedback sheet (Remy 2b·8 + 2a). opts: { kind: "success"|"wrong", headline, xp, body, why,
   *   answer (text for the Answer chip), review (true when saved to Review later), button, onClose }
   */
  var Sheet = (function () {
    var root = null, closeCb = null;
    function build() {
      root = h("div", "dl-sheet-root"); root.hidden = true;
      root.innerHTML = '<div class="dl-scrim"></div><section class="dl-sheet" role="dialog" aria-modal="true" aria-labelledby="dlSheetHead"><img class="dl-sheet-lumi lumi" alt="" hidden /><div class="dl-sheet-inner"></div></section>';
      document.body.appendChild(root);
      root.querySelector(".dl-scrim").addEventListener("click", function () { /* tap outside does nothing: "Got it" is the action */ });
    }
    function show(o) {
      if (!root) build();
      var sheet = root.querySelector(".dl-sheet"), inner = root.querySelector(".dl-sheet-inner");
      sheet.className = "dl-sheet dl-sheet-" + o.kind;
      inner.innerHTML = "";
      var head = h("div", "dl-sheet-head");
      head.insertAdjacentHTML("beforeend", o.kind === "success" ? SVG_CHECK : SVG_X);
      var hd = h("h2", "dl-sheet-title", o.headline); hd.id = "dlSheetHead"; hd.tabIndex = -1;
      head.appendChild(hd);
      if (o.xp) head.appendChild(h("span", "xp-chip", "+" + o.xp + " XP"));
      inner.appendChild(head);
      if (o.answer) {
        var ar = h("div", "dl-sheet-answer");
        ar.appendChild(h("span", "eyebrow", "Answer"));
        var chip = h("span", "dl-answer-chip"); chip.insertAdjacentHTML("beforeend", '<svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><circle cx="10" cy="10" r="10" fill="var(--success)"/><path d="M6 10.2l2.6 2.6L14 7.6" fill="none" stroke="var(--on-success)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>');
        chip.appendChild(document.createTextNode(o.answer)); ar.appendChild(chip);
        inner.appendChild(ar);
      }
      if (o.why || o.body) {
        var p = h("p", "dl-sheet-body");
        if (o.why) { p.appendChild(h("strong", null, "Why: ")); p.appendChild(document.createTextNode(o.why)); }
        else p.textContent = o.body;
        inner.appendChild(p);
      }
      if (o.review) {
        var rv = h("div", "dl-review-note");
        rv.insertAdjacentHTML("beforeend", SVG_BOOKMARK);
        var t = h("span"); t.innerHTML = "Saved to <b>Review later</b>. It comes back in the boss quiz.";
        rv.appendChild(t); inner.appendChild(rv);
      }
      var btn = h("button", "btn " + (o.kind === "success" ? "btn-success" : "btn-primary"), o.button || (o.kind === "success" ? "Continue" : "Got it"));
      btn.type = "button";
      inner.appendChild(btn);
      var lumi = root.querySelector(".dl-sheet-lumi"), T = global.DL_THEME || {};
      if (T.lumi && T.mascot) { lumi.src = o.kind === "success" ? T.mascot.cheer : T.mascot.thinking; lumi.hidden = false; } else lumi.hidden = true;
      closeCb = o.onClose;
      btn.addEventListener("click", function () { close(true); });
      root.hidden = false;
      root.classList.remove("show"); void root.offsetWidth; root.classList.add("show");
      haptic(o.kind === "success" ? "confirm" : "wrong");
      setTimeout(function () { try { hd.focus({ preventScroll: true }); } catch (e) {} }, 60);
      document.addEventListener("keydown", onKey);
    }
    function onKey(e) { if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); close(true); } }
    function close(fire) {
      if (!root || root.hidden) return;
      document.removeEventListener("keydown", onKey);
      root.hidden = true; root.classList.remove("show");
      var cb = closeCb; closeCb = null;
      if (fire && cb) cb();
    }
    return { show: show, close: close, get open() { return !!root && !root.hidden; } };
  })();

  RENDER.reveal = function (card, wrap, ctx) {
    var X = global.DLGame.XP, done = !!(ctx.saved && ctx.saved.done);
    wrap.appendChild(h("h2", "dl-card-title", card.title || "What's the big idea?"));
    var stack = h("div", "dl-reveal");
    stack.appendChild(h("div", "dl-reveal-ghost"));
    var flip = h("button", "dl-flip");
    flip.type = "button";
    flip.setAttribute("aria-label", "Reveal the answer for: " + card.prompt);
    flip.setAttribute("aria-expanded", "false");
    var front = h("div", "dl-face dl-front");
    front.appendChild(h("span", "eyebrow", "Think first"));
    front.appendChild(h("p", "dl-flip-prompt", card.prompt));
    var disc = h("div", "dl-flip-disc");
    disc.innerHTML = glyphHTML(card.shape || "lightbulb", "highlight", 64) || '<span class="dl-flip-emoji">?</span>';
    front.appendChild(disc);
    var chip = h("span", "dl-reveal-chip");
    chip.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M6 8V3.5a1.2 1.2 0 0 1 2.4 0V7l3 .7a1.6 1.6 0 0 1 1.2 1.8l-.5 3.2a1.6 1.6 0 0 1-1.6 1.3H7.4a1.6 1.6 0 0 1-1.3-.7L3.8 10a1.1 1.1 0 0 1 1.7-1.4z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>Tap to reveal';
    front.appendChild(chip);
    var back = h("div", "dl-face dl-back");
    back.appendChild(h("span", "eyebrow dl-accent", "The answer"));
    var bt = h("p", "dl-flip-text", card.reveal); bt.tabIndex = -1; bt.setAttribute("aria-live", "polite");
    back.appendChild(bt);
    var foot = h("div", "dl-back-foot");
    foot.appendChild(h("span", "dl-mini", "\u21BA Tap to see the question again"));
    var xpChip = h("span", "xp-chip dl-xp-float", "+" + X.cardRead + " XP");
    foot.appendChild(xpChip);
    back.appendChild(foot);
    flip.appendChild(front); flip.appendChild(back);
    stack.appendChild(flip);
    wrap.appendChild(stack);
    wrap.appendChild(h("p", "dl-mini dl-under", "Have a guess first. Then flip the card."));
    function setState(isBack) {
      flip.classList.toggle("flipped", isBack);
      flip.setAttribute("aria-expanded", isBack ? "true" : "false");
      flip.setAttribute("aria-label", isBack ? "Show the question again" : "Reveal the answer for: " + card.prompt);
      if (isBack) ctx.setFoot(null);
      else ctx.setFoot({ label: "Reveal", style: "outline", enabled: true, onClick: toggle });
    }
    function toggle() {
      var toBack = !flip.classList.contains("flipped");
      if (toBack) haptic("tick");
      setState(toBack);
      if (toBack) {
        setTimeout(function () { try { bt.focus({ preventScroll: true }); } catch (e) {} }, 430);
        if (!done) { done = true; xpChip.classList.add("in"); ctx.complete({ xp: X.cardRead }); }
        else xpChip.classList.add("seen");
      }
    }
    flip.addEventListener("click", toggle);
    if (done) { xpChip.classList.add("seen"); }
    setState(done);
  };

  RENDER.explain = function (card, wrap, ctx) {
    if (card.title) wrap.appendChild(h("h2", "dl-card-title", card.title));
    var host = h("div", "dl-anim");
    wrap.appendChild(host);
    if (card.text) wrap.appendChild(h("p", "dl-note", card.text));
    var done = !!(ctx.saved && ctx.saved.done);
    var autoplay = false;
    try { autoplay = localStorage.getItem("daily-learn-autoplay") === "1"; } catch (e) {}
    var player;
    function foot(st) {
      if (!st) return;
      if (st.last || done) ctx.setFoot(null);
      else ctx.setFoot({ label: "Next step", style: "primary", enabled: true, onClick: function () { player.next(); } });
    }
    player = global.DLAnim.mount(host, card.scene, {
      mode: "lesson",
      autoplay: autoplay,
      onStep: foot,
      onDone: function () { ctx.advance(); },
      onComplete: function () {
        if (done) return;
        done = true;
        global.DLGame.bump("explainersWatched");
        ctx.complete({ xp: global.DLGame.XP.explainWatched });
        ctx.setFoot(null);
      }
    });
    foot({ index: player.index, count: player.total, last: player.index === player.total - 1 });
    return { destroy: function () { player.destroy(); }, player: player };
  };

  RENDER.quiz = function (card, wrap, ctx) {
    var X = global.DLGame.XP;
    if (card.reviewId) wrap.appendChild(h("span", "dl-review-tag", "From Review later" + (card.reviewFrom ? " \u00b7 " + card.reviewFrom : "")));
    wrap.appendChild(h("h2", "dl-card-title dl-q", card.q));
    var list = h("div", "dl-choices");
    wrap.appendChild(list);
    var sel = null, answered = false;
    var btns = card.choices.map(function (c, i) {
      var b = h("button", "choice", c);
      b.type = "button";
      b.addEventListener("click", function () {
        if (answered) return;
        sel = i; haptic("tick");
        btns.forEach(function (x, j) { x.classList.toggle("selected", j === i); x.setAttribute("aria-pressed", j === i ? "true" : "false"); });
        ctx.setFoot({ label: "Check", style: "primary", enabled: true, onClick: check });
      });
      list.appendChild(b);
      return b;
    });
    function paint(choice) {
      var ok = choice === card.correct;
      btns.forEach(function (b, j) {
        b.disabled = true;
        if (j === card.correct) b.classList.add("correct");
        if (j === choice && !ok) b.classList.add("wrong");
      });
      return ok;
    }
    function check() {
      if (sel == null || answered) return;
      answered = true;
      var ok = paint(sel);
      var xp = ok ? (ctx.mode === "boss" ? X.bossCorrect : X.quizCorrect) : 0;
      var rv = ok ? null : ctx.missed(card, {});
      if (card.reviewId) ctx.reviewAnswer(card.reviewId, ok);
      ctx.complete({ xp: xp, correct: ok, perfect: ok, detail: { choice: sel } });
      ctx.setFoot(null);
      Sheet.show(ok
        ? { kind: "success", headline: pick(["Nice, that's it", "Spot on", "Yes, exactly"]), xp: xp, body: card.why, onClose: ctx.advance }
        : { kind: "wrong", headline: "Not quite", answer: card.choices[card.correct], why: card.why, review: !!rv, onClose: ctx.advance });
    }
    if (ctx.saved && ctx.saved.done && ctx.saved.result && ctx.saved.result.detail) { answered = true; paint(ctx.saved.result.detail.choice); }
    else ctx.setFoot({ label: "Check", style: "primary", enabled: false });
  };
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  RENDER.match = function (card, wrap, ctx) {
    wrap.appendChild(h("h2", "dl-card-title", card.prompt));
    wrap.appendChild(h("p", "dl-mini dl-hint", "Drag a term onto its meaning, or tap one then the other."));
    var grid = h("div", "dl-match");
    var left = h("div", "dl-terms"), right = h("div", "dl-meanings");
    grid.appendChild(left); grid.appendChild(right);
    wrap.appendChild(grid);
    var status = h("p", "dl-mini dl-status", "");
    wrap.appendChild(status);
    var termOrder = shuffle(card.pairs.map(function (_, i) { return i; }));
    var meanOrder = shuffledNotIdentity(card.pairs.length);
    var matched = {}, mistakes = 0, selected = null, finished = false;
    var terms = {}, slots = {};
    termOrder.forEach(function (i) {
      var t = h("button", "dl-term", card.pairs[i].term);
      t.type = "button"; t.dataset.i = i;
      terms[i] = t; left.appendChild(t);
    });
    meanOrder.forEach(function (i) {
      var m = h("button", "dl-meaning");
      m.type = "button"; m.dataset.i = i;
      m.appendChild(h("span", "dl-meaning-text", card.pairs[i].meaning));
      m.appendChild(h("span", "dl-slot", "Drop a term here"));
      slots[i] = m; right.appendChild(m);
    });
    function lock(i) {
      matched[i] = true;
      terms[i].classList.add("matched"); terms[i].disabled = true;
      slots[i].classList.add("matched"); slots[i].disabled = true;
      slots[i].querySelector(".dl-slot").textContent = card.pairs[i].term;
    }
    function attempt(ti, mi) {
      if (finished || matched[ti] || matched[mi]) return;
      if (ti === mi) {
        lock(ti);
        slots[mi].classList.add("pop");
        if (Object.keys(matched).length === card.pairs.length) {
          finished = true;
          status.textContent = mistakes ? ("All matched \u00b7 " + mistakes + " slip" + (mistakes > 1 ? "s" : "")) : "Perfect match!";
          var X = global.DLGame.XP;
          var mxp = mistakes ? X.interactiveOk : X.interactivePerfect;
          ctx.complete({ xp: mxp, perfect: !mistakes });
          ctx.setFoot(null);
          setTimeout(function () {
            Sheet.show({ kind: "success", headline: mistakes ? "All matched" : "Nice, " + card.pairs.length + " for " + card.pairs.length, xp: mxp,
              body: mistakes ? mistakes + " slip" + (mistakes > 1 ? "s" : "") + " on the way, but every term is in the right place now." : "Every term went straight to its meaning.", onClose: ctx.advance });
          }, 420);
        }
      } else {
        mistakes++;
        var sl = slots[mi].querySelector(".dl-slot"), prev = sl.textContent;
        slots[mi].classList.add("wrong"); sl.textContent = "\u2715 " + card.pairs[ti].term;
        setTimeout(function () { slots[mi].classList.remove("wrong"); if (!matched[mi]) sl.textContent = prev; }, 600);
        [terms[ti], slots[mi]].forEach(function (e) { e.classList.remove("shake"); void e.offsetWidth; e.classList.add("shake"); setTimeout(function () { e.classList.remove("shake"); }, 400); });
        status.textContent = "Not that one. Try another meaning.";
        haptic("wrong");
      }
      clearSel();
    }
    function clearSel() { if (selected != null && terms[selected]) terms[selected].classList.remove("selected"); selected = null; }
    left.addEventListener("click", function (e) {
      var t = e.target.closest(".dl-term"); if (!t || t.disabled) return;
      var i = +t.dataset.i;
      if (selected === i) { clearSel(); return; }
      clearSel(); selected = i; t.classList.add("selected");
    });
    right.addEventListener("click", function (e) {
      var m = e.target.closest(".dl-meaning"); if (!m || m.disabled) return;
      if (selected == null) { status.textContent = "Pick a term from the tray first."; return; }
      attempt(selected, +m.dataset.i);
    });
    dragify(left, ".dl-term", function (el, x, y) {
      var under = document.elementFromPoint(x, y);
      var m = under && under.closest && under.closest(".dl-meaning");
      if (m && !m.disabled) attempt(+el.dataset.i, +m.dataset.i);
    }, function (x, y) {
      Object.keys(slots).forEach(function (k) { slots[k].classList.remove("hover"); });
      var under = document.elementFromPoint(x, y);
      var m = under && under.closest && under.closest(".dl-meaning");
      if (m && !m.disabled) m.classList.add("hover");
    });
    if (ctx.saved && ctx.saved.done) { finished = true; card.pairs.forEach(function (_, i) { lock(i); }); status.textContent = "Matched"; }
  };

  // generic drag-with-ghost helper (pointer events)
  function dragify(container, selector, onDrop, onMove) {
    container.addEventListener("pointerdown", function (e) {
      var src = e.target.closest(selector);
      if (!src || src.disabled) return;
      var sx = e.clientX, sy = e.clientY, ghost = null, moved = false;
      var rect = src.getBoundingClientRect();
      function move(ev) {
        var dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (!moved && Math.abs(dx) + Math.abs(dy) < 8) return;
        if (!moved) {
          moved = true;
          ghost = src.cloneNode(true);
          ghost.classList.remove("shake", "selected", "pop");
          ghost.classList.add("dl-ghost");
          ghost.style.width = rect.width + "px";
          document.body.appendChild(ghost);
          src.classList.add("dragging");
        }
        ev.preventDefault();
        ghost.style.transform = "translate(" + (rect.left + dx) + "px," + (rect.top + dy) + "px) rotate(-3deg)";
        if (onMove) onMove(ev.clientX, ev.clientY);
      }
      function up(ev) {
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", up);
        document.removeEventListener("pointercancel", up);
        if (moved) {
          ghost.remove(); src.classList.remove("dragging");
          if (onMove) onMove(-1, -1);
          onDrop(src, ev.clientX, ev.clientY);
          var stopClick = function (ce) { ce.stopPropagation(); ce.preventDefault(); src.removeEventListener("click", stopClick, true); };
          src.addEventListener("click", stopClick, true);
          setTimeout(function () { src.removeEventListener("click", stopClick, true); }, 50);
        }
      }
      document.addEventListener("pointermove", move, { passive: false });
      document.addEventListener("pointerup", up);
      document.addEventListener("pointercancel", up);
    });
  }

  RENDER.swipe = function (card, wrap, ctx) {
    var X = global.DLGame.XP, reduce = reduced();
    wrap.appendChild(h("h2", "dl-card-title", card.prompt || "Swipe it: true or false?"));
    var deck = h("div", "dl-deck");
    deck.setAttribute("aria-roledescription", "true or false cards");
    wrap.appendChild(deck);
    var btnRow = h("div", "dl-swipe-btns");
    var bF = h("button", "btn dl-false"); bF.type = "button"; bF.innerHTML = '<span aria-hidden="true">\u2715</span> False';
    var bT = h("button", "btn dl-true"); bT.type = "button"; bT.innerHTML = '<span aria-hidden="true">\u2713</span> True';
    btnRow.appendChild(bF); btnRow.appendChild(bT);
    wrap.appendChild(btnRow);
    var cap = h("p", "dl-mini dl-under", "Swipe the card, or tap a button");
    wrap.appendChild(cap);
    var live = h("p", "sr-only"); live.setAttribute("aria-live", "polite"); wrap.appendChild(live);
    var n = card.statements.length, idx = 0, correct = 0, busy = false, results = [];
    var cards = card.statements.map(function (st, i) {
      var c = h("div", "dl-st");
      c.tabIndex = -1;
      c.setAttribute("role", "group");
      c.setAttribute("aria-label", "Statement " + (i + 1) + " of " + n + ": " + st.text + ". Swipe or use the True and False buttons.");
      var top = h("div", "dl-st-top");
      top.appendChild(h("span", "eyebrow", "True or false \u00b7 " + (i + 1) + " of " + n));
      var said = h("span", "dl-said"); top.appendChild(said);
      c.appendChild(top);
      var g = glyphHTML(st.shape || card.shape, "highlight", 40);
      if (g) { var tile = h("div", "dl-st-tile"); tile.innerHTML = g; c.appendChild(tile); }
      c.appendChild(h("p", "dl-st-text", st.text));
      var cues = h("div", "dl-st-cues"); cues.appendChild(h("span", null, "\u2039 False")); cues.appendChild(h("span", null, "True \u203A"));
      c.appendChild(cues);
      var stamp = h("span", "dl-stamp"); c.appendChild(stamp);
      c.appendChild(h("i", "dl-st-tint"));
      deck.appendChild(c);
      return c;
    });
    var glowL = h("i", "dl-edge dl-edge-l"), glowR = h("i", "dl-edge dl-edge-r");
    deck.appendChild(glowL); deck.appendChild(glowR);
    function layout() {
      cards.forEach(function (c, i) {
        var d = i - idx;
        c.classList.toggle("gone", d < 0);
        c.style.zIndex = String(10 - d);
        c.style.transition = "";
        if (d >= 0) {
          c.style.transform = "translateY(" + (Math.min(d, 2) * 12) + "px) scale(" + (1 - Math.min(d, 2) * 0.04) + ")";
          c.style.opacity = d === 0 ? 1 : (d === 1 ? 0.85 : (d === 2 ? 0.5 : 0));
          c.classList.toggle("front", d === 0);
          c.setAttribute("aria-hidden", d === 0 ? "false" : "true");
        }
      });
    }
    function setLean(c, dx) {
      var p = Math.min(1, Math.abs(dx) / 96), side = dx > 0 ? "true" : "false";
      c.style.setProperty("--tint", (p * 12) + "%");
      c.classList.toggle("lean-true", dx > 24); c.classList.toggle("lean-false", dx < -24);
      var stamp = c.querySelector(".dl-stamp");
      stamp.textContent = side === "true" ? "TRUE" : "FALSE";
      stamp.style.opacity = Math.abs(dx) < 24 ? 0 : Math.min(1, (Math.abs(dx) - 24) / 72);
      glowL.style.opacity = dx < 0 ? p : 0; glowR.style.opacity = dx > 0 ? p : 0;
      bT.classList.toggle("pressed", dx >= 96); bF.classList.toggle("pressed", dx <= -96);
    }
    function clearLean(c) {
      c.classList.remove("lean-true", "lean-false"); c.style.setProperty("--tint", "0%");
      c.querySelector(".dl-stamp").style.opacity = 0; glowL.style.opacity = 0; glowR.style.opacity = 0;
      bT.classList.remove("pressed"); bF.classList.remove("pressed");
    }
    function decide(ans) {
      if (busy || idx >= n) return;
      busy = true;
      var st = card.statements[idx], ok = ans === st.answer, c = cards[idx];
      if (ok) correct++;
      results.push(ok);
      // settle back with the result (Remy 6c / 8a), then fly out on "Continue"/"Got it"
      clearLean(c);
      c.style.transition = reduce ? "opacity 150ms" : "transform 360ms var(--ease-spring)";
      c.style.transform = "none";
      c.classList.add(ok ? "result-ok" : "result-bad");
      c.querySelector(".dl-said").textContent = "You said " + (ans ? "true" : "false");
      (ans ? bT : bF).classList.add("pressed");
      bF.disabled = bT.disabled = true;
      live.textContent = (ok ? "Right. " : "Not quite. ") + "It's " + (st.answer ? "true" : "false") + ".";
      var last = idx === n - 1, xp = ok ? X.swipeCorrect : 0;
      var rv = ok ? null : ctx.missed(card, { statement: st });
      if (last) ctx.complete({ xp: correct * X.swipeCorrect, perfect: correct === n, correct: correct });
      ctx.setFoot(null);
      Sheet.show(ok
        ? { kind: "success", headline: "Right, it's " + (st.answer ? "true" : "false"), xp: xp, body: st.why, onClose: function () { flyOut(ans, last); } }
        : { kind: "wrong", headline: "Not quite. It's " + (st.answer ? "true" : "false"), answer: st.answer ? "True" : "False", why: st.why, review: !!rv, onClose: function () { flyOut(ans, last); } });
    }
    function flyOut(ans, last) {
      var c = cards[idx];
      bT.classList.remove("pressed"); bF.classList.remove("pressed");
      if (last) { busy = false; idx = n; summary(); ctx.advance(); return; }
      if (reduce) { c.style.transition = "opacity 150ms"; c.style.opacity = 0; }
      else {
        c.style.transition = "transform 280ms var(--ease-in), opacity 280ms var(--ease-in)";
        c.style.transform = "translateX(" + (ans ? 480 : -480) + "px) rotate(" + (ans ? 14 : -14) + "deg)";
        c.style.opacity = 0;
      }
      setTimeout(function () {
        idx++; busy = false; bF.disabled = bT.disabled = false;
        cards.forEach(function (x) { x.style.transition = "transform 280ms var(--ease-out), opacity 280ms var(--ease-out)"; });
        layout();
        try { cards[idx].focus({ preventScroll: true }); } catch (e) {}
      }, reduce ? 150 : 280);
    }
    function summary() {
      deck.classList.add("done");
      cards.forEach(function (c) { c.classList.add("gone"); });
      var sum = h("div", "dl-st-summary");
      sum.appendChild(h("p", "dl-st-score", correct + " of " + n + " right"));
      var ol = h("ul");
      card.statements.forEach(function (st, i) {
        var li = h("li", results[i] ? "ok" : "bad");
        li.appendChild(h("b", null, (st.answer ? "True" : "False") + ": "));
        li.appendChild(document.createTextNode(st.text));
        ol.appendChild(li);
      });
      sum.appendChild(ol);
      deck.appendChild(sum);
      btnRow.hidden = true; cap.hidden = true;
    }
    bF.addEventListener("click", function () { decide(false); });
    bT.addEventListener("click", function () { decide(true); });
    wrap.addEventListener("keydown", function (e) {
      if (Sheet.open || idx >= n) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); decide(false); }
      else if (e.key === "ArrowRight") { e.preventDefault(); decide(true); }
    });
    deck.addEventListener("pointerdown", function (e) {
      if (busy || idx >= n || reduce) return;
      var c = cards[idx]; if (!c.contains(e.target)) return;
      var x0 = e.clientX, y0 = e.clientY, dx = 0, crossed = false, samples = [{ x: x0, t: performance.now() }], dragging = false;
      c.setPointerCapture && c.setPointerCapture(e.pointerId);
      c.style.transition = "none";
      function move(ev) {
        dx = ev.clientX - x0;
        if (!dragging && Math.abs(dx) < 6) return;
        if (!dragging && Math.abs(ev.clientY - y0) > Math.abs(dx) * 1.5) { up(); return; }
        dragging = true; c.classList.add("dragging");
        samples.push({ x: ev.clientX, t: performance.now() }); if (samples.length > 5) samples.shift();
        var rot = Math.max(-8, Math.min(8, dx / 16));
        c.style.transform = "translateX(" + dx + "px) rotate(" + rot + "deg)";
        setLean(c, dx);
        var over = Math.abs(dx) >= 96;
        if (over && !crossed) haptic("tick");
        crossed = over;
      }
      function up() {
        document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); document.removeEventListener("pointercancel", up);
        c.classList.remove("dragging");
        var a = samples[0], b = samples[samples.length - 1], v = b.t > a.t ? (b.x - a.x) / (b.t - a.t) : 0;
        if (dragging && (Math.abs(dx) >= 96 || (Math.abs(v) > 0.8 && Math.abs(dx) > 24))) { decide((Math.abs(dx) >= 96 ? dx : v) > 0); return; }
        c.style.transition = "transform 360ms var(--ease-spring)";
        c.style.transform = "none";
        clearLean(c);
      }
      document.addEventListener("pointermove", move); document.addEventListener("pointerup", up); document.addEventListener("pointercancel", up);
    });
    layout();
    if (ctx.saved && ctx.saved.done) { idx = n; results = card.statements.map(function () { return true; }); correct = (ctx.saved.result && ctx.saved.result.correct) || n; summary(); }
    else ctx.setFoot({ label: "Continue", style: "primary", enabled: false });
  };

  RENDER.order = function (card, wrap, ctx) {
    var X = global.DLGame.XP, reduce = reduced();
    if (card.reviewId) wrap.appendChild(h("span", "dl-review-tag", "From Review later" + (card.reviewFrom ? " \u00b7 " + card.reviewFrom : "")));
    wrap.appendChild(h("h2", "dl-card-title", card.prompt));
    wrap.appendChild(h("p", "dl-mini dl-hint", "Drag the handles, or tap a row and use \u25B2\u25BC. First step at the top."));
    var list = h("ol", "dl-order");
    list.setAttribute("aria-label", "Steps to put in order");
    wrap.appendChild(list);
    var foot = h("p", "dl-mini dl-under", "Rows make room as you drag \u00b7 release to drop");
    wrap.appendChild(foot);
    var live = h("p", "sr-only"); live.setAttribute("aria-live", "polite"); wrap.appendChild(live);
    var order = shuffledNotIdentity(card.steps.length), finished = false, selected = null;
    function rows() { return Array.prototype.slice.call(list.querySelectorAll(".dl-step")); }
    order.forEach(function (i) {
      var li = h("li", "dl-step");
      li.dataset.i = i;
      li.tabIndex = 0;
      var disc = h("span", "dl-disc", ""); li.appendChild(disc);
      li.appendChild(h("span", "dl-step-text", card.steps[i]));
      var chip = h("span", "dl-goes"); li.appendChild(chip);
      var arrows = h("span", "dl-arrows");
      var up = h("button", "dl-arrow", "\u25B2"); up.type = "button"; up.dataset.dir = "-1";
      var dn = h("button", "dl-arrow", "\u25BC"); dn.type = "button"; dn.dataset.dir = "1";
      arrows.appendChild(up); arrows.appendChild(dn); li.appendChild(arrows);
      var handle = h("button", "dl-handle"); handle.type = "button";
      handle.innerHTML = '<svg viewBox="0 0 12 18" width="12" height="18" aria-hidden="true"><g fill="currentColor"><circle cx="3" cy="3" r="1.6"/><circle cx="9" cy="3" r="1.6"/><circle cx="3" cy="9" r="1.6"/><circle cx="9" cy="9" r="1.6"/><circle cx="3" cy="15" r="1.6"/><circle cx="9" cy="15" r="1.6"/></g></svg>';
      li.appendChild(handle);
      list.appendChild(li);
    });
    function renumber() {
      rows().forEach(function (r, k) {
        r.querySelector(".dl-disc").textContent = k + 1;
        var txt = card.steps[+r.dataset.i];
        r.querySelector(".dl-handle").setAttribute("aria-label", "Reorder " + txt + ", position " + (k + 1) + " of " + card.steps.length);
        r.querySelector('[data-dir="-1"]').setAttribute("aria-label", "Move up: " + txt);
        r.querySelector('[data-dir="1"]').setAttribute("aria-label", "Move down: " + txt);
        r.querySelector('[data-dir="-1"]').disabled = k === 0;
        r.querySelector('[data-dir="1"]').disabled = k === card.steps.length - 1;
      });
    }
    function flip(mutate, dur) {
      var before = rows().map(function (r) { return [r, r.getBoundingClientRect().top]; });
      mutate();
      if (reduce) { renumber(); return; }
      before.forEach(function (p) {
        var dy = p[1] - p[0].getBoundingClientRect().top;
        if (!dy || p[0].classList.contains("lifted")) return;
        p[0].style.transition = "none"; p[0].style.transform = "translateY(" + dy + "px)";
        requestAnimationFrame(function () { p[0].style.transition = "transform " + (dur || 220) + "ms var(--ease-spring)"; p[0].style.transform = ""; });
      });
      renumber();
    }
    function move(r, dir) {
      var rs = rows(), k = rs.indexOf(r), j = k + dir;
      if (j < 0 || j >= rs.length || finished) return;
      flip(function () { if (dir < 0) list.insertBefore(r, rs[j]); else list.insertBefore(rs[j], r); });
      haptic("tick");
      live.textContent = "Moved to position " + (j + 1);
    }
    function select(r) {
      if (finished) return;
      if (selected && selected !== r) selected.classList.remove("selected");
      selected = r && selected !== r ? r : null;
      if (selected) selected.classList.add("selected"); else if (r) r.classList.remove("selected");
    }
    list.addEventListener("click", function (e) {
      if (finished) return;
      var a = e.target.closest(".dl-arrow");
      if (a) { e.stopPropagation(); var r0 = a.closest(".dl-step"); move(r0, +a.dataset.dir); try { a.focus(); } catch (er) {} return; }
      if (e.target.closest(".dl-handle")) return;
      var r = e.target.closest(".dl-step"); if (r && !r._dragged) select(r);
    });
    list.addEventListener("keydown", function (e) {
      var r = e.target.closest && e.target.closest(".dl-step"); if (!r || finished) return;
      if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) { e.preventDefault(); move(r, e.key === "ArrowUp" ? -1 : 1); r.focus(); }
    });
    // drag: press the handle (immediate) or long-press a row for 250 ms
    list.addEventListener("pointerdown", function (e) {
      if (finished || e.button > 0 || e.target.closest(".dl-arrow")) return;
      var r = e.target.closest(".dl-step"); if (!r) return;
      var viaHandle = !!e.target.closest(".dl-handle"), x0 = e.clientX, y0 = e.clientY, started = false, timer = null, lastY = y0, gap = null, offset = 0, scrollT = null;
      r._dragged = false;
      function begin() {
        started = true; r._dragged = true; haptic("tick");
        var rect = r.getBoundingClientRect();
        offset = y0 - rect.top;
        gap = h("li", "dl-gap"); gap.style.height = rect.height + "px";
        list.insertBefore(gap, r);
        r.classList.add("lifted");
        r.style.width = rect.width + "px"; r.style.left = rect.left + "px"; r.style.top = rect.top + "px";
        document.body.appendChild(r);
        if (selected) select(null);
      }
      function onMove(ev) {
        lastY = ev.clientY;
        if (!started) {
          if (viaHandle && Math.abs(ev.clientY - y0) > 3) begin();
          else if (!viaHandle && (Math.abs(ev.clientY - y0) > 8 || Math.abs(ev.clientX - x0) > 8)) { cancel(); return; }
          if (!started) return;
        }
        ev.preventDefault();
        r.style.top = (ev.clientY - offset) + "px";
        var others = rows().filter(function (x) { return x !== r; }), target = null;
        for (var k = 0; k < others.length; k++) { var b = others[k].getBoundingClientRect(); if (ev.clientY < b.top + b.height / 2) { target = others[k]; break; } }
        if ((target && gap.nextSibling !== target) || (!target && list.lastChild !== gap)) {
          flip(function () { if (target) list.insertBefore(gap, target); else list.appendChild(gap); });
          haptic("tick");
          var pos = Array.prototype.indexOf.call(list.children, gap) + 1;
          live.textContent = "Position " + pos;
        }
        autoScroll();
      }
      function autoScroll() {
        clearInterval(scrollT);
        var edge = 70, vh = innerHeight, sp = lastY < edge ? -6 : (lastY > vh - edge - 80 ? 6 : 0);
        if (sp) scrollT = setInterval(function () { scrollBy(0, sp); }, 16);
      }
      function cancel() { clearTimeout(timer); document.removeEventListener("pointermove", onMove); document.removeEventListener("pointerup", onUp); document.removeEventListener("pointercancel", onUp); }
      function onUp() {
        cancel(); clearInterval(scrollT);
        if (!started) return;
        var gr = gap.getBoundingClientRect(), from = r.getBoundingClientRect().top;
        list.insertBefore(r, gap); gap.remove();
        r.classList.remove("lifted"); r.style.width = r.style.left = r.style.top = "";
        if (!reduce) { r.style.transition = "none"; r.style.transform = "translateY(" + (from - r.getBoundingClientRect().top) + "px)"; requestAnimationFrame(function () { r.style.transition = "transform 280ms var(--ease-out)"; r.style.transform = ""; }); }
        renumber(); haptic("tick");
        live.textContent = "Moved to position " + (rows().indexOf(r) + 1);
        setTimeout(function () { r._dragged = false; }, 50);
        void gr;
      }
      if (!viaHandle) timer = setTimeout(begin, 250);
      document.addEventListener("pointermove", onMove, { passive: false }); document.addEventListener("pointerup", onUp); document.addEventListener("pointercancel", onUp);
    });
    function check() {
      if (finished) return;
      finished = true; select(null);
      var rs = rows(), wrongIdx = [];
      rs.forEach(function (x, k) {
        var ok = +x.dataset.i === k;
        x.classList.add(ok ? "right" : "wrongpos");
        if (!ok) { wrongIdx.push(k); x.querySelector(".dl-goes").textContent = "goes " + ordinal(+x.dataset.i + 1); }
      });
      list.classList.add("solved");
      var allRight = !wrongIdx.length;
      var answer = card.steps.map(function (t) { return t.length > 22 ? t.slice(0, 20).replace(/\s+\S*$/, "") + "\u2026" : t; }).join(" \u2192 ");
      var rv = allRight ? null : ctx.missed(card, {});
      if (card.reviewId) ctx.reviewAnswer(card.reviewId, allRight);
      ctx.complete({ xp: allRight ? X.interactivePerfect : 0, perfect: allRight, correct: allRight, detail: { order: rs.map(function (x) { return +x.dataset.i; }) } });
      ctx.setFoot(null);
      var swapped = wrongIdx.length === 2;
      Sheet.show(allRight
        ? { kind: "success", headline: "In order", xp: X.interactivePerfect, body: card.why || ("First " + card.steps[0].toLowerCase() + ", last " + card.steps[card.steps.length - 1].toLowerCase() + "."), onClose: ctx.advance }
        : { kind: "wrong", headline: swapped ? "Close. Two steps swapped" : "Not quite", answer: answer, why: card.why || "", review: !!rv, onClose: ctx.advance });
    }
    renumber();
    var sv = ctx.saved && ctx.saved.done && ctx.saved.result;
    if (sv) {
      var ord = sv.detail && sv.detail.order;
      if (ord) ord.forEach(function (i) { list.appendChild(list.querySelector('[data-i="' + i + '"]')); });
      renumber(); finished = true; list.classList.add("solved");
      rows().forEach(function (x, k) { var ok = +x.dataset.i === k; x.classList.add(ok ? "right" : "wrongpos"); if (!ok) x.querySelector(".dl-goes").textContent = "goes " + ordinal(+x.dataset.i + 1); });
    } else ctx.setFoot({ label: "Check order", style: "primary", enabled: true, onClick: check });
  };

  global.DLSheet = Sheet;
  global.DLHaptic = haptic;

  global.DLCards = { TYPES: TYPES, sheet: Sheet, validateCard: validateCard, validateQuiz: validateQuiz, normalizeTopic: normalizeTopic, render: render, shuffle: shuffle };
})(window);
