const CACHE_NAME = 'lrms-cache-v6';
const STATIC_ASSETS = [
  './',
  './index.html',
  './style_v2.css',
  './app_v4.js',
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
    // Network only for Supabase
    return;
  }

  // Bypass for non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // Return cached response if found (Cache First)
        if (cachedResponse) {
          return cachedResponse;
        }

        // Otherwise, fetch from network
        return fetch(event.request).then(response => {
          // Optional: dynamically cache other static assets (like fonts/images) here if needed
          return response;
        }).catch(() => {
          // If network fails (offline) and the request is for an HTML page
          if (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html')) {
            return caches.match('./offline.html');
          }
        });
      })
  );
});
