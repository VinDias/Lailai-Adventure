const STATIC_CACHE = "static-v1";

self.addEventListener("install", event => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== STATIC_CACHE) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Nunca cachear API, rotas de autenticação, admin ou stripe
  if (
    url.pathname.startsWith("/api") || 
    url.pathname.startsWith("/auth") || 
    url.pathname.startsWith("/admin") || 
    url.pathname.startsWith("/stripe")
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});