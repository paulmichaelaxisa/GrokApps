/* Daily Learn animated-explainer kit (SVG + JS, no video).
 * A lesson "Explain" card carries a declarative scene spec:
 * { kind, title?, particle?, unit?, shape?, items:[{label, icon?, sub?, value?, color?, role?}], steps:[{caption}] }
 * kinds: flow | cycle | chain | bars | morph | timeline | transform | split | merge | stack
 * DLAnim.validate(raw) -> {ok, scene, error}; DLAnim.mount(el, scene, opts) -> controller
 */
(function (global) {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  var W = 360, H = 240;
  var KINDS = {
    flow: [2, 5], cycle: [3, 6], chain: [2, 5], bars: [2, 6], morph: [2, 2],
    timeline: [2, 6], transform: [2, 6], split: [2, 5], merge: [2, 5], stack: [2, 6]
  };
  var COLORS = ["blue", "green", "orange", "pink", "purple", "yellow", "teal", "red", "gray"];
  // Semantic roles (Remy's explainer palette). Theme decides the actual colour.
  var TONES = ["neutral", "highlight", "input", "output", "good", "bad", "emphasis"];
  var COLOR_TO_TONE = { blue: "input", teal: "output", green: "good", red: "bad", purple: "highlight", pink: "highlight", yellow: "emphasis", orange: "emphasis", gray: "neutral" };
  var SHAPES = ["coin_single", "circle", "box", "pill", "person", "document", "gear", "database", "cloud", "lightbulb", "clock", "coin", "book", "server", "globe", "phone", "seed"];
  var ROLES = ["in", "process", "out"];

  function str(v, max) {
    if (typeof v !== "string" && typeof v !== "number") return "";
    var s = String(v).replace(/\s+/g, " ").trim();
    if (s.length > max) s = s.slice(0, max - 1).replace(/\s+\S*$/, "") + "\u2026";
    return s;
  }
  function iconStr(v) {
    var s = str(v, 12);
    if (!s) return "";
    // keep at most 2 grapheme-ish code points (emoji + variation selector / ZWJ sequences)
    var arr = Array.from(s);
    if (arr.length > 8) arr = arr.slice(0, 8);
    return arr.join("");
  }
  function num(v) {
    if (typeof v === "number" && isFinite(v)) return v;
    if (typeof v === "string") {
      var n = parseFloat(v.replace(/[^0-9.\-]/g, ""));
      if (isFinite(n)) return n;
    }
    return null;
  }

  function validate(raw) {
    if (!raw || typeof raw !== "object") return { ok: false, error: "scene not an object" };
    var kind = String(raw.kind || "").toLowerCase().trim();
    if (!KINDS[kind]) return { ok: false, error: "unknown kind " + kind };
    var lim = KINDS[kind];
    if (!Array.isArray(raw.items)) return { ok: false, error: "items missing" };
    var items = [];
    raw.items.forEach(function (it) {
      if (!it || typeof it !== "object") return;
      var label = str(it.label, 34);
      if (!label) return;
      var o = { label: label, icon: iconStr(it.icon), sub: str(it.sub, 40) };
      var v = num(it.value);
      if (v !== null) o.value = Math.max(-1e9, Math.min(1e9, v));
      if (TONES.indexOf(it.tone) >= 0) o.tone = it.tone;
      else if (TONES.indexOf(it.role) >= 0) o.tone = it.role;
      else if (COLOR_TO_TONE[it.color]) o.tone = COLOR_TO_TONE[it.color];
      var shp = String(it.shape || "").toLowerCase().replace(/^ex-/, "");
      if (SHAPES.indexOf(shp) >= 0) o.shape = shp;
      else if (o.icon && EMOJI_TO_SHAPE[o.icon.replace(/\uFE0F/g, "")]) o.shape = EMOJI_TO_SHAPE[o.icon.replace(/\uFE0F/g, "")];
      if (ROLES.indexOf(it.role) >= 0) o.role = it.role;
      items.push(o);
    });
    if (items.length < lim[0]) return { ok: false, error: kind + " needs " + lim[0] + "+ items" };
    if (items.length > lim[1]) items = items.slice(0, lim[1]);
    if (kind === "bars") {
      if (items.some(function (i) { return typeof i.value !== "number"; })) return { ok: false, error: "bars need numeric values" };
      if (items.every(function (i) { return i.value <= 0; })) return { ok: false, error: "bars need a positive value" };
    }
    var steps = [];
    var rawSteps = Array.isArray(raw.steps) ? raw.steps : (Array.isArray(raw.captions) ? raw.captions : (Array.isArray(raw.narration) ? raw.narration : []));
    if (!rawSteps.length) {
      // tolerate captions placed on items: use them as one step per item
      rawSteps = raw.items.map(function (it) { return it && (it.caption || it.narration) ? { caption: it.caption || it.narration } : null; }).filter(Boolean);
    }
    rawSteps.forEach(function (s) {
      var c = str(typeof s === "string" ? s : s && (s.caption || s.text || s.narration || s.label), 110);
      if (c) steps.push({ caption: c });
    });
    if (!steps.length) {
      // synthesize narration from the items so a good scene isn't thrown away
      steps = items.slice(0, 6).map(function (it) {
        var v = typeof it.value === "number" && kind === "bars" ? " \u2014 " + it.value : "";
        return { caption: str(it.label + (it.sub ? ": " + it.sub : "") + v, 110) };
      });
      if (kind === "morph") steps = [{ caption: "Before: " + items[0].label }, { caption: "After: " + items[1].label }];
    }
    if (steps.length > 6) steps = steps.slice(0, 6);
    var scene = {
      kind: kind, items: items, steps: steps,
      title: str(raw.title, 48),
      particle: iconStr(raw.particle) || "",
      unit: str(raw.unit || (raw.items[0] && raw.items[0].unit), 6),
      unitPos: (raw.unitPos || (raw.items[0] && raw.items[0].unitPos)) === "after" ? "after" : "before",
      shape: raw.shape === "pyramid" ? "pyramid" : "flat"
    };
    if (kind === "split" || kind === "merge" || kind === "transform") normalizeRoles(scene);
    assignTones(scene);
    return { ok: true, scene: scene };
  }

  function normalizeRoles(scene) {
    var items = scene.items;
    var has = items.some(function (i) { return i.role; });
    if (!has || scene.kind !== "transform") {
      items.forEach(function (it, i) {
        if (scene.kind === "split") it.role = i === 0 ? "in" : "out";
        else if (scene.kind === "merge") it.role = i === items.length - 1 ? "out" : "in";
        else if (!has) it.role = i === 0 ? "in" : (i === items.length - 1 ? "out" : (items.length > 2 && i === 1 ? "process" : "out"));
      });
    }
    items.forEach(function (it) { if (!it.role) it.role = "in"; });
    if (!items.some(function (i) { return i.role === "in"; })) items[0].role = "in";
    if (!items.some(function (i) { return i.role === "out"; })) items[items.length - 1].role = "out";
    if (items.filter(function (i) { return i.role === "process"; }).length > 1) {
      var seen = false;
      items.forEach(function (i) { if (i.role === "process") { if (seen) i.role = "out"; seen = true; } });
    }
    // keep order: inputs, process, outputs (reveal order)
    var order = { "in": 0, process: 1, out: 2 };
    scene.items = items.map(function (it, i) { return [it, i]; })
      .sort(function (a, b) { return (order[a[0].role] - order[b[0].role]) || (a[1] - b[1]); })
      .map(function (p) { return p[0]; });
    if (scene.items.filter(function (i) { return i.role === "in"; }).length > 4) {
      var kept = 0;
      scene.items = scene.items.filter(function (i) { if (i.role !== "in") return true; kept++; return kept <= 4; });
    }
    if (scene.items.filter(function (i) { return i.role === "out"; }).length > 4) {
      var k2 = 0;
      scene.items = scene.items.filter(function (i) { if (i.role !== "out") return true; k2++; return k2 <= 4; });
    }
  }

  // Common emoji that have a matching line sprite in Remy's kit: prefer the sprite (keeps the explainer on-style).
  var EMOJI_TO_SHAPE = {
    "\uD83D\uDCC4": "document", "\uD83D\uDCC3": "document", "\uD83D\uDCDD": "document", "\uD83D\uDCDC": "document",
    "\u2699": "gear", "\uD83D\uDCA1": "lightbulb", "\u23F0": "clock", "\uD83D\uDD52": "clock", "\u23F1": "clock", "\u231B": "clock",
    "\uD83D\uDCD6": "book", "\uD83D\uDCDA": "book", "\uD83D\uDCD5": "book", "\uD83D\uDDA5": "server", "\uD83D\uDCBB": "server",
    "\uD83C\uDF0D": "globe", "\uD83C\uDF0E": "globe", "\uD83C\uDF0F": "globe", "\uD83C\uDF10": "globe",
    "\uD83D\uDCF1": "phone", "\u2601": "cloud", "\uD83C\uDF31": "seed", "\uD83D\uDCB0": "coin", "\uD83E\uDE99": "coin_single",
    "\uD83D\uDC64": "person", "\uD83E\uDDD1": "person", "\uD83D\uDC69": "person", "\uD83D\uDC68": "person", "\uD83D\uDDC4": "database", "\uD83D\uDCBE": "database", "\uD83D\uDCE6": "box",
    "\uD83D\uDCD1": "document", "\uD83E\uDDFE": "document", "\uD83D\uDCCB": "document", "\u2709": "document", "\uD83D\uDCE8": "document", "\uD83D\uDDC2": "document", "\uD83D\uDCC1": "document", "\uD83D\uDCC2": "document", "\uD83D\uDCD7": "book", "\uD83D\uDCD8": "book", "\uD83D\uDCD9": "book", "\uD83D\uDCD3": "book", "\uD83D\uDCD4": "book", "\uD83D\uDCD2": "book", "\uD83D\uDD27": "gear", "\uD83D\uDEE0": "gear", "\uD83D\uDD29": "gear", "\u23F3": "clock", "\u23F2": "clock", "\uD83D\uDD50": "clock", "\uD83D\uDCC5": "clock", "\uD83D\uDDD3": "clock", "\uD83C\uDF27": "cloud", "\u26C5": "cloud", "\uD83C\uDF25": "cloud", "\uD83C\uDF26": "cloud", "\uD83C\uDF2B": "cloud", "\uD83C\uDF30": "seed", "\uD83E\uDED8": "seed", "\uD83C\uDF3E": "seed", "\uD83D\uDCB5": "coin_single", "\uD83D\uDCB2": "coin_single", "\uD83D\uDCB8": "coin_single", "\uD83D\uDCB3": "coin_single", "\uD83D\uDC65": "person", "\uD83D\uDC76": "person", "\uD83E\uDDD2": "person", "\uD83D\uDC67": "person", "\uD83D\uDC66": "person", "\uD83E\uDDD3": "person", "\uD83D\uDC74": "person", "\uD83D\uDC75": "person", "\uD83D\uDE4B": "person", "\uD83E\uDDCD": "person", "\uD83D\uDC64": "person", "\u2328": "server", "\uD83D\uDDB1": "server", "\uD83D\uDCF2": "phone", "\uD83D\uDCDE": "phone", "\u260E": "phone", "\uD83D\uDDC3": "database", "\uD83D\uDCBF": "database", "\uD83D\uDCC0": "database", "\uD83C\uDF81": "box", "\uD83D\uDDF3": "box", "\uD83E\uDDF1": "box", "\uD83D\uDD35": "circle", "\u26AA": "circle", "\uD83D\uDFE3": "circle", "\u2B55": "circle", "\uD83D\uDC8A": "pill", "\uD83E\uDDE0": "lightbulb", "\uD83D\uDD26": "lightbulb", "\uD83C\uDF10": "globe", "\uD83D\uDDFA": "globe"
  };
  function assignTones(scene) {
    var it = scene.items, n = it.length, k = scene.kind;
    var hl = 0;
    it.forEach(function (x, i) {
      if (x.tone) return;
      var t = "neutral";
      if (k === "flow") t = i === 0 ? "input" : (i === n - 1 ? "output" : "neutral");
      else if (k === "chain") t = i === 0 ? "input" : (i === n - 1 ? "output" : "neutral");
      else if (k === "morph") t = i === 0 ? "bad" : "good";
      else if (k === "bars") t = i === n - 1 ? "good" : "neutral";
      else if (k === "timeline") t = i === n - 1 ? "highlight" : "neutral";
      else if (k === "cycle") t = i === 0 ? "input" : "neutral";
      else if (k === "stack") t = ["input", "neutral", "output", "neutral", "highlight", "neutral"][i % 6];
      else if (x.role) t = x.role === "in" ? "input" : (x.role === "out" ? "output" : "highlight");
      x.tone = t;
    });
    // at most one highlight and one emphasis
    var seen = {};
    it.forEach(function (x) { if (x.tone === "highlight" || x.tone === "emphasis") { if (seen[x.tone]) x.tone = "neutral"; seen[x.tone] = 1; } });
    void hl;
  }
  function toneStyle(item) {
    var t = (item && item.tone) || "neutral";
    return "--c-s:var(--ex-" + t + ");--c-f:var(--ex-" + t + "-fill)";
  }
  function ensureSprite() {
    if (document.getElementById("ex-sprite-host")) return;
    var src = global.DL_EX_SPRITE;
    if (!src) return;
    var d = document.createElement("div");
    d.id = "ex-sprite-host"; d.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
    d.setAttribute("aria-hidden", "true");
    d.innerHTML = src;
    document.body.insertBefore(d, document.body.firstChild);
  }
  // Draw an item's visual: a sprite shape (preferred) or a tinted disc with an emoji / number.
  function glyph(parent, x, y, it, r, fallbackText) {
    if (it.shape && global.DL_EX_SPRITE) {
      var u = el("use", { href: "#ex-" + it.shape, x: x - r * 1.15, y: y - r * 1.15, width: r * 2.3, height: r * 2.3, style: toneStyle(it), "class": "ak-shape" }, parent);
      u.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", "#ex-" + it.shape);
      return u;
    }
    el("circle", { cx: x, cy: y, r: r, "class": "ak-disc", style: toneStyle(it) }, parent);
    if (it.icon) icon(parent, x, y, it.icon, r * 0.95);
    else if (fallbackText) label(parent, x, y + r * 0.28, fallbackText, { size: r * 0.8, weight: 700 });
  }

  // ---------- SVG helpers ----------
  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    if (attrs) for (var k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function wrap(text, maxChars) {
    var words = String(text).split(" "), lines = [], cur = "";
    words.forEach(function (w) {
      if (!cur) cur = w;
      else if ((cur + " " + w).length <= maxChars) cur += " " + w;
      else { lines.push(cur); cur = w; }
    });
    if (cur) lines.push(cur);
    if (lines.length > 2) {
      lines = [lines[0], lines.slice(1).join(" ")];
      if (lines[1].length > maxChars) lines[1] = lines[1].slice(0, maxChars - 1) + "\u2026";
    }
    return lines;
  }
  function label(parent, x, y, text, opts) {
    opts = opts || {};
    var size = opts.size || 12;
    var lines = wrap(text, opts.chars || 14);
    var t = el("text", {
      x: x, y: y, "text-anchor": opts.anchor || "middle", "font-size": size,
      "font-weight": opts.weight || 600, "class": "ak-label " + (opts.cls || "")
    }, parent);
    lines.forEach(function (ln, i) {
      var ts = el("tspan", { x: x, dy: i === 0 ? 0 : size * 1.2 }, t);
      ts.textContent = ln;
    });
    return t;
  }
  function icon(parent, x, y, text, size) {
    var t = el("text", { x: x, y: y, "text-anchor": "middle", "dominant-baseline": "central", "font-size": size || 22, "class": "ak-icon" }, parent);
    t.textContent = text;
    return t;
  }
  function group(parent, cls, x, y) {
    var g = el("g", { "class": "ak-el " + (cls || "") }, parent);
    if (x !== undefined) g.setAttribute("transform", "translate(" + x + " " + y + ")");
    var inner = el("g", { "class": "ak-pop" }, g);
    return inner;
  }
  function arrowPath(parent, d, cls) {
    var g = el("g", { "class": "ak-el ak-arrow " + (cls || "") }, parent);
    var p = el("path", { d: d, "class": "ak-line", "marker-end": "url(#ak-head)", fill: "none", pathLength: 100 }, g);
    return { g: g, path: p };
  }
  function fmtValue(v, scene) {
    var abs = Math.abs(v);
    var s = abs >= 1e6 ? (v / 1e6).toFixed(abs >= 1e7 ? 0 : 1) + "M" :
      abs >= 1e4 ? Math.round(v / 1e3) + "k" :
      abs >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
    if (!scene.unit) return s;
    return scene.unitPos === "after" ? s + scene.unit : scene.unit + s;
  }

  // ---------- builders: return { beats:[{show:fn(anim)}], loop:fn(t) , particles } ----------
  function nodeCircle(parent, x, y, it, i, r) {
    var g = group(parent, "ak-node", x, y);
    glyph(g, 0, 0, it, r, String(i + 1));
    var lab = label(g, 0, r + 16, it.label, { size: 12, chars: 13 });
    if (it.sub) label(g, 0, r + 16 + (wrap(it.label, 13).length > 1 ? 28 : 14), it.sub, { size: 10, chars: 16, cls: "ak-sub", weight: 500 });
    void lab;
    return g.parentNode;
  }

  function buildFlow(svg, scene) {
    var n = scene.items.length, r = n >= 5 ? 22 : (n <= 3 ? 30 : 26);
    var pad = 42, gap = (W - pad * 2) / (n - 1);
    var beats = [], pts = [], paths = [];
    scene.items.forEach(function (it, i) {
      var x = pad + gap * i, y = (n > 3 ? 104 : 112) + (i % 2 ? 24 : -12) * (n > 3 ? 1 : 0);
      pts.push([x, y]);
    });
    var arrows = el("g", {}, svg), nodes = el("g", {}, svg);
    scene.items.forEach(function (it, i) {
      var node = nodeCircle(nodes, pts[i][0], pts[i][1], it, i, r);
      var beatEls = [node];
      if (i > 0) {
        var a = pts[i - 1], b = pts[i];
        var mx = (a[0] + b[0]) / 2, my = Math.min(a[1], b[1]) - 26;
        var ar = arrowPath(arrows, "M" + (a[0] + r + 2) + " " + a[1] + " Q" + mx + " " + my + " " + (b[0] - r - 6) + " " + b[1]);
        paths.push(ar.path);
        beatEls.unshift(ar.g);
      }
      beats.push({ els: beatEls, path: i > 0 ? paths[paths.length - 1] : null });
    });
    return { beats: beats, flowPaths: paths, particle: scene.particle || scene.items[0].icon || "\u25CF" };
  }

  function buildCycle(svg, scene) {
    var n = scene.items.length, cx = W / 2, cy = 108, R = n > 4 ? 78 : 72, r = 23;
    var pts = scene.items.map(function (_, i) {
      var a = -Math.PI / 2 + i * 2 * Math.PI / n;
      return [Math.max(46, Math.min(W - 46, cx + R * Math.cos(a) * 1.4)), cy + R * Math.sin(a)];
    });
    var arrows = el("g", {}, svg), nodes = el("g", {}, svg), beats = [], paths = [];
    scene.items.forEach(function (it, i) {
      var node = nodeCircle(nodes, pts[i][0], pts[i][1], it, i, r);
      var els = [node];
      var prev = i > 0 ? i - 1 : null;
      if (prev !== null) {
        var ar = cycleArc(arrows, pts[prev], pts[i], cx, cy, r);
        paths.push(ar.path); els.unshift(ar.g);
      }
      if (i === n - 1) {
        var back = cycleArc(arrows, pts[i], pts[0], cx, cy, r);
        paths.push(back.path); els.push(back.g);
      }
      beats.push({ els: els, path: prev !== null ? paths[i - 1] : null });
    });
    var hub = el("g", { "class": "ak-el ak-hub" }, svg);
    if (scene.title) label(hub, cx, cy + 4, scene.title, { size: 10, chars: 14, cls: "ak-sub" });
    beats[beats.length - 1].els.push(hub);
    return { beats: beats, flowPaths: paths, loopAll: true, particle: scene.particle || "\u25CF" };
  }
  function cycleArc(parent, a, b, cx, cy, r) {
    var dx = b[0] - a[0], dy = b[1] - a[1], len = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / len, uy = dy / len;
    var sx = a[0] + ux * (r + 3), sy = a[1] + uy * (r + 3), ex = b[0] - ux * (r + 8), ey = b[1] - uy * (r + 8);
    var mx = (sx + ex) / 2, my = (sy + ey) / 2;
    var ox = mx - cx, oy = my - cy, ol = Math.sqrt(ox * ox + oy * oy) || 1;
    var bulge = 16;
    return arrowPath(parent, "M" + sx + " " + sy + " Q" + (mx + ox / ol * bulge) + " " + (my + oy / ol * bulge) + " " + ex + " " + ey);
  }

  function buildChain(svg, scene) {
    var n = scene.items.length, bw = 196, bh = 36;
    var beats = [], arrows = el("g", {}, svg), boxes = el("g", {}, svg);
    var x0 = 12, x1 = W - bw - 12, y0 = 8, y1 = H - bh - 14;
    scene.items.forEach(function (it, i) {
      var t = n === 1 ? 0 : i / (n - 1);
      var x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      var g = group(boxes, "ak-box ak-drop", x, y);
      el("rect", { x: 0, y: 0, width: bw, height: bh, rx: bh / 2, "class": "ak-card", style: toneStyle(it) }, g);
      var hasG = it.shape || it.icon;
      if (it.shape) glyph(g, 20, bh / 2, it, 10);
      else if (it.icon) icon(g, 20, bh / 2, it.icon, 16);
      var tl = label(g, hasG ? 38 : 16, bh / 2 + 4, it.label, { size: 11.5, chars: 22, anchor: "start" });
      if (wrap(it.label, 22).length > 1) tl.setAttribute("y", bh / 2 - 2);
      var els = [g.parentNode];
      if (i > 0) {
        var pt = (i - 1) / (n - 1), px = x0 + (x1 - x0) * pt, py = y0 + (y1 - y0) * pt;
        var ar = arrowPath(arrows, "M" + (px + 30) + " " + (py + bh + 1) + " Q" + (px + 30) + " " + (y + bh / 2) + " " + (x - 5) + " " + (y + bh / 2));
        els.unshift(ar.g);
      }
      beats.push({ els: els, pushPrev: i > 0 });
    });
    return { beats: beats };
  }

  function buildBars(svg, scene) {
    var n = scene.items.length, base = 196, top = 34, max = 0;
    scene.items.forEach(function (it) { max = Math.max(max, it.value); });
    var gap = W / n, bw = Math.min(46, gap * 0.56), beats = [];
    el("line", { x1: 10, y1: base, x2: W - 10, y2: base, "class": "ak-axis" }, svg);
    scene.items.forEach(function (it, i) {
      var x = gap * i + gap / 2;
      var g = el("g", { "class": "ak-el ak-bar" }, svg);
      var h = Math.max(2, (Math.max(0, it.value) / max) * (base - top));
      var rect = el("rect", { x: x - bw / 2, y: base, width: bw, height: 0, rx: 6, "class": "ak-barfill", style: toneStyle(it) }, g);
      var val = el("text", { x: x, y: base - 6, "text-anchor": "middle", "font-size": 13, "font-weight": 700, "class": "ak-label ak-val" }, g);
      val.textContent = fmtValue(0, scene);
      if (it.shape) glyph(g, x, base + 15, it, 8); else if (it.icon) icon(g, x, base + 15, it.icon, 14);
      label(g, x, base + (it.icon || it.shape ? 36 : 17), it.label, { size: 11, chars: Math.max(8, Math.floor(gap / 6.5)) });
      beats.push({ els: [g], bar: { rect: rect, val: val, h: h, base: base, value: it.value } });
    });
    return { beats: beats };
  }

  function buildMorph(svg, scene) {
    var a = scene.items[0], b = scene.items[1], cx = W / 2;
    var chips = el("g", { "class": "ak-chips" }, svg);
    var c1 = el("g", { "class": "ak-chip on" }, chips), c2 = el("g", { "class": "ak-chip" }, chips);
    el("rect", { x: cx - 92, y: 6, width: 86, height: 24, rx: 12 }, c1);
    label(c1, cx - 49, 22, "Before", { size: 11 });
    el("rect", { x: cx + 6, y: 6, width: 86, height: 24, rx: 12 }, c2);
    label(c2, cx + 49, 22, "After", { size: 11 });
    var stage = el("g", { transform: "translate(" + cx + " 96)" }, svg);
    var ga = el("g", { "class": "ak-morph-a" }, stage), gb = el("g", { "class": "ak-morph-b" }, stage);
    glyph(ga, 0, 0, a, 44, "A");
    glyph(gb, 0, 0, b, 44, "B");
    var la = label(ga, 0, 68, a.label, { size: 14, chars: 26 });
    var lb = label(gb, 0, 68, b.label, { size: 14, chars: 26 });
    if (a.sub) label(ga, 0, 100, a.sub, { size: 11, chars: 34, cls: "ak-sub", weight: 500 });
    if (b.sub) label(gb, 0, 100, b.sub, { size: 11, chars: 34, cls: "ak-sub", weight: 500 });
    var gauge = null;
    if (typeof a.value === "number" && typeof b.value === "number") {
      var gmax = Math.max(Math.abs(a.value), Math.abs(b.value)) || 1;
      var gg = el("g", { "class": "ak-gauge" }, svg);
      el("rect", { x: 60, y: 226, width: 240, height: 8, rx: 4, "class": "ak-track" }, gg);
      var fill = el("rect", { x: 60, y: 226, width: 240 * Math.abs(a.value) / gmax, height: 8, rx: 4, "class": "ak-barfill", style: toneStyle(b) }, gg);
      gauge = { fill: fill, from: 240 * Math.abs(a.value) / gmax, to: 240 * Math.abs(b.value) / gmax };
    }
    void la; void lb;
    return { beats: [{ els: [], morph: 0 }, { els: [], morph: 1 }], morph: { a: ga, b: gb, c1: c1, c2: c2, gauge: gauge } };
  }

  function buildTimeline(svg, scene) {
    var n = scene.items.length, y = 120, x0 = 56, x1 = W - 56;
    el("line", { x1: x0, y1: y, x2: x1, y2: y, "class": "ak-axis ak-time" }, svg);
    var track = el("path", { d: "M" + x0 + " " + y + " L" + x1 + " " + y, fill: "none", stroke: "none" }, svg);
    var beats = [];
    scene.items.forEach(function (it, i) {
      var x = x0 + (x1 - x0) * (n === 1 ? 0.5 : i / (n - 1));
      var up = i % 2 === 0;
      var g = group(svg, "ak-event", x, y);
      el("circle", { r: 7, "class": "ak-dot", style: toneStyle(it) }, g);
      el("line", { x1: 0, y1: up ? -9 : 9, x2: 0, y2: up ? -26 : 26, "class": "ak-tick" }, g);
      var ty = up ? -84 : 34;
      el("rect", { x: -50, y: ty, width: 100, height: 52, rx: 12, "class": "ak-card", style: toneStyle(it) }, g);
      var hasG2 = it.shape || it.icon;
      if (it.shape) glyph(g, -33, ty + 26, it, 9); else if (it.icon) icon(g, -33, ty + 26, it.icon, 16);
      label(g, hasG2 ? 9 : 0, ty + 23, it.label, { size: 10.5, chars: hasG2 ? 11 : 15 });
      if (it.sub) label(g, 0, up ? -100 : 104, it.sub, { size: 11, chars: 16, cls: "ak-date", weight: 700 });
      beats.push({ els: [g.parentNode], marker: (x - x0) / (x1 - x0) });
    });
    return { beats: beats, timeline: { track: track } };
  }

  function buildTransform(svg, scene) {
    var ins = scene.items.filter(function (i) { return i.role === "in"; });
    var proc = scene.items.filter(function (i) { return i.role === "process"; })[0];
    var outs = scene.items.filter(function (i) { return i.role === "out"; });
    var cx = W / 2, cy = 112, beats = [], links = el("g", {}, svg), nodes = el("g", {}, svg);
    var col = function (k, n) { return n === 1 ? cy : 34 + (k * (150 / (n - 1))); };
    var hub = group(nodes, "ak-process", cx, cy);
    var pItem = proc || { tone: "highlight", shape: "gear" };
    if (pItem.shape) glyph(hub, 0, 0, pItem, 32);
    else { el("circle", { r: 34, "class": "ak-disc ak-proc", style: toneStyle(pItem) }, hub); icon(hub, 0, 0, pItem.icon || "\u2699\uFE0F", 30); }
    if (proc) label(hub, 0, 52, proc.label, { size: 12, chars: 16 });
    var idx = 0;
    ins.forEach(function (it, k) {
      var y = col(k, ins.length), x = 40;
      var g = group(nodes, "ak-node", x, y);
      glyph(g, 0, 0, it, 19, "\u2022");
      label(g, 0, 33, it.label, { size: 11, chars: 12 });
      var p = el("path", { d: "M" + (x + 20) + " " + y + " C" + (x + 70) + " " + y + " " + (cx - 70) + " " + cy + " " + (cx - 36) + " " + cy, "class": "ak-line ak-faint", fill: "none" }, links);
      p.parentNode.removeChild(p); var lg = el("g", { "class": "ak-el" }, links); lg.appendChild(p);
      beats.push({ els: [g.parentNode, lg], into: { path: p, icon: it.icon || "\u25CF" } });
      idx++;
    });
    beats.push({ els: [hub.parentNode], spin: hub });
    outs.forEach(function (it, k) {
      var y = col(k, outs.length), x = W - 40;
      var g = group(nodes, "ak-node", x, y);
      glyph(g, 0, 0, it, 19, "\u2022");
      label(g, 0, 33, it.label, { size: 11, chars: 12 });
      var p = el("path", { d: "M" + (cx + 36) + " " + cy + " C" + (cx + 70) + " " + cy + " " + (x - 70) + " " + y + " " + (x - 22) + " " + y, "class": "ak-line ak-faint", fill: "none" }, links);
      p.parentNode.removeChild(p); var lg = el("g", { "class": "ak-el" }, links); lg.appendChild(p);
      beats.push({ els: [lg, g.parentNode], outof: { path: p, icon: it.icon || "\u25CF" } });
      idx++;
    });
    return { beats: beats, transform: true };
  }

  function buildStack(svg, scene) {
    var n = scene.items.length, lh = Math.min(46, 200 / n), base = 120 + (n * lh) / 2 + 4, beats = [];
    scene.items.forEach(function (it, i) {
      var w = scene.shape === "pyramid" ? 300 - (i * (200 / Math.max(1, n - 1))) : 280;
      var x = (W - w) / 2, y = base - (i + 1) * lh;
      var g = group(svg, "ak-layer ak-fall", x, y);
      el("rect", { x: 0, y: 1, width: w, height: lh - 4, rx: 12, "class": "ak-card", style: toneStyle(it) }, g);
      if (it.shape) glyph(g, 20, lh / 2, it, Math.min(11, lh * 0.3)); else if (it.icon) icon(g, 20, lh / 2, it.icon, Math.min(18, lh * 0.55));
      label(g, w / 2, lh / 2 + 4, it.label + (it.sub ? " \u00b7 " + it.sub : ""), { size: Math.min(12, lh * 0.36), chars: Math.floor(w / 7) });
      beats.push({ els: [g.parentNode] });
    });
    return { beats: beats };
  }

  var BUILDERS = {
    flow: buildFlow, cycle: buildCycle, chain: buildChain, bars: buildBars, morph: buildMorph,
    timeline: buildTimeline, transform: buildTransform, split: buildTransform, merge: buildTransform, stack: buildStack
  };

  function reducedMotion() {
    try { return global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; }
  }

  // ---------- player ----------
  function mount(host, scene, opts) {
    opts = opts || {};
    var reduce = opts.reducedMotion != null ? opts.reducedMotion : reducedMotion();
    host.innerHTML = "";
    host.classList.add("ak-player");
    if (reduce) host.classList.add("ak-reduce");
    var lesson = opts.mode !== "preview";
    var stageWrap = document.createElement("div");
    stageWrap.className = "ak-stage";
    if (lesson) {
      stageWrap.setAttribute("role", "button"); stageWrap.tabIndex = 0;
      stageWrap.setAttribute("aria-roledescription", "explainer");
      stageWrap.setAttribute("aria-label", (scene.title || "Animated explanation") + ". Tap or press Enter for the next step, left arrow to go back.");
    }
    host.appendChild(stageWrap);
    var hint = document.createElement("div");
    hint.className = "ak-hint"; hint.setAttribute("aria-hidden", "true");
    hint.innerHTML = '<span class="ak-hint-t">Tap to continue</span><svg viewBox="0 0 12 12" width="12" height="12"><path d="M4 2.5 L7.5 6 L4 9.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var svg = el("svg", { viewBox: "0 0 " + W + " " + H, "class": "ak-svg ak-kind-" + scene.kind, role: "img", "aria-label": scene.title || "Animated explanation" });
    stageWrap.appendChild(svg);
    if (lesson) stageWrap.appendChild(hint);
    var defs = el("defs", {}, svg);
    var mk = el("marker", { id: "ak-head", viewBox: "0 0 12 14", refX: 10, refY: 7, markerWidth: 12, markerHeight: 14, markerUnits: "userSpaceOnUse", orient: "auto-start-reverse" }, defs);
    el("path", { d: "M1 1 L10 7 L1 13", "class": "ak-head", fill: "none" }, mk);
    ensureSprite();
    var layer = el("g", {}, svg);
    var fx = el("g", { "class": "ak-fx" }, svg);
    var built = BUILDERS[scene.kind](layer, scene);
    var beats = built.beats;
    beats.forEach(function (b) { b.els.forEach(function (e) { e.classList.add("ak-hidden"); }); });

    var cap = document.createElement("p");
    cap.className = "ak-caption";
    cap.setAttribute("aria-live", "polite");
    host.appendChild(cap);
    var ctrl = document.createElement("div");
    ctrl.className = "ak-controls";
    ctrl.innerHTML =
      '<button type="button" class="ak-btn ak-back" data-a="back" aria-label="Back one step"><svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M8 2.5 L4.5 6 L8 9.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg> Back</button>' +
      '<div class="ak-mid"><div class="ak-dots"></div><span class="ak-steptxt"></span></div>' +
      '<button type="button" class="ak-btn ak-replay" data-a="replay" aria-label="Replay this step"><span aria-hidden="true">\u21BB</span> Replay</button>';
    host.appendChild(ctrl);
    var dots = ctrl.querySelector(".ak-dots");
    scene.steps.forEach(function (_, i) {
      var d = document.createElement("button");
      d.type = "button"; d.className = "ak-dot-btn"; d.setAttribute("aria-label", "Step " + (i + 1));
      d.tabIndex = -1;
      d.addEventListener("click", function (e) { e.stopPropagation(); stop(); jump(i); });
      dots.appendChild(d);
    });

    var S = scene.steps.length, B = beats.length;
    var stepBeats = scene.steps.map(function (_, k) { return Math.min(B, Math.ceil((k + 1) * B / S)); });
    if (scene.kind === "morph") stepBeats = scene.steps.map(function (_, k) { return S === 1 ? 2 : (k < Math.ceil(S / 2) ? 1 : 2); });
    var shown = 0, cur = -1, timer = null, raf = null, playing = false, destroyed = false, particles = [], finished = false;
    var gen = 0, stepEnd = 0, hintTimer = null;
    var STEP_MS = reduce ? 0 : (scene.kind === "bars" || scene.kind === "morph" ? 1000 : 1150);
    var durations = scene.steps.map(function (s) { return Math.max(1200, Math.min(2600, 500 + s.caption.length * 38)); });
    var total = durations.reduce(function (a, b) { return a + b; }, 0);
    var scale = total < 3000 ? 3000 / total : (total > 8000 ? 8000 / total : 1);
    durations = durations.map(function (d) { return d * scale; });

    function reveal(b, animate) {
      b.els.forEach(function (e) { e.classList.remove("ak-hidden"); if (animate) { e.classList.remove("ak-in"); void e.getBBox; e.classList.add("ak-in"); } });
      if (b.bar) tween(b.bar, animate);
      if (b.morph != null && built.morph) setMorph(b.morph, animate);
      if (animate && !reduce) {
        if (b.path && built.flowPaths) shoot(b.path, built.particle, 900, 2);
        if (b.into) shoot(b.into.path, b.into.icon, 1100, 1, 16, "input");
        if (b.outof) shoot(b.outof.path, b.outof.icon, 1100, 1, 16, "output");
        emphasize(b);
        if (b.spin) pulse(b.spin);
        if (b.pushPrev) nudgePrev(b);
        if (b.marker != null && built.timeline) moveMarker(b.marker);
      } else if (b.marker != null && built.timeline) placeMarker(b.marker);
    }
    function hide(b) {
      b.els.forEach(function (e) { e.classList.add("ak-hidden"); e.classList.remove("ak-in"); });
      if (b.bar) { b.bar.rect.setAttribute("height", 0); b.bar.rect.setAttribute("y", b.bar.base); b.bar.val.textContent = fmtValue(0, scene); b.bar.val.setAttribute("y", b.bar.base - 6); }
    }
    function tween(bar, animate) {
      var dur = animate && !reduce ? 900 : 0, t0 = performance.now(), g0 = gen;
      function f(now) {
        if (g0 !== gen && dur) return;
        var t = dur ? Math.min(1, (now - t0) / dur) : 1, e = 1 - Math.pow(1 - t, 3);
        var h = bar.h * e;
        bar.rect.setAttribute("height", h); bar.rect.setAttribute("y", bar.base - h);
        bar.val.setAttribute("y", bar.base - h - 6);
        bar.val.textContent = fmtValue(bar.value * e, scene);
        if (t < 1 && !destroyed) requestAnimationFrame(f);
      }
      if (dur) requestAnimationFrame(f); else f(t0);
    }
    function setMorph(state, animate) {
      var m = built.morph;
      m.a.classList.toggle("ak-gone", state === 1);
      m.b.classList.toggle("ak-gone", state !== 1);
      m.c1.classList.toggle("on", state !== 1);
      m.c2.classList.toggle("on", state === 1);
      if (m.gauge) {
        var from = parseFloat(m.gauge.fill.getAttribute("width")), to = state === 1 ? m.gauge.to : m.gauge.from;
        var dur = animate && !reduce ? 900 : 0, t0 = performance.now(), g0 = gen;
        var f = function (now) {
          if (g0 !== gen && dur) return;
          var t = dur ? Math.min(1, (now - t0) / dur) : 1, e = 1 - Math.pow(1 - t, 3);
          m.gauge.fill.setAttribute("width", from + (to - from) * e);
          if (t < 1 && !destroyed) requestAnimationFrame(f);
        };
        if (dur) requestAnimationFrame(f); else f(t0);
      }
      if (animate && !reduce) {
        var target = state === 1 ? m.b : m.a;
        target.classList.remove("ak-morph-in"); void target.getBBox; target.classList.add("ak-morph-in");
      }
    }
    // one gentle emphasis bump on the newest item of a beat (Remy: scale 1 -> 1.08 -> 1 + halo, 900 ms)
    function emphasize(b) {
      var target = null;
      for (var i = b.els.length - 1; i >= 0; i--) { if (!b.els[i].classList.contains("ak-arrow")) { target = b.els[i]; break; } }
      if (!target) return;
      var g0 = gen;
      setTimeout(function () {
        if (destroyed || g0 !== gen) return;
        target.classList.remove("ak-emph"); void target.getBBox; target.classList.add("ak-emph");
      }, 380);
    }
    function pulse(g) { g.classList.remove("ak-spin"); void g.getBBox; g.classList.add("ak-spin"); }
    function nudgePrev(b) {
      var i = beats.indexOf(b);
      var prev = beats[i - 1] && beats[i - 1].els[beats[i - 1].els.length - 1];
      if (prev) { prev.classList.remove("ak-nudge"); void prev.getBBox; prev.classList.add("ak-nudge"); }
    }
    var marker = null;
    function ensureMarker() {
      if (marker) return marker;
      marker = el("g", { "class": "ak-marker" }, fx);
      el("circle", { r: 10, "class": "ak-marker-disc" }, marker);
      icon(marker, 0, 0, scene.particle || "\u23F1\uFE0F", 12);
      marker._p = 0;
      return marker;
    }
    function placeMarker(p) {
      var m = ensureMarker(), L = built.timeline.track.getTotalLength(), pt = built.timeline.track.getPointAtLength(L * p);
      m.setAttribute("transform", "translate(" + pt.x + " " + pt.y + ")"); m._p = p;
    }
    function moveMarker(p) {
      var m = ensureMarker(), from = m._p, t0 = performance.now(), dur = 800, g0 = gen;
      var f = function (now) {
        if (g0 !== gen) return;
        var t = Math.min(1, (now - t0) / dur), e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        placeMarker(from + (p - from) * e);
        if (t < 1 && !destroyed) requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    }
    function token(glyphText, size, tone) {
      if (glyphText && scene.particle) { var t = icon(fx, 0, 0, glyphText, size || 13); t.classList.add("ak-particle"); return t; }
      var c = el("circle", { r: 6, "class": "ak-particle ak-token", style: toneStyle({ tone: tone || "emphasis" }) }, fx);
      return c;
    }
    function shoot(path, glyphText, dur, count, size, tone) {
      for (var k = 0; k < count; k++) {
        var g = token(scene.particle ? glyphText : null, size, tone);
        particles.push({ g: g, path: path, len: path.getTotalLength(), t0: performance.now() + k * 220, dur: dur, once: true });
      }
      loop();
    }
    function startAmbient() {
      if (reduce || !built.flowPaths || !built.flowPaths.length) return;
      built.flowPaths.forEach(function (p, i) {
        if (built.loopAll && i > 0) return; // one token travels a loop
        var g = token(scene.particle ? built.particle : null, 13);
        particles.push({ g: g, path: p, len: p.getTotalLength(), t0: performance.now() + i * 300, dur: built.loopAll ? 1600 : 1400, loop: true, loops: 0, maxLoops: built.loopAll ? 2 * built.flowPaths.length : 2, chain: built.loopAll ? built.flowPaths : null, ci: i });
      });
      loop();
    }
    function loop() {
      if (raf) return;
      var f = function (now) {
        raf = null;
        if (destroyed) return;
        particles = particles.filter(function (p) {
          var t = (now - p.t0) / p.dur;
          if (t < 0) { p.g.setAttribute("opacity", 0); return true; }
          if (t >= 1) {
            if (p.loop && ++p.loops >= p.maxLoops) { p.g.remove(); return false; }
            if (p.loop) {
              p.t0 = now;
              if (p.chain) { p.ci = (p.ci + 1) % p.chain.length; p.path = p.chain[p.ci]; p.len = p.path.getTotalLength(); }
              t = 0;
            } else { p.g.remove(); return false; }
          }
          var pt = p.path.getPointAtLength(p.len * t);
          p.g.setAttribute("transform", "translate(" + pt.x + " " + pt.y + ")");
          p.g.setAttribute("opacity", Math.min(1, Math.min(t, 1 - t) * 6));
          return true;
        });
        if (particles.length) raf = requestAnimationFrame(f);
      };
      raf = requestAnimationFrame(f);
    }
    function clearParticles() { particles.forEach(function (p) { p.g.remove(); }); particles = []; }

    function go(k, animate) {
      if (k < 0 || k >= S) return;
      var target = stepBeats[k];
      if (scene.kind === "morph") {
        beats.forEach(function () {});
        setMorph(target === 2 ? 1 : 0, animate && k !== cur);
      } else {
        if (target < shown) { clearParticles(); for (var i = shown - 1; i >= target; i--) hide(beats[i]); shown = target; if (k < S - 1) finishedOff(); }
        for (var j = shown; j < target; j++) reveal(beats[j], animate);
        shown = target;
      }
      cur = k;
      cap.textContent = scene.steps[k].caption;
      cap.classList.remove("ak-cap-in"); void cap.offsetWidth; cap.classList.add("ak-cap-in");
      Array.prototype.forEach.call(dots.children, function (d, i) { d.classList.toggle("on", i <= k); d.classList.toggle("cur", i === k); });
      ctrl.querySelector(".ak-steptxt").textContent = "Step " + (k + 1) + " of " + S;
      ctrl.querySelector('[data-a="back"]').disabled = k === 0;
      stepEnd = animate && !reduce ? performance.now() + STEP_MS : 0;
      showHint(animate ? STEP_MS : 0);
      if (opts.onStep) opts.onStep({ index: k, count: S, done: !animate || reduce, last: k === S - 1 });
      if (k === S - 1 && !finished) {
        finished = true;
        setTimeout(function () { if (!destroyed && cur === S - 1) startAmbient(); }, 900);
        if (opts.onComplete) opts.onComplete();
      }
    }
    // ---- lesson mode (Remy's player.js semantics): tap = next, tap mid-step = skip to its end, back, replayStep ----
    function stripAnim() {
      gen++; clearParticles();
      Array.prototype.forEach.call(svg.querySelectorAll(".ak-in,.ak-emph,.ak-nudge,.ak-spin,.ak-morph-in"), function (e) {
        e.classList.remove("ak-in", "ak-emph", "ak-nudge", "ak-spin", "ak-morph-in");
      });
      host.classList.add("ak-snap");
      requestAnimationFrame(function () { requestAnimationFrame(function () { host.classList.remove("ak-snap"); }); });
    }
    function rewindTo(k) { // instant end state of step k (k = -1 -> empty)
      var target = k < 0 ? 0 : stepBeats[k];
      if (scene.kind === "morph") { setMorph(target === 2 ? 1 : 0, false); }
      else {
        for (var i = shown - 1; i >= 0; i--) hide(beats[i]);
        shown = 0;
        for (var j = 0; j < target; j++) reveal(beats[j], false);
        shown = target;
      }
    }
    function snapStep() { var k = cur; stripAnim(); rewindTo(k); stepEnd = 0; showHint(0); if (opts.onStep) opts.onStep({ index: k, count: S, done: true, last: k === S - 1 }); }
    function jump(k) { if (k === cur) return; stripAnim(); if (k < cur) { rewindTo(k); cur = k - 1 < -1 ? -1 : k; go(k, false); } else { rewindTo(k - 1); go(k, true); } }
    function back() { stop(); if (cur <= 0) return; stripAnim(); rewindTo(cur - 1); go(cur - 1, false); }
    function replayStep() { stop(); var k = cur; stripAnim(); rewindTo(k - 1); if (k === 0) { shown = 0; } cur = k - 1; go(k, true); }
    function next() {
      if (stepEnd && performance.now() < stepEnd) { stop(); snapStep(); return "skipped"; }
      stop();
      if (cur < S - 1) { go(cur + 1, true); return "next"; }
      if (opts.onDone) opts.onDone();
      return "done";
    }
    function showHint(delay) {
      if (!lesson) return;
      clearTimeout(hintTimer);
      hint.classList.remove("on");
      hintTimer = setTimeout(function () {
        if (destroyed) return;
        placeHint();
        hint.querySelector(".ak-hint-t").textContent = cur === S - 1 ? "Done" : "Tap to continue";
        hint.classList.toggle("last", cur === S - 1);
        hint.classList.add("on");
      }, (delay || 0) + 400);
    }
    // keep the hint out of the way: if the scene has content in the top-right corner, dock it bottom-right
    function placeHint() {
      var r = stageWrap.getBoundingClientRect(); if (!r.width) return;
      var zone = { l: r.left + r.width * 0.56, t: r.top, r: r.right, b: r.top + Math.max(46, r.height * 0.2) };
      var busy = Array.prototype.some.call(svg.querySelectorAll(".ak-el:not(.ak-hidden), .ak-chip, .ak-morph-a, .ak-morph-b"), function (e) {
        if (e.classList.contains("ak-gone")) return false;
        var b = e.getBoundingClientRect();
        return b.width > 0 && b.right > zone.l && b.left < zone.r && b.bottom > zone.t && b.top < zone.b;
      });
      hint.classList.toggle("ak-hint-bottom", busy);
    }
    function finishedOff() { finished = false; clearParticles(); }
    function stop() { playing = false; clearTimeout(timer); host.classList.remove("ak-playing"); }
    function tick() {
      if (!playing || destroyed) return;
      if (cur >= S - 1) { stop(); return; }
      go(cur + 1, true);
      timer = setTimeout(tick, durations[cur]);
    }
    function play() {
      if (reduce) { go(Math.max(0, cur), false); return; }
      playing = true; host.classList.add("ak-playing");
      timer = setTimeout(tick, durations[Math.max(0, cur)]);
    }
    function replay() {
      stop(); clearParticles(); finished = false;
      for (var i = shown - 1; i >= 0; i--) hide(beats[i]);
      shown = 0; cur = -1;
      if (built.morph) setMorph(0, false);
      go(0, true); if (opts.autoplay === true) play();
    }
    ctrl.addEventListener("click", function (e) {
      var b = e.target.closest("[data-a]");
      if (!b) return;
      var a = b.getAttribute("data-a");
      e.stopPropagation();
      if (a === "back") back();
      else if (a === "replay") { if (lesson) replayStep(); else replay(); }
    });
    stageWrap.addEventListener("click", function () { if (lesson) next(); else { stop(); if (cur < S - 1) go(cur + 1, true); } });
    if (lesson) stageWrap.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); back(); }
    });

    go(0, !reduce);
    if (opts.autoplay === true) play();  // default: tap per step (Remy); autoplay is a setting

    return {
      replay: replay, stop: stop, go: function (k) { stop(); jump(k); },
      next: next, back: back, replayStep: replayStep, play: play,
      get index() { return cur; }, get total() { return S; },
      get step() { return cur; }, steps: S,
      destroy: function () { destroyed = true; stop(); clearTimeout(hintTimer); clearParticles(); if (raf) cancelAnimationFrame(raf); }
    };
  }

  // HTML helper for cards: an inline sprite glyph (<svg><use>) tinted by tone role.
  function shapeSvg(shape, tone, size) {
    ensureSprite();
    var t = TONES.indexOf(tone) >= 0 ? tone : "highlight";
    return '<svg class="dl-glyph" viewBox="0 0 64 64" width="' + (size || 36) + '" height="' + (size || 36) + '" aria-hidden="true" style="--c-s:var(--ex-' + t + ');--c-f:var(--ex-' + t + '-fill)"><use href="#ex-' + shape + '"/></svg>';
  }
  function shapeFor(v) {
    var x = String(v || "").toLowerCase().replace(/^ex-/, "");
    if (SHAPES.indexOf(x) >= 0) return x;
    return EMOJI_TO_SHAPE[String(v || "").replace(/\uFE0F/g, "")] || null;
  }
  global.DLAnim = { validate: validate, mount: mount, KINDS: Object.keys(KINDS), COLORS: COLORS, SHAPES: SHAPES, shapeSvg: shapeSvg, shapeFor: shapeFor };
})(typeof window !== "undefined" ? window : this);
