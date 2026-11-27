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
      return { type: "reveal", prompt: s(c.prompt, 120) || "Think of it like\u2026", reveal: rv };
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
        return { text: tx, answer: ans, why: s(x.why, 180) };
      }).filter(Boolean);
      if (st.length < 2) return null;
      return { type: "swipe", prompt: s(c.prompt, 100) || "True or false? Swipe or tap", statements: st.slice(0, 4) };
    }
    if (type === "order") {
      var seenS = {};
      var steps = (Array.isArray(c.steps) ? c.steps : []).map(function (x) { return s(typeof x === "string" ? x : x && (x.text || x.label), 80); })
        .filter(function (x) { if (!x || seenS[x.toLowerCase()]) return false; seenS[x.toLowerCase()] = 1; return true; });
      if (steps.length < 3) return null;
      return { type: "order", prompt: s(c.prompt, 100) || "Put the steps in order", steps: steps.slice(0, 5) };
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
    wrap.appendChild(h("div", "dl-kicker", "Read"));
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

  RENDER.reveal = function (card, wrap, ctx) {
    wrap.appendChild(h("div", "dl-kicker", "Tap to reveal"));
    var flip = h("button", "dl-flip");
    flip.type = "button";
    var front = h("div", "dl-face dl-front");
    front.appendChild(h("div", "dl-flip-icon", "\uD83E\uDD14"));
    front.appendChild(h("p", "dl-flip-prompt", card.prompt));
    front.appendChild(h("span", "dl-mini", "Tap the card"));
    var back = h("div", "dl-face dl-back");
    back.appendChild(h("div", "dl-flip-icon", "\uD83D\uDCA1"));
    back.appendChild(h("p", "dl-flip-text", card.reveal));
    flip.appendChild(front); flip.appendChild(back);
    wrap.appendChild(flip);
    var done = ctx.saved && ctx.saved.done;
    if (done) flip.classList.add("flipped");
    flip.addEventListener("click", function () {
      flip.classList.add("flipped");
      if (!done) { done = true; ctx.complete({ xp: global.DLGame.XP.cardRead }); }
    });
  };

  RENDER.explain = function (card, wrap, ctx) {
    wrap.appendChild(h("div", "dl-kicker", "Watch it move"));
    if (card.title) wrap.appendChild(h("h2", "dl-card-title", card.title));
    var host = h("div", "dl-anim");
    wrap.appendChild(host);
    if (card.text) wrap.appendChild(h("p", "dl-body dl-explain-text", card.text));
    var done = ctx.saved && ctx.saved.done;
    var autoplay = false;
    try { autoplay = localStorage.getItem("daily-learn-autoplay") === "1"; } catch (e) {}
    var player = global.DLAnim.mount(host, card.scene, {
      autoplay: autoplay,
      onComplete: function () {
        if (done) return;
        done = true;
        global.DLGame.bump("explainersWatched");
        ctx.complete({ xp: global.DLGame.XP.explainWatched });
      }
    });
    return { destroy: function () { player.destroy(); }, player: player };
  };

  RENDER.quiz = function (card, wrap, ctx) {
    wrap.appendChild(h("div", "dl-kicker", ctx.mode === "boss" ? "Boss question" : "Quick check"));
    wrap.appendChild(h("h2", "dl-card-title dl-q", card.q));
    var list = h("div", "dl-choices");
    wrap.appendChild(list);
    var fb = h("div", "dl-feedback");
    var check = h("button", "btn btn-primary dl-check", "Check answer");
    check.type = "button"; check.disabled = true;
    var sel = null, answered = false;
    var btns = card.choices.map(function (c, i) {
      var b = h("button", "choice", c);
      b.type = "button";
      b.addEventListener("click", function () {
        if (answered) return;
        sel = i;
        btns.forEach(function (x, j) { x.classList.toggle("selected", j === i); });
        check.disabled = false;
      });
      list.appendChild(b);
      return b;
    });
    wrap.appendChild(check);
    wrap.appendChild(fb);
    function show(choice, award) {
      answered = true;
      var ok = choice === card.correct;
      btns.forEach(function (b, j) {
        b.disabled = true;
        if (j === card.correct) b.classList.add("correct");
        if (j === choice && !ok) b.classList.add("wrong");
        if (j === choice) b.classList.add("selected");
      });
      fb.className = "dl-feedback show " + (ok ? "ok" : "bad");
      fb.innerHTML = "";
      fb.appendChild(h("strong", null, ok ? "Nice! " : "Not quite. "));
      fb.appendChild(document.createTextNode(card.why || ""));
      check.hidden = true;
      if (award) {
        var X = global.DLGame.XP;
        var xp = ctx.mode === "boss" ? (ok ? X.bossCorrect : 0) : (ok ? X.quizCorrect : X.quizWrong);
        ctx.complete({ xp: xp, correct: ok, perfect: ok, detail: { choice: choice } });
      }
    }
    check.addEventListener("click", function () { if (sel != null && !answered) show(sel, true); });
    if (ctx.saved && ctx.saved.done && ctx.saved.result && ctx.saved.result.detail) show(ctx.saved.result.detail.choice, false);
  };

  RENDER.match = function (card, wrap, ctx) {
    wrap.appendChild(h("div", "dl-kicker", "Drag to match"));
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
          ctx.complete({ xp: mistakes ? X.interactiveOk : X.interactivePerfect, perfect: !mistakes });
        }
      } else {
        mistakes++;
        var sl = slots[mi].querySelector(".dl-slot"), prev = sl.textContent;
        slots[mi].classList.add("wrong"); sl.textContent = "\u2715 " + card.pairs[ti].term;
        setTimeout(function () { slots[mi].classList.remove("wrong"); if (!matched[mi]) sl.textContent = prev; }, 600);
        [terms[ti], slots[mi]].forEach(function (e) { e.classList.remove("shake"); void e.offsetWidth; e.classList.add("shake"); setTimeout(function () { e.classList.remove("shake"); }, 400); });
        status.textContent = "Not that one \u2014 try again.";
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
    wrap.appendChild(h("div", "dl-kicker", "Swipe true or false"));
    wrap.appendChild(h("h2", "dl-card-title", card.prompt));
    var deck = h("div", "dl-deck");
    wrap.appendChild(deck);
    var counter = h("p", "dl-mini dl-status", "");
    var row = h("div", "dl-swipe-btns");
    var bF = h("button", "btn dl-false", "\u2717 False"); bF.type = "button";
    var bT = h("button", "btn dl-true", "\u2713 True"); bT.type = "button";
    row.appendChild(bF); row.appendChild(bT);
    wrap.appendChild(row);
    var fb = h("div", "dl-feedback");
    wrap.appendChild(fb);
    var nextBtn = h("button", "btn btn-secondary dl-next-st", "Next statement"); nextBtn.type = "button"; nextBtn.hidden = true;
    wrap.appendChild(nextBtn);
    wrap.appendChild(counter);
    var idx = 0, correct = 0, busy = false, results = [];
    var cards = card.statements.map(function (st, i) {
      var c = h("div", "dl-st");
      c.appendChild(h("div", "dl-st-num", (i + 1) + " / " + card.statements.length));
      c.appendChild(h("p", "dl-st-text", st.text));
      c.appendChild(h("div", "dl-st-tag dl-tag-true", "TRUE"));
      c.appendChild(h("div", "dl-st-tag dl-tag-false", "FALSE"));
      c.style.zIndex = 10 - i;
      deck.appendChild(c);
      return c;
    });
    function layout() {
      cards.forEach(function (c, i) {
        var d = i - idx;
        c.classList.toggle("gone", d < 0);
        if (d >= 0) { c.style.transform = "translateY(" + (d * 8) + "px) scale(" + (1 - d * 0.04) + ")"; c.style.opacity = d > 2 ? 0 : 1; }
      });
      counter.textContent = idx < cards.length ? "" : (correct + " / " + cards.length + " right");
    }
    function decide(ans) {
      if (busy || idx >= cards.length) return;
      busy = true;
      var st = card.statements[idx], ok = ans === st.answer, c = cards[idx];
      if (ok) correct++;
      results.push(ok);
      c.style.transition = "transform .35s var(--ease-out), opacity .35s";
      c.style.transform = "translateX(" + (ans ? 420 : -420) + "px) rotate(" + (ans ? 8 : -8) + "deg)";
      c.style.opacity = 0;
      fb.className = "dl-feedback show " + (ok ? "ok" : "bad");
      fb.innerHTML = "";
      fb.appendChild(h("strong", null, (ok ? "Yes! " : "Nope. ") + "It's " + (st.answer ? "true" : "false") + ". "));
      fb.appendChild(document.createTextNode(st.why || ""));
      bF.disabled = bT.disabled = true;
      idx++;
      if (idx >= cards.length) {
        layout();
        ctx.complete({ xp: correct * global.DLGame.XP.swipeCorrect, perfect: correct === cards.length, correct: correct });
        busy = false;
      } else { nextBtn.hidden = false; try { nextBtn.scrollIntoView({ block: "nearest", behavior: "smooth" }); } catch (e) {} }
    }
    nextBtn.addEventListener("click", function () {
      nextBtn.hidden = true; fb.className = "dl-feedback"; busy = false; bF.disabled = bT.disabled = false; layout();
    });
    bF.addEventListener("click", function () { decide(false); });
    bT.addEventListener("click", function () { decide(true); });
    deck.addEventListener("pointerdown", function (e) {
      var c = cards[idx];
      if (!c || busy || !c.contains(e.target)) return;
      var sx = e.clientX, dx = 0;
      c.style.transition = "none";
      try { c.setPointerCapture(e.pointerId); } catch (er) {}
      function mv(ev) {
        dx = ev.clientX - sx;
        c.style.transform = "translateX(" + dx + "px) rotate(" + Math.max(-8, Math.min(8, dx / 14)) + "deg)";
        c.style.setProperty("--tint", Math.min(12, Math.abs(dx) / 8) + "%");
        c.classList.toggle("lean-true", dx > 40); c.classList.toggle("lean-false", dx < -40);
      }
      function up() {
        c.removeEventListener("pointermove", mv); c.removeEventListener("pointerup", up); c.removeEventListener("pointercancel", up);
        c.classList.remove("lean-true", "lean-false");
        if (Math.abs(dx) > 96) decide(dx > 0);
        else { c.style.transition = "transform .25s var(--ease-spring)"; layout(); }
      }
      c.addEventListener("pointermove", mv); c.addEventListener("pointerup", up); c.addEventListener("pointercancel", up);
    });
    layout();
    if (ctx.saved && ctx.saved.done) {
      idx = cards.length; layout(); bF.disabled = bT.disabled = true;
      var list = h("ul", "dl-st-summary");
      card.statements.forEach(function (st) { list.appendChild(h("li", null, (st.answer ? "\u2713 True: " : "\u2717 False: ") + st.text)); });
      deck.replaceWith(list);
      counter.textContent = "Done";
    }
  };

  RENDER.order = function (card, wrap, ctx) {
    wrap.appendChild(h("div", "dl-kicker", "Put in order"));
    wrap.appendChild(h("h2", "dl-card-title", card.prompt));
    wrap.appendChild(h("p", "dl-mini dl-hint", "Drag the handles (or use the arrows), then check."));
    var list = h("ol", "dl-order");
    wrap.appendChild(list);
    var check = h("button", "btn btn-primary dl-check", "Check order"); check.type = "button";
    wrap.appendChild(check);
    var status = h("p", "dl-mini dl-status", "");
    wrap.appendChild(status);
    var tries = 0, finished = false;
    var start = (ctx.saved && ctx.saved.done) ? card.steps.map(function (_, i) { return i; }) : shuffledNotIdentity(card.steps.length);
    start.forEach(function (i) { list.appendChild(row(i)); });
    function row(i) {
      var li = h("li", "dl-step");
      li.dataset.i = i;
      var handle = h("span", "dl-handle", "\u2630");
      var txt = h("span", "dl-step-text", card.steps[i]);
      var up = h("button", "dl-arrow", "\u25B2"); up.type = "button"; up.setAttribute("aria-label", "Move up");
      var dn = h("button", "dl-arrow", "\u25BC"); dn.type = "button"; dn.setAttribute("aria-label", "Move down");
      up.addEventListener("click", function () { if (finished) return; var p = li.previousElementSibling; if (p) { flipMove(function () { list.insertBefore(li, p); }); } });
      dn.addEventListener("click", function () { if (finished) return; var n = li.nextElementSibling; if (n) { flipMove(function () { list.insertBefore(n, li); }); } });
      li.appendChild(handle); li.appendChild(txt); li.appendChild(up); li.appendChild(dn);
      return li;
    }
    function flipMove(mutate) {
      var items = Array.prototype.slice.call(list.children);
      var before = items.map(function (x) { return x.getBoundingClientRect().top; });
      mutate();
      items.forEach(function (x, k) {
        var d = before[k] - x.getBoundingClientRect().top;
        if (!d) return;
        x.style.transition = "none"; x.style.transform = "translateY(" + d + "px)";
        requestAnimationFrame(function () { x.style.transition = "transform .25s var(--ease-out)"; x.style.transform = ""; });
      });
      clearMarks();
    }
    function clearMarks() { Array.prototype.forEach.call(list.children, function (x) { x.classList.remove("right", "wrongpos"); }); }
    list.addEventListener("pointerdown", function (e) {
      var hd = e.target.closest(".dl-handle"); if (!hd || finished) return;
      var li = hd.parentNode; e.preventDefault();
      li.classList.add("lifted");
      var sy = e.clientY;
      function mv(ev) {
        ev.preventDefault();
        li.style.transform = "translateY(" + (ev.clientY - sy) + "px)";
        var sibs = Array.prototype.slice.call(list.children).filter(function (x) { return x !== li; });
        var y = ev.clientY;
        for (var k = 0; k < sibs.length; k++) {
          var r = sibs[k].getBoundingClientRect();
          if (y < r.top + r.height / 2) {
            if (sibs[k] !== li.nextElementSibling) { var before = li.getBoundingClientRect().top; list.insertBefore(li, sibs[k]); sy += li.getBoundingClientRect().top - before; li.style.transform = "translateY(" + (ev.clientY - sy) + "px)"; }
            return;
          }
        }
        if (li !== list.lastElementChild) { var b2 = li.getBoundingClientRect().top; list.appendChild(li); sy += li.getBoundingClientRect().top - b2; li.style.transform = "translateY(" + (ev.clientY - sy) + "px)"; }
      }
      function up() {
        document.removeEventListener("pointermove", mv); document.removeEventListener("pointerup", up); document.removeEventListener("pointercancel", up);
        li.classList.remove("lifted"); li.style.transform = ""; clearMarks();
      }
      document.addEventListener("pointermove", mv, { passive: false });
      document.addEventListener("pointerup", up); document.addEventListener("pointercancel", up);
    });
    check.addEventListener("click", function () {
      if (finished) return;
      tries++;
      var items = Array.prototype.slice.call(list.children), allRight = true;
      items.forEach(function (x, k) { var ok = +x.dataset.i === k; x.classList.toggle("right", ok); x.classList.toggle("wrongpos", !ok); if (!ok) allRight = false; });
      var X = global.DLGame.XP;
      if (allRight) {
        finished = true; list.classList.add("solved"); check.hidden = true;
        status.textContent = tries === 1 ? "Perfect order!" : "Got it!";
        ctx.complete({ xp: tries === 1 ? X.interactivePerfect : X.interactiveOk, perfect: tries === 1 });
      } else if (tries >= 2) {
        status.textContent = "Here's the right order.";
        setTimeout(function () {
          flipMove(function () { card.steps.forEach(function (_, i) { list.appendChild(list.querySelector('[data-i="' + i + '"]')); }); });
          Array.prototype.forEach.call(list.children, function (x) { x.classList.add("right"); });
          finished = true; list.classList.add("solved"); check.hidden = true;
          ctx.complete({ xp: X.cardRead, perfect: false });
        }, 700);
      } else {
        status.textContent = "Green ones are in place. Fix the red ones and check again.";
      }
    });
    if (ctx.saved && ctx.saved.done) { finished = true; list.classList.add("solved"); check.hidden = true; Array.prototype.forEach.call(list.children, function (x) { x.classList.add("right"); }); }
  };

  global.DLCards = { TYPES: TYPES, validateCard: validateCard, validateQuiz: validateQuiz, normalizeTopic: normalizeTopic, render: render, shuffle: shuffle };
})(window);
