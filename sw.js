
const CACHE_NAME = "commerzo-static-v3";

const APP_BASE = new URL("./", self.registration.scope).pathname;

const APP_FILES = [
  "",
  "index.html",
  "premium.html",
  "admin.html",
  "privacy-policy.html",
  "commerzo-logo.png"
].map(file => new URL(file, self.registration.scope).pathname);

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(names =>
        Promise.all(
          names
            .filter(name =>
              name.startsWith("commerzo-static-") &&
              name !== CACHE_NAME
            )
            .map(name => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(APP_BASE)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(async response => {
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, response.clone());
          }
          return response;
        })
        .catch(async () => {
          return (
            await caches.match(request, { ignoreSearch: true })
          ) || (
            await caches.match(
              new URL("index.html", self.registration.scope).pathname
            )
          );
        })
    );
    return;
  }

  if (["image", "style", "script", "font"].includes(request.destination)) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;

        return fetch(request).then(async response => {
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, response.clone());
          }
          return response;
        });
      })
    );
  }
});
