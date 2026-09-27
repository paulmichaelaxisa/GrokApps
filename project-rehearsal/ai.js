(function (global) {
  "use strict";
  var API_URL = "https://api.x.ai/v1/chat/completions";
  var MODEL = "grok-4.5";
  var MOTIVES = {
    board:
      "Helen (CFO) already thinks the forecast is fiction. She wants one number she can defend and will punish ranges and the word directional. Mark (Sponsor) is politically exposed and wants the slip owned by someone else; he will trade scope for a date only if forced. Priya (Ops) knows a dependency is late. She hints, she does not confess, unless asked a precise question. She fears being the person who surprised steering.",
    scope:
      "Dana (Sales VP) is protecting a renewal and a commission. Million-dollar language is a tactic. She frames any no as losing the account. She does not care about the roadmap except as an obstacle. If the PM defends the roadmap, press harder. If the PM surfaces what would stop or slip, get specific and uncomfortable, then yield only to a named decision.",
    owner:
      "Alex, Jamie, and Pat each hope someone else owns the hand-off. They say we'll by reflex. They put their own name on an action only if pinned to one verb, one date, and one person. They are slippery, not hostile. Do not accept we'll, the team, or a pair of names.",
    risk:
      "The pack is green and the chair wants it to stay green. The vendor manager knows a commercial exposure and will minimise it. The tech lead knows a real delivery risk and is afraid of looking alarmist, so they agree the pack is broadly on track unless asked what is not in the RAID. If the PM names the risk without blame, the tech lead confirms a detail. If the PM torches someone, the room closes ranks.",
    resource:
      "The VP of Engineering saying we don't have resources means they are afraid of missing their own quarter. A pitch or a business case bounces. They open only if the PM asks what they are already committed to this quarter and treats that as real. If the PM argues capacity in the abstract, repeat the refusal, shorter each time."
  };
  var hits = [];
  function allowCall() {
    var now = Date.now();
    while (hits.length > 0 && now - hits[0] > 10 * 60 * 1000) hits.shift();
    if (hits.length >= 40) return false;
    hits.push(now);
    return true;
  }
  function clip(value, max) {
    return String(value == null ? "" : value).slice(0, max);
  }
  function sanitize(input) {
    if (!input || typeof input !== "object") return { error: "That request didn't parse." };
    var mode =
      input.mode === "debrief" ? "debrief" : input.mode === "hints" ? "hints" : input.mode === "room" ? "room" : null;
    if (!mode) return { error: "That request didn't parse." };
    var scenario = input.scenario;
    if (!scenario || typeof scenario !== "object") return { error: "Pick a room first." };
    var id = clip(scenario.id, 40).trim();
    if (!id) return { error: "Pick a room first." };
    var rawMessages = Array.isArray(input.messages) ? input.messages : [];
    if (rawMessages.length > 24) {
      return { error: "This rehearsal ran long. Debrief it and start another." };
    }
    var messages = [];
    for (var i = 0; i < rawMessages.length; i++) {
      var message = rawMessages[i];
      if (!message || (message.role !== "user" && message.role !== "assistant")) {
        return { error: "That request didn't parse." };
      }
      var content = clip(message.content, 2000).trim();
      if (!content) continue;
      messages.push({ role: message.role, content: content });
    }
    var mins = Number(scenario.mins);
    return {
      mode: mode,
      scenario: {
        id: id,
        title: clip(scenario.title, 140).trim() || "Rehearsal",
        mins: Number.isFinite(mins) ? Math.min(20, Math.max(1, Math.round(mins))) : 8,
        meeting: clip(scenario.meeting, 140).trim(),
        pressure: clip(scenario.pressure, 400).trim(),
        cast: clip(scenario.cast, 240).trim(),
        win: clip(scenario.win, 240).trim()
      },
      artefacts: clip(input.artefacts, 16000).trim(),
      messages: messages
    };
  }
  function promptFor(input, collective) {
    var scenario = input.scenario;
    var motive =
      MOTIVES[scenario.id] ||
      "Infer two to four people from the artefacts. Give each a hidden motive that the text supports. Quote specific lines, numbers, owners, and gaps. Do not invent facts that contradict the paste. If the paste is thin, say so in character rather than fabricating a log.";
    var artefacts = input.artefacts
