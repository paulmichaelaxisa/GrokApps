const CACHE="project-rehearsal-v11";
const ASSETS=["./","./index.html","./styles.css","./manifest.json","./icons/icon.svg","./ai.p0.js","./ai.p1.js","./ai.p2.js","./ai.p3.js","./ai.p4.js","./ai.p5.js","./ai.js","./app.p0.js","./app.p1.js","./app.p2.js","./app.p3.js","./app.p4.js","./app.p5.js","./app.p6.js","./app.p7.js","./app.p8.js","./app.js"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener("fetch",e=>{const req=e.request;if(req.method!=="GET")return;const url=new URL(req.url);if(url.origin!==self.location.origin)return;e.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy));return res;}).catch(()=>cached)));});
