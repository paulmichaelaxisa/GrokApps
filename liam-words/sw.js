/* Liam Words — basic offline shell */
const CACHE = "liam-words-v6";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./art.js",
  "./words.js",
  "./app.js",
  "./manifest.json",
  "./icons/icon.svg",
  "./art/ball.png",
  "./art/ball.webp",
  "./art/bath.png",
  "./art/bath.webp",
  "./art/bird.png",
  "./art/bird.webp",
  "./art/book.png",
  "./art/book.webp",
  "./art/bye.png",
  "./art/bye.webp",
  "./art/car.png",
  "./art/car.webp",
  "./art/cat.png",
  "./art/cat.webp",
  "./art/daddy.png",
  "./art/daddy.webp",
  "./art/dog.png",
  "./art/dog.webp",
  "./art/duck.png",
  "./art/duck.webp",
  "./art/eat.png",
  "./art/eat.webp",
  "./art/finished.png",
  "./art/finished.webp",
  "./art/hat.png",
  "./art/hat.webp",
  "./art/milk.png",
  "./art/milk.webp",
  "./art/more.png",
  "./art/more.webp",
  "./art/mummy.png",
  "./art/mummy.webp",
  "./art/please.png",
  "./art/please.webp",
  "./art/shoes.png",
  "./art/shoes.webp",
  "./art/sleep.png",
  "./art/sleep.webp",
  "./art/truck.png",
  "./art/truck.webp",
  "./art/up.png",
  "./art/up.webp",
  "./art/water.png",
  "./art/water.webp",
  "./audio/ball.mp3",
  "./audio/bath.mp3",
  "./audio/bird.mp3",
  "./audio/book.mp3",
  "./audio/bye.mp3",
  "./audio/car.mp3",
  "./audio/cat.mp3",
  "./audio/daddy.mp3",
  "./audio/dog.mp3",
  "./audio/duck.mp3",
  "./audio/eat.mp3",
  "./audio/finished.mp3",
  "./audio/hat.mp3",
  "./audio/milk.mp3",
  "./audio/more.mp3",
  "./audio/mummy.mp3",
  "./audio/please.mp3",
  "./audio/shoes.mp3",
  "./audio/sleep.mp3",
  "./audio/truck.mp3",
  "./audio/up.mp3",
  "./audio/water.mp3",
  "./signs/ball.mp4",
  "./signs/bath.mp4",
  "./signs/bird.mp4",
  "./signs/book.mp4",
  "./signs/bye.mp4",
  "./signs/car.mp4",
  "./signs/cat.mp4",
  "./signs/daddy.mp4",
  "./signs/dog.mp4",
  "./signs/duck.mp4",
  "./signs/eat.mp4",
  "./signs/finished.mp4",
  "./signs/hat.mp4",
  "./signs/milk.mp4",
  "./signs/more.mp4",
  "./signs/mummy.mp4",
  "./signs/please.mp4",
  "./signs/shoes.mp4",
  "./signs/sleep.mp4",
  "./signs/truck.mp4",
  "./signs/up.mp4",
  "./signs/water.mp4",
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
