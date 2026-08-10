const CACHE_NAME = 'rmis-cache-v10';
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

// Install event - cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  const cacheAllowlist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheAllowlist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - Cache First for static, Network Only for API
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Bypass cache for Supabase API (Database & Auth)
  if (url.hostname.includes('supabase.co')) {
    return;
  }

  // Bypass for non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(event.request).then(response => {
          return response;
        }).catch(() => {
          if (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html')) {
            return caches.match('./offline.html');
          }
        });
      })
  );
});

// ==============================================================================
// WEB PUSH NOTIFICATIONS
// ==============================================================================

// Handle incoming Push Notification event from Server
self.addEventListener('push', event => {
  let data = {
    title: 'RMIS (ระบบแจ้งตรวจสอบคุณภาพ)',
    body: 'มีการแจ้งเตือนใหม่ในระบบ',
    url: './'
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    vibrate: [200, 100, 200, 100, 200],
    tag: data.tag || 'rmis-notification',
    renotify: true,
    data: {
      url: data.url || './'
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Handle click on Notification
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || './';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // If a window is already open, focus it
      for (const client of clientList) {
        if (client.url.includes('index.html') || client.url.endsWith('/')) {
          if ('focus' in client) {
            client.focus();
            if (targetUrl && client.navigate) {
              client.navigate(targetUrl);
            }
            return;
          }
        }
      }
      // If no window is open, open a new one
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
