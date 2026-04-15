// Minimal service worker — required for Chrome to install as a standalone PWA.
// No caching; all requests pass straight through to the network.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));
self.addEventListener('fetch', e => e.respondWith(fetch(e.request)));
