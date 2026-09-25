(function (global) {
  "use strict";

  var API_URL = "https://api.x.ai/v1/chat/completions";
  var MODEL = "grok-4.3";

  function stripFences(text) {
    if (!text || typeof text !== "string") return "";
    var t = text.trim();
    if (t.indexOf("```") === 0) {
      t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    }
    return t.trim();
  }

  function isNonEmptyString(v) {
    return typeof v === "string" && v.trim().length > 0;
  }

  function validateTopic(topic) {
    if (!topic || typeof topic !== "object") return "not an object";
    if (!isNonEmptyString(topic.id)) return "missing id";
    if (!isNonEmptyString(topic.emoji)) return "missing emoji";
    if (!isNonEmptyString(topic.title)) return "missing title";
    if (!isNonEmptyString(topic.blurb)) return "missing blurb";
    if (!Array.isArray(topic.sections) || topic.sections.length !== 3) {
      return "need exactly 3 sections";
    }
    for (var i = 0; i < topic.sections.length; i++) {
      var s = topic.sections[i];
      if (!s || typeof s !== "object") return "section " + i + " invalid";
      if (!isNonEmptyString(s.title)) return "section " + i + " title";
      if (!isNonEmptyString(s.metaphor)) return "section " + i + " metaphor";
      if (!isNonEmptyString(s.explanation)) return "section " + i + " explanation";
      if (!isNonEmptyString(s.example)) return "section " + i + " example";
      var q = s.quiz;
      if (!q || typeof q !== "object") return "section " + i + " quiz";
      if (!isNonEmptyString(q.q)) return "section " + i + " quiz.q";
      if (!Array.isArray(q.choices) || q.choices.length !== 4) {
        return "section " + i + " quiz.choices";
      }
      for (var c = 0; c < 4; c++) {
        if (!isNonEmptyString(q.choices[c])) return "section " + i + " choice " + c;
      }
      if (typeof q.correct !== "number" || q.correct < 0 || q.correct > 3) {
        return "section " + i + " quiz.correct";
      }
      if (!isNonEmptyString(q.why)) return "section " + i + " quiz.why";
    }
    return null;
  }

  function buildPrompt(avoidTitles) {
    var avoid = Array.isArray(avoidTitles) ? avoidTitles.filter(Boolean) : [];
    var avoidBlock = avoid.length
      ? "Do NOT reuse any of these recent titles (pick something different):\n- " + avoid.join("\n- ")
      : "Invent a fresh educational topic.";
    return [
      "Invent one unique educational micro-lesson for curious kids/adults.",
      "Kid-simple language, vivid metaphors, accurate-enough science/tech/life/history/nature topics.",
      "Reply with ONLY valid JSON matching this exact shape (no markdown, no commentary):",
      JSON.stringify({
        id: "kebab-case-slug",
        emoji: "one emoji",
        title: "short catchy title",
        blurb: "one short line teaser",
        sections: [
          {
            title: "section title",
            metaphor: "friendly metaphor",
            explanation: "simple like explaining to a 10-year-old",
            example: "concrete example",
            quiz: {
              q: "clear question",
              choices: ["a", "b", "c", "d"],
              correct: 0,
              why: "short why"
            }
          }
        ]
      }),
      "Rules:",
      "- Exactly 3 sections, each with metaphor, explanation, example, and a 4-choice quiz.",
      "- correct is the 0-based index of the right choice.",
      "- id is a short kebab-case slug unique to this topic.",
      "- Keep each field concise (1–3 sentences).",
      avoidBlock
    ].join("\n");
  }

  function parseTopicFromContent(content) {
    var raw = stripFences(content);
    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      throw new Error("AI response was not valid JSON");
    }
    var err = validateTopic(parsed);
    if (err) throw new Error("AI topic failed validation: " + err);
    return parsed;
  }

  /**
   * @param {{ apiKey: string, avoidTitles?: string[] }} opts
   * @returns {Promise<object>} topic matching DAILY_LEARN_TOPICS shape
   */
  function generateTopic(opts) {
    opts = opts || {};
    var apiKey = (opts.apiKey || "").trim();
    if (!apiKey) return Promise.reject(new Error("missing api key"));

    var body = {
      model: MODEL,
      temperature: 0.9,
      messages: [
        {
          role: "system",
          content:
            "You invent unique educational micro-lessons. Reply with ONLY valid JSON, no markdown."
        },
        {
          role: "user",
          content: buildPrompt(opts.avoidTitles)
        }
      ]
    };

    return fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey
      },
      body: JSON.stringify(body)
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (t) {
          throw new Error("API " + res.status + (t ? ": " + t.slice(0, 180) : ""));
        });
      }
      return res.json();
    }).then(function (data) {
      var content =
        data &&
        data.choices &&
        data.choices[0] &&
        data.choices[0].message &&
        data.choices[0].message.content;
      if (!content) throw new Error("empty AI response");
      return parseTopicFromContent(content);
    });
  }

  global.DailyLearnAI = {
    generateTopic: generateTopic,
    validateTopic: validateTopic,
    MODEL: MODEL
  };
})(typeof window !== "undefined" ? window : self);
