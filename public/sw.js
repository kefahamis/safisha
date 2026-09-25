/*
 * Zoa offline support, aimed at collectors working through dead zones.
 *
 * - App code (/_next/static) is cached on first use: it's content-hashed, so a
 *   cached copy is always the right one.
 * - The collector screens are network-first; the last good copy is kept so the
 *   route sheet still opens with no signal. Work done offline is queued by the
 *   app in IndexedDB and sent when the connection returns.
 * - Nothing else is cached: account, billing and API responses always come
 *   from the network, and signing out clears the cache (Clear-Site-Data).
 */

const VERSION = "zoa-v1";
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;
const OFFLINE_PAGES = ["/collector", "/collector/map"];

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (!key.startsWith(VERSION)) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname === "/icon.svg" || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(req));
    return;
  }

  if (req.mode === "navigate" && OFFLINE_PAGES.includes(url.pathname)) {
    event.respondWith(networkFirst(req));
  }
});

async function cacheFirst(req) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(req);
    // Only keep real pages, not redirects to the sign-in screen.
    if (res.ok && !res.redirected) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req);
    if (hit) return hit;
    return new Response(
      "<!doctype html><meta name=viewport content='width=device-width'><title>Offline</title>" +
        "<body style='font-family:system-ui;padding:32px;background:#f1f6f4;color:#0f1f1b'>" +
        "<h1>You're offline</h1><p>Open this screen once with a connection and it will work offline after that.</p>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
}
