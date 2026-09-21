(async function () {
  var tries = 0;
  while ((window.__DL_READY || 0) < 4 && tries < 200) {
    await new Promise(function (r) { setTimeout(r, 25); });
    tries++;
  }
  window.DAILY_LEARN_TOPICS = (window.__DL_A || []).concat(window.__DL_B || []);
  window.DAILY_LEARN_META = {
    timezoneNote: "Daily topics use Australia/Sydney calendar dates (YYYY-MM-DD). Same date always maps to the same topic via a deterministic hash.",
    version: "1.0.0"
  };
})();
