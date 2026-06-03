// Alfamart Energy Checklist — Service Worker
// Enables offline use and "Add to Home Screen" installation

const CACHE_NAME = 'alfamart-energy-v1';
const OFFLINE_URL = '/';

// Files to cache for offline use
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// ── INSTALL: cache static assets ──
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(STATIC_ASSETS);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// ── ACTIVATE: clean old caches ──
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
            .map(function(key) { return caches.delete(key); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// ── FETCH: network first, fallback to cache ──
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // API calls — always go to network (never cache)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(function() {
        return new Response(JSON.stringify({ error: 'offline', ok: false }),
          { headers: { 'Content-Type': 'application/json' } });
      })
    );
    return;
  }

  // Static assets — cache first, then network
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) return cached;
      return fetch(event.request).then(function(response) {
        // Cache successful GET responses
        if (event.request.method === 'GET' && response.status === 200) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(function() {
        // Offline fallback — serve cached index
        return caches.match('/');
      });
    })
  );
});

// ── PUSH NOTIFICATIONS ──
self.addEventListener('push', function(event) {
  var data = {};
  try { data = event.data.json(); } catch(e) { data = { title: 'Alfamart', body: event.data ? event.data.text() : '' }; }
  event.waitUntil(
    self.registration.showNotification(data.title || '🔔 Alfamart Checklist', {
      body: data.body || 'You have a new checklist reminder.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-72.png',
      tag: 'alfamart-notif',
      renotify: true,
      vibrate: [200, 100, 200],
      data: { url: data.url || '/' }
    })
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url === '/' && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});
