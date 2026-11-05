const CACHE_NAME = "commerzo-static-v1";

const APP_PATH = "/commerzo-website/";

const APP_FILES = [
  APP_PATH,
  APP_PATH + "index.html",
  APP_PATH + "premium.html",
  APP_PATH + "admin.html",
  APP_PATH + "privacy-policy.html",
  APP_PATH + "commerzo-logo.png"
];

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
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(APP_PATH)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME)
              .then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          return (
            await caches.match(request, { ignoreSearch: true })
          ) || (
            await caches.match(APP_PATH + "index.html")
          );
        })
    );
    return;
  }

  if (
    ["image", "style", "script", "font"].includes(request.destination)
  ) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;

        return fetch(request).then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME)
              .then(cache => cache.put(request, copy));
          }
          return response;
        });
      })
    );
  }
});
