const CACHE_NAME = 'roleta-gelada-v1';

self.addEventListener('install', (event) => {
    // Para simplificar, o Service Worker apenas se instala para ativar o "Add to Home Screen".
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    // PWA network-first strategy for dynamic app, avoiding stale content.
    event.respondWith(
        fetch(event.request).catch(() => {
            return caches.match(event.request);
        })
    );
});
