// Offline caching is deliberately limited to a small public allowlist. Private
// navigations and URLs containing query strings are always network-only.
const SW_VERSION = "alaminn-v3";
const SHELL_CACHE = `${SW_VERSION}-shell`;
const ASSET_CACHE = `${SW_VERSION}-assets`;
const PAGE_CACHE = `${SW_VERSION}-pages`;
const PUBLIC_PAGES = new Set(["/", "/about", "/expertise", "/projects", "/contact"]);
const SHELL_URLS = [...PUBLIC_PAGES, "/favicon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) =>
    Promise.allSettled(SHELL_URLS.map((url) => cache.add(url)))
  ));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Earlier workers cached all navigation responses, including private HTML
  // and token-bearing URLs. Remove all their caches, not just page caches.
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) =>
      key.startsWith("alaminn-") && !key.startsWith(`${SW_VERSION}-`)
    ).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    if (!url.search && PUBLIC_PAGES.has(url.pathname)) {
      event.respondWith(networkFirst(request));
    } else {
      // Never fall back to cached HTML for private or token-bearing URLs.
      event.respondWith(fetch(request).catch(() => new Response(
        "This page is unavailable offline. Reconnect to continue.",
        { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } }
      )));
    }
    return;
  }

  // Only immutable app assets and explicitly public brand assets are cached.
  // In particular, do not cache arbitrary images, uploads, or query URLs.
  if (!url.search && (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/brand/"))) {
    event.respondWith(cacheFirst(request));
  }
});

async function cacheFirst(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone()).catch(() => {});
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok && !response.redirected) {
      const cache = await caches.open(PAGE_CACHE);
      await cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    return (await caches.match(request)) || (await caches.match("/")) || Response.error();
  }
}
