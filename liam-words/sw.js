/* Liam Words — basic offline shell */
const CACHE = "liam-words-v4";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./art.js",
  "./words.js",
  "./app.js",
  "./manifest.json",
  "./icons/icon.svg",
  "./art/mummy.webp",
  "./art/mummy.png",
  "./art/daddy.webp",
  "./art/daddy.png",
  "./art/milk.webp",
  "./art/milk.png",
  "./art/more.webp",
  "./art/more.png",
  "./art/ball.webp",
  "./art/ball.png",
  "./art/dog.webp",
  "./art/dog.png",
  "./art/water.webp",
  "./art/water.png",
  "./art/bye.webp",
  "./art/bye.png",
  "./art/eat.webp",
  "./art/eat.png",
  "./art/book.webp",
  "./art/book.png",
  "./art/car.webp",
  "./art/car.png",
  "./art/sleep.webp",
  "./art/sleep.png",
  "./audio/mummy.mp3",
  "./audio/daddy.mp3",
  "./audio/milk.mp3",
  "./audio/more.mp3",
  "./audio/ball.mp3",
  "./audio/dog.mp3",
  "./audio/water.mp3",
  "./audio/bye.mp3",
  "./audio/eat.mp3",
  "./audio/book.mp3",
  "./audio/car.mp3",
  "./audio/sleep.mp3",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
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
  if (req.method !== "GET") return;
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetched = fetch(req)
        .then((res) => {
          if (res && res.ok && new URL(req.url).origin === self.location.origin) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(req, clone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetched;
    })
  );
});
