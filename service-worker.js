const CACHE_NAME = 'rmis-cache-v17';
const STATIC_ASSETS = [
  './',
  './index.html',
  './style_v2.css',
  './app_v5.js',
  './config.js',
  './dbService.js',
  './manifest.json',
  './offline.html',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Install
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate - clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch - Network First
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.hostname.includes('supabase.co') || event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return res;
      })
      .catch(() =>
        caches.match(event.request).then(cached => {
          if (cached) return cached;
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('./offline.html');
          }
        })
      )
  );
});

// ==============================================================================
// WEB PUSH NOTIFICATIONS
// ==============================================================================

self.addEventListener('push', event => {
  let title = 'RMIS (ระบบแจ้งตรวจสอบคุณภาพ)';
  let body = 'มีการแจ้งเตือนใหม่ในระบบ';

  if (event.data) {
    try {
      const parsed = event.data.json();
      if (parsed.title) title = parsed.title;
      if (parsed.body) body = parsed.body;
    } catch (e) {
      body = event.data.text();
    }
  }

  // ใช้ absolute URL ของ service worker scope
  const targetUrl = self.registration.scope;

  event.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      icon: self.registration.scope + 'icons/icon-192.png',
      badge: self.registration.scope + 'icons/icon-192.png',
      vibrate: [200, 100, 200, 100, 200],
      tag: 'rmis-notification',
      renotify: true,
      data: { url: targetUrl }
    })
  );
});

// Handle notification click
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || self.registration.scope;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // ถ้ามีหน้าต่างเปิดอยู่แล้ว ให้ focus
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          return;
        }
      }
      // ถ้าไม่มี ให้เปิดใหม่
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
