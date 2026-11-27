/* Daily Learn v2 art slots (Remy's Lamplight kit). */
window.DL_THEME = {
  lumi: true,  // single flag: set false to remove the Lumi guide everywhere
  mascot: { idle: "art/lumi_idle.svg", cheer: "art/lumi_cheer.svg", thinking: "art/lumi_thinking.svg", sleepy: "art/lumi_sleepy.svg" },
  badge: function (id, earned, dark) { return "art/badge_" + id + (earned ? "" : (dark ? "_locked_dark" : "_locked")) + ".svg"; },
  node: function (state, dark) { return "art/node_" + state + "_" + (dark ? "dark" : "light") + ".svg"; },
  levelUpSheet: { src: "art/levelup_burst_sheet.webp", cols: 6, rows: 4, frames: 24, fps: 20, still: "art/levelup_peak_frame.webp" }
};
