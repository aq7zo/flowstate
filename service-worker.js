const CACHE_NAME = "flowstate-v1";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/tokens.css",
  "./css/base.css",
  "./css/components.css",
  "./css/animations.css",
  "./js/main.js",
  "./js/db.js",
  "./js/router.js",
  "./js/state.js",
  "./js/modules/tasks.js",
  "./js/modules/planner.js",
  "./js/modules/pomodoro.js",
  "./js/modules/backup.js",
  "./js/modules/calendar.js",
  "./js/modules/templates.js",
  "./js/modules/integrations.js",
  "./js/modules/settings.js",
  "./js/utils/dates.js",
  "./js/utils/audio.js",
  "./js/utils/notifications.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => Promise.resolve()),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match("./index.html"));
    }),
  );
});
