// Network-first cache so Just Piano also works offline after the first visit.
const CACHE = "just-piano-v5";
const FILES = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "verified-preview.js",
  "presets.js",
  "piano-worklet.js",
  "icon.svg",
  "manifest.webmanifest",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(FILES))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("just-piano-") && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (e) => {
  if (
    e.request.method !== "GET" ||
    new URL(e.request.url).pathname.startsWith("/__local/") ||
    new URL(e.request.url).origin !== location.origin
  )
    return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request)),
  );
});
