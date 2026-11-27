/* Daily Learn v2: AI lesson generator (xAI chat completions). */
(function (global) {
  "use strict";

  var API_URL = "https://api.x.ai/v1/chat/completions";
  var MODEL = "grok-4.3";
  var TIMEOUT_MS = 120000;

  function stripFences(text) {
    if (!text || typeof text !== "string") return "";
    var t = text.trim();
    if (t.indexOf("```") === 0) t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    var a = t.indexOf("{"), b = t.lastIndexOf("}");
    if (a > 0 && b > a) t = t.slice(a, b + 1);
    return t.trim();
  }

  var SCHEMA_EXAMPLE = {
    id: "kebab-case-slug", emoji: "one emoji", title: "short catchy title (max 6 words)", blurb: "one-line teaser",
    sections: [{
      title: "section title",
      cards: [
        { type: "explain", title: "what the animation shows", text: "1-2 sentence plain summary (used if animation fails)",
          scene: { kind: "transform", title: "optional", particle: "optional emoji that travels",
            items: [{ label: "Sunlight", icon: "\u2600\uFE0F", role: "in", tone: "input" }, { label: "Leaf", icon: "\uD83C\uDF3F", role: "process", tone: "highlight" }, { label: "Sugar", shape: "seed", role: "out", tone: "output" }],
            steps: [{ caption: "Sunlight hits the leaf" }, { caption: "The leaf works like a tiny kitchen" }, { caption: "Out comes sugar food" }] } },
        { type: "reveal", title: "What is X really like?", prompt: "Think of X like\u2026", reveal: "a friendly metaphor", shape: "lightbulb" },
        { type: "match", prompt: "Match each term", pairs: [{ term: "term", meaning: "short meaning" }] },
        { type: "swipe", prompt: "True or false?", statements: [{ text: "statement", answer: true, why: "short reason", shape: "clock" }] },
        { type: "order", prompt: "Put the steps in order", steps: ["first", "second", "third"], why: "one sentence on why this order" },
        { type: "text", text: "short explanation", example: "concrete example" },
        { type: "quiz", q: "question", choices: ["a", "b", "c", "d"], correct: 0, why: "short why" }
      ]
    }],
    boss: [{ q: "question", choices: ["a", "b", "c", "d"], correct: 2, why: "short why" }]
  };

  var KIND_GUIDE = [
    "flow: things moving A -> B -> C (2-5 items; particle = what travels, e.g. \uD83D\uDCA7 or \uD83D\uDCB5).",
    "cycle: a loop that repeats (3-6 items; last returns to first; particle travels around).",
    "chain: cause -> effect dominoes (2-5 items, each causes the next).",
    "bars: quantities growing or compared (2-6 items, each MUST have a plain numeric value). If values are money, percent, kg, etc. ALWAYS set unit (\"$\", \"%\", \"kg\") and unitPos \"before\" ($) or \"after\" (%, kg).",
    "morph: before vs after change (EXACTLY 2 items: before, after; optional numeric value on both shows a gauge).",
    "timeline: events in time (2-6 items, sub = date/time like \"Day 1\" or \"1969\").",
    "transform: inputs -> process -> outputs (2-6 items with role \"in\" | \"process\" | \"out\"; at most 1 process).",
    "split: one thing breaks into parts (first item = whole, rest = parts).",
    "merge: parts combine into one (last item = result).",
    "stack: layers built bottom-up (2-6 items, first = bottom; shape \"pyramid\" optional)."
  ];

  function buildPrompt(opts) {
    var avoid = (opts.avoidTitles || []).filter(Boolean).slice(0, 30);
    var subject = (opts.subject || "").trim();
    return [
      subject
        ? "Create one interactive, animated micro-lesson about: \"" + subject.slice(0, 120) + "\"."
        : "Invent one fresh, surprising educational micro-lesson (science, tech, money, history, nature, body, how things work).",
      "Audience: curious kids and adults. Kid-simple words, vivid, accurate.",
      "SHOW, DON'T TELL: if an idea can be explained by something moving, growing, changing, looping or stacking, use an \"explain\" card with an animated scene instead of words.",
      "Reply with ONLY valid JSON in exactly this shape (no markdown):",
      JSON.stringify(SCHEMA_EXAMPLE),
      "Rules:",
      "- Exactly 3 sections. Each section has 3-5 cards: usually start with an \"explain\" card, then 1-2 interactive cards (reveal, match, swipe, order; pick what fits the idea), and END with one \"quiz\" card.",
      "- Use \"explain\" in at least 2 sections, using at least 2 DIFFERENT scene kinds across the lesson; don't make every scene a flow \u2014 pick the kind that matches the idea (numbers -> bars, change -> morph, dates -> timeline, layers -> stack, causes -> chain, loops -> cycle, ingredients -> transform). Prefer 4 items when the idea allows. For flow and cycle set particle to the thing that travels. Only use \"text\" when nothing can be animated.",
      "- Use each of match, swipe and order at least once across the lesson. reveal is for the metaphor.",
      "- Scene kinds:\n  " + KIND_GUIDE.join("\n  "),
      "- Scene items: label max 3 words (max 14 characters for flow/morph/transform), sub optional (max 20 chars). Give each item a shape from this list whenever one fits (it matches the app's drawing style): coin, coin_single, circle, box, pill, person, document, gear, database, cloud, lightbulb, clock, book, server, globe, phone, seed. Only when none of them fits, use icon = ONE emoji instead. Optional tone from: neutral|highlight|input|output|good|bad|emphasis (meaning roles, not colours: input = things going in, output = results, good/bad = right/wrong or healthy/harmful, highlight = the ONE key thing, emphasis = the ONE moment to notice). Use highlight at most once and emphasis at most once per scene. Colour is never the only cue: the label must say what it is.",
      "- scene.steps is REQUIRED: 3-5 steps, each caption ONE sentence, max 110 characters, in the order the animation reveals items (step 1 shows the first item(s)). The learner taps Next for each step, so each caption should explain exactly what just appeared.",
      "- match: 3-4 pairs (term max 3 words, meaning max 10 words). swipe: 3 statements mixing true and false. order: 3-5 short steps given in the CORRECT order (the app shuffles them) plus why (one sentence). reveal and each swipe statement may take an optional shape from the same list. Every quiz, swipe statement and order needs a short why: wrong answers show it kindly and save the question for Review later.",
      "- quiz: 4 choices, correct = 0-based index of the right choice; vary which index is correct.",
      "- boss: 4 quiz questions covering all sections, slightly harder, correct index varied.",
      avoid.length ? "- Do NOT repeat any of these past topics (pick something clearly different):\n  - " + avoid.join("\n  - ") : ""
    ].filter(Boolean).join("\n");
  }

  // Streams the response (keeps long generations alive on slow/proxied networks) and reports progress.
  function callApi(apiKey, prompt, onProgress) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var to = ctrl ? setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS) : null;
    var done = function () { if (to) clearTimeout(to); };
    return fetch(API_URL, {
      method: "POST",
      signal: ctrl ? ctrl.signal : undefined,
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.8,
        stream: true,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You design interactive, animated micro-lessons for a learning app. You reply with ONLY valid JSON." },
          { role: "user", content: prompt }
        ]
      })
    }).then(function (res) {
      if (!res.ok) return res.text().then(function (t) { done(); throw new Error("API " + res.status + (t ? ": " + t.slice(0, 160) : "")); });
      if (!res.body || !res.body.getReader) {
        return res.text().then(function (t) { done(); return sseToContent(t, null); });
      }
      var reader = res.body.getReader(), dec = new TextDecoder(), buf = "", content = "", thinking = 0;
      function pump() {
        return reader.read().then(function (r) {
          if (r.done) { done(); if (buf) content += sseToContent(buf, null); return content; }
          buf += dec.decode(r.value, { stream: true });
          var nl = buf.lastIndexOf("\n");
          if (nl >= 0) {
            var chunk = buf.slice(0, nl); buf = buf.slice(nl + 1);
            content += sseToContent(chunk, function (n) { thinking += n; });
            if (onProgress) onProgress({ chars: content.length, thinking: thinking });
          }
          return pump();
        });
      }
      return pump();
    }, function (err) { done(); throw err; }).then(function (content) {
      if (!content) throw new Error("empty AI response");
      return content;
    });
  }
  function sseToContent(text, onThinking) {
    var out = "";
    text.split("\n").forEach(function (line) {
      line = line.trim();
      if (line.indexOf("data:") !== 0) return;
      var payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") return;
      try {
        var d = JSON.parse(payload), ch = d.choices && d.choices[0];
        if (!ch) return;
        var delta = ch.delta || ch.message || {};
        if (delta.content) out += delta.content;
        if (delta.reasoning_content && onThinking) onThinking(delta.reasoning_content.length);
      } catch (e) {}
    });
    return out;
  }

  function parse(content) {
    var parsed;
    try { parsed = JSON.parse(stripFences(content)); } catch (e) { throw new Error("AI response was not valid JSON"); }
    var res = global.DLCards.normalizeTopic(parsed);
    if (!res.ok) throw new Error("AI topic failed validation: " + res.error);
    res.topic.source = "ai";
    if (res.warnings && res.warnings.length) res.topic.warnings = res.warnings;
    return res.topic;
  }

  /** opts: { apiKey, avoidTitles?, subject?, onProgress? } -> Promise<v2 topic> */
  function generateTopic(opts) {
    opts = opts || {};
    var apiKey = (opts.apiKey || "").trim();
    if (!apiKey) return Promise.reject(new Error("missing api key"));
    var prompt = buildPrompt(opts);
    return callApi(apiKey, prompt, opts.onProgress).then(parse).catch(function (err) {
      if (/not valid JSON|failed validation/.test(err.message)) return callApi(apiKey, prompt, opts.onProgress).then(parse);
      throw err;
    });
  }

  global.DailyLearnAI = { generateTopic: generateTopic, buildPrompt: buildPrompt, parse: parse, MODEL: MODEL };
})(typeof window !== "undefined" ? window : self);
