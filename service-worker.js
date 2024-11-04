const CACHE_NAME = 'tracepaper-dynamic-cache-v1';
const urlsToCache = [
  '/'
];

// Install: Cache alleen de basisbestanden
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache);
    })
  );
});

// Fetch: Probeer eerst het netwerk, gebruik cache als fallback
self.addEventListener('fetch', event => {
  // Controleer of de methode van het verzoek 'GET' is
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // Voeg alleen GET-verzoeken aan de cache toe
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });
      })
      .catch(() => {
        // Fallback naar cache als netwerk faalt
        return caches.match(event.request).then(cachedResponse => {
          // Laat een offline-pagina zien als de resource niet in cache zit
          return cachedResponse || caches.match('/offline.html');
        });
      })
  );
});

// Activate: Verwijder oude caches bij een nieuwe versie
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (!cacheWhitelist.includes(cacheName)) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});