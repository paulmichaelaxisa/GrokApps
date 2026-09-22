(async function () {
  var tries = 0;
  while ((window.__DL_READY || 0) < 16 && tries < 400) {
    await new Promise(function (r) { setTimeout(r, 25); });
    tries++;
  }
  window.DAILY_LEARN_TOPICS = window.__DL_TOPICS || [];
  window.DAILY_LEARN_META = {
    timezoneNote: "Streaks use Australia/Sydney calendar dates. Topics are AI-generated when an xAI key is set; curated topics are offline fallback.",
    version: "2.0.0-ai"
  };
})();
