/* Daily Learn — offline shell */
const CACHE = "daily-learn-v8-ai2";
const SHELL = [
  "./", "./index.html", "./styles.css", "./app.js", "./ai.js", "./content.js",
  "./topics/topic-01.js", "./topics/topic-02.js", "./topics/topic-03.js", "./topics/topic-04.js",
  "./topics/topic-05.js", "./topics/topic-06.js", "./topics/topic-07.js", "./topics/topic-08.js",
  "./topics/topic-09.js", "./topics/topic-10.js", "./topics/topic-11.js", "./topics/topic-12.js",
  "./topics/topic-13.js", "./topics/topic-14.js", "./topics/topic-15.js", "./topics/topic-16.js",
  "./manifest.json", "./icons/icon-192.png", "./icons/icon-512.png"
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

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const networked = fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
          return res;
        })
        .catch(() => cached);
      return cached || networked;
    })
  );
});
