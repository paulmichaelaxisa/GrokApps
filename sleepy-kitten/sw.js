/* Sleepy Kitten + voice games: network-first (fresh when online), cache fallback offline */
const CACHE = "sleepy-kitten-v5";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js?v=4",
  "./turns.mjs?v=2",
  "./clips.mjs?v=1",
  "./mic.mjs?v=1",
  "./detector.mjs",
  "./mic-worklet.js?v=1",
  "./games/canvas.mjs?v=1",
  "./games/kitten.mjs?v=2",
  "./games/puppy.mjs?v=2",
  "./games/balloon.mjs?v=2",
  "./games/garden.mjs?v=2",
  "./games/sky.mjs?v=2",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./art/balloon/balloon@2x.png",
  "./art/balloon/balloon_drift_away.png",
  "./art/balloon/balloon_drift_away.webp",
  "./art/balloon/balloon_new_balloon.png",
  "./art/balloon/balloon_new_balloon.webp",
  "./art/balloon/balloon_pop.png",
  "./art/balloon/balloon_pop.webp",
  "./art/balloon/balloon_resting.png",
  "./art/balloon/balloon_resting.webp",
  "./art/balloon/glow_ring.png",
  "./art/balloon/hand@2x.png",
  "./art/garden/bee@2x.png",
  "./art/garden/butterfly@2x.png",
  "./art/garden/garden_resting.png",
  "./art/garden/garden_resting.webp",
  "./art/garden/growth_daisy_sheet.png",
  "./art/garden/growth_lavender_sheet.png",
  "./art/garden/growth_poppy_sheet.png",
  "./art/garden/growth_tulip_sheet.png",
  "./art/garden/soil@2x.png",
  "./art/garden/sparkle.png",
  "./art/kitten_awake_wiggle.png",
  "./art/kitten_awake_wiggle.webp",
  "./art/kitten_curling_up.png",
  "./art/kitten_curling_up.webp",
  "./art/kitten_sleeping.png",
  "./art/kitten_sleeping.webp",
  "./art/kitten_stirring.png",
  "./art/kitten_stirring.webp",
  "./art/kitten_waiting.png",
  "./art/kitten_waiting.webp",
  "./art/puppy/puppy_happy_wag.png",
  "./art/puppy/puppy_happy_wag.webp",
  "./art/puppy/puppy_lying_down.png",
  "./art/puppy/puppy_lying_down.webp",
  "./art/puppy/puppy_sleeping.png",
  "./art/puppy/puppy_sleeping.webp",
  "./art/puppy/puppy_talking.png",
  "./art/puppy/puppy_talking.webp",
  "./art/puppy/puppy_talking_soft.png",
  "./art/puppy/puppy_talking_soft.webp",
  "./art/puppy/puppy_waiting.png",
  "./art/puppy/puppy_waiting.webp",
  "./art/puppy/puppy_waking.png",
  "./art/puppy/puppy_waking.webp",
  "./art/puppy/ripple_left.png",
  "./art/puppy/ripple_right.png",
  "./art/sky/burner_glow.png",
  "./art/sky/cloud_1.png",
  "./art/sky/cloud_2.png",
  "./art/sky/cloud_3.png",
  "./art/sky/hills.png",
  "./art/sky/hills_wide.png",
  "./art/sky/hot_air_balloon@2x.png",
  "./art/sky/sky_cloud_reward.png",
  "./art/sky/sky_cloud_reward.webp",
  "./art/sky/sky_resting.png",
  "./art/sky/sky_resting.webp",
  "./art/sky/sun_glow.png",
  "./art/tabs/tab_big_balloon_alpha.png",
  "./art/tabs/tab_copycat_puppy_alpha.png",
  "./art/tabs/tab_sky_balloon_alpha.png",
  "./art/tabs/tab_sleepy_kitten_alpha.png",
  "./art/tabs/tab_sound_garden_alpha.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.all(ASSETS.map((u) =>
        fetch(new Request(u, { cache: "reload" })).then((res) => { if (res.ok) return cache.put(u, res); }).catch(() => {})
      )))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req, { cache: "no-cache" })
      .then((res) => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(req, clone));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: false }).then((hit) => hit || caches.match(req, { ignoreSearch: true })))
  );
});
