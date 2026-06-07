// ============================================================
//  Madame Celandra — Service Worker (PWA)
//  Strategy: cache-first for all static assets.
//  API calls to /api/madame are always network-only.
// ============================================================

const CACHE_VERSION = "madame-v1";

// All static assets to pre-cache on install.
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
  "/madame_celandra_start_background.png",
  "/madame_celandra_question_background.png",
  "/madame_celandra_select_background.png",
  "/madame_celandra_table.png",
  "/madame_celandre.png",
  "/madame_celandre_logo.png",
  // Card illustrations
  "/tarot card illustrations/abundance.png",
  "/tarot card illustrations/air.png",
  "/tarot card illustrations/creation.png",
  "/tarot card illustrations/death.png",
  "/tarot card illustrations/destruction.png",
  "/tarot card illustrations/earth.png",
  "/tarot card illustrations/famine.png",
  "/tarot card illustrations/fire.png",
  "/tarot card illustrations/fortitude.png",
  "/tarot card illustrations/frailty.png",
  "/tarot card illustrations/ice.png",
  "/tarot card illustrations/life.png",
  "/tarot card illustrations/nourishment.png",
  "/tarot card illustrations/scarcity.png",
  "/tarot card illustrations/the_castle.png",
  "/tarot card illustrations/the_deity.png",
  "/tarot card illustrations/the_dragon.png",
  "/tarot card illustrations/the_emperor.png",
  "/tarot card illustrations/the_empress.png",
  "/tarot card illustrations/the_hawk.png",
  "/tarot card illustrations/the_jester.png",
  "/tarot card illustrations/the_knight.png",
  "/tarot card illustrations/the_moon.png",
  "/tarot card illustrations/the_mountain.png",
  "/tarot card illustrations/the_snake.png",
  "/tarot card illustrations/the_staff.png",
  "/tarot card illustrations/the_stars.png",
  "/tarot card illustrations/the_sun.png",
  "/tarot card illustrations/the_sword.png",
  "/tarot card illustrations/the_unknown.png",
  "/tarot card illustrations/the_witch.png",
  "/tarot card illustrations/the_wizard.png",
  "/tarot card illustrations/the_wolf.png",
  "/tarot card illustrations/time.png",
  "/tarot card illustrations/water.png",
  // External font (Google Fonts — cache on first use, not pre-cached)
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
        // Only cache valid same-origin or opaque responses.
        if (
          response.ok || response.type === "opaque"
        ) {
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
