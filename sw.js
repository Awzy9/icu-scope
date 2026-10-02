// ICU Scope service worker: installable PWA + offline reading.
// - App shell: stale-while-revalidate
// - /data/*.json: network-first, cached copy when offline
// - Cross-origin and non-GET requests (worker, auth, analytics) are never touched.
const VERSION = "v1";
const SHELL_CACHE = `icu-shell-${VERSION}`;
const DATA_CACHE = `icu-data-${VERSION}`;
const SHELL = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "auth.js",
  "manifest.webmanifest",
  "favicon.svg",
  "icon-192.png",
  "icon-512.png",
  "apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE && k !== DATA_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname.includes("/data/")) {
    event.respondWith(networkFirst(req));
    return;
  }
  event.respondWith(staleWhileRevalidate(req));
});

async function networkFirst(req) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req.url.split("?")[0], res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req.url.split("?")[0]);
    if (hit) return hit;
    throw err;
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(SHELL_CACHE);
  const hit = await cache.match(req, { ignoreSearch: true });
  const refresh = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  if (hit) return hit;
  const res = await refresh;
  if (res) return res;
  if (req.mode === "navigate") return cache.match("index.html");
  return Response.error();
}
