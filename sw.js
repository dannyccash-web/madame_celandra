// ============================================================
//  Madame Celandra — Service Worker (PWA)
//  Strategy: cache-first for all static assets.
//  API calls to /api/madame are always network-only.
// ============================================================

const CACHE_VERSION = "madame-v2";

// All static assets to pre-cache on install.
// Images are WebP (~100KB each vs ~3MB original PNG).
// The /api/madame endpoint is intentionally excluded — it must
// always hit the network so Claude can give fresh readings.
const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/styles.css",
  "/game.js",
  "/cards.js",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/oracles_spell.mp3",
  "/madame_celandra_start_background.webp",
  "/madame_celandra_question_background.webp",
  "/madame_celandra_select_background.webp",
  "/madame_celandre_logo.webp",
  "/madame_celandre.webp",
  // Card illustrations (WebP, ~100KB each)
  "/tarot card illustrations/abundance.webp",
  "/tarot card illustrations/air.webp",
  "/tarot card illustrations/creation.webp",
  "/tarot card illustrations/death.webp",
  "/tarot card illustrations/destruction.webp",
  "/tarot card illustrations/earth.webp",
  "/tarot card illustrations/famine.webp",
  "/tarot card illustrations/fire.webp",
  "/tarot card illustrations/fortitude.webp",
  "/tarot card illustrations/frailty.webp",
  "/tarot card illustrations/ice.webp",
  "/tarot card illustrations/life.webp",
  "/tarot card illustrations/nourishment.webp",
  "/tarot card illustrations/scarcity.webp",
  "/tarot card illustrations/the_castle.webp",
  "/tarot card illustrations/the_deity.webp",
  "/tarot card illustrations/the_dragon.webp",
  "/tarot card illustrations/the_emperor.webp",
  "/tarot card illustrations/the_empress.webp",
  "/tarot card illustrations/the_hawk.webp",
  "/tarot card illustrations/the_jester.webp",
  "/tarot card illustrations/the_knight.webp",
  "/tarot card illustrations/the_moon.webp",
  "/tarot card illustrations/the_mountain.webp",
  "/tarot card illustrations/the_snake.webp",
  "/tarot card illustrations/the_staff.webp",
  "/tarot card illustrations/the_stars.webp",
  "/tarot card illustrations/the_sun.webp",
  "/tarot card illustrations/the_sword.webp",
  "/tarot card illustrations/the_unknown.webp",
  "/tarot card illustrations/the_witch.webp",
  "/tarot card illustrations/the_wizard.webp",
  "/tarot card illustrations/the_wolf.webp",
  "/tarot card illustrations/time.webp",
  "/tarot card illustrations/water.webp",
];

// ── Install: pre-cache all static assets ──────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      // Use individual adds so one bad URL doesn't block the whole install.
      Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url)))
    ).then(() => self.skipWaiting())
  );
});

// ── Activate: remove old caches ───────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_VERSION)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: cache-first for static, network-only for API ───────
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Always hit the network for the API proxy — readings must be live.
  if (url.pathname.startsWith("/api/")) {
    return; // fall through to network
  }

  // Cache-first for everything else.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      // Not in cache — fetch from network and cache for next time.
      return fetch(event.request).then((response) => {
        if (response.ok || response.type === "opaque") {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then((cache) =>
            cache.put(event.request, clone)
          );
        }
        return response;
      });
    })
  );
});
