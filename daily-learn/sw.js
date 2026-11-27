/* Daily Learn — offline shell */
const CACHE = "daily-learn-v12-2.0.1";
const SHELL = [
  "./", "./index.html", "./fonts.css", "./fonts/fraunces-600-700.woff2", "./fonts/inter.woff2", "./theme.css", "./styles.css", "./anim-kit.css",
  "./theme.js", "./anim-kit.js", "./game.js", "./review.js", "./cards.js", "./ai.js", "./app.js", "./content.js", "./config.js",
  "./topics/animated.js",
  "./topics/topic-01.js", "./topics/topic-02.js", "./topics/topic-03.js", "./topics/topic-04.js",
  "./topics/topic-05.js", "./topics/topic-06.js", "./topics/topic-07.js", "./topics/topic-08.js",
  "./topics/topic-09.js", "./topics/topic-10.js", "./topics/topic-11.js", "./topics/topic-12.js",
  "./topics/topic-13.js", "./topics/topic-14.js", "./topics/topic-15.js", "./topics/topic-16.js",
  "./manifest.json", "./icons/icon.svg",
  "./art/badge_boss_slayer.svg", "./art/badge_boss_slayer_locked.svg", "./art/badge_boss_slayer_locked_dark.svg", "./art/badge_deep_diver.svg", "./art/badge_deep_diver_locked.svg", "./art/badge_deep_diver_locked_dark.svg", "./art/badge_first_lesson.svg", "./art/badge_first_lesson_locked.svg", "./art/badge_first_lesson_locked_dark.svg", "./art/badge_level_10.svg", "./art/badge_level_10_locked.svg", "./art/badge_level_10_locked_dark.svg", "./art/badge_perfect_quiz.svg", "./art/badge_perfect_quiz_locked.svg", "./art/badge_perfect_quiz_locked_dark.svg", "./art/badge_topic_mastered.svg", "./art/badge_topic_mastered_locked.svg", "./art/badge_topic_mastered_locked_dark.svg", "./art/ex-sprite.js", "./art/levelup_burst_sheet.webp", "./art/levelup_peak_frame.webp", "./art/lumi_cheer.svg", "./art/lumi_idle.svg", "./art/lumi_sleepy.svg", "./art/lumi_thinking.svg", "./art/node_boss_dark.svg", "./art/node_boss_light.svg", "./art/node_boss_locked_dark.svg", "./art/node_boss_locked_light.svg", "./art/node_current_dark.svg", "./art/node_current_light.svg", "./art/node_done_dark.svg", "./art/node_done_light.svg", "./art/node_locked_dark.svg", "./art/node_locked_light.svg"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first for the app shell so updates show on the next open; cache is the offline fallback.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
