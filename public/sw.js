const CACHE_NAME = "teammillimeter-erp-shell-v6";

try {
  importScripts("/sw-push.js");
} catch {
  // push handlers optional during dev
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isDocument = request.mode === "navigate" || request.destination === "document";
  if (!isDocument) return;

  event.respondWith(
    fetch(request).catch(async () => {
      const cached = await caches.match("/");
      if (cached) return cached;
      return Response.error();
    }),
  );
});
