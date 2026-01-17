/**
 * Service Worker for LLMos-Lite PWA
 *
 * Provides offline support, caching strategies, and background sync
 */

const CACHE_NAME = 'llmos-lite-v1';
const RUNTIME_CACHE = 'llmos-lite-runtime';

// Assets to cache on install
const PRECACHE_ASSETS = [
  '/',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
];

// Cache strategies by route
const CACHE_STRATEGIES = {
  // Cache first for static assets
  CACHE_FIRST: [
    /\/_next\/static\/.*/,
    /\/icons\/.*/,
    /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/,
  ],
  // Network first for API calls
  NETWORK_FIRST: [
    /\/api\/.*/,
    /openrouter\.ai/,
    /github\.com/,
  ],
  // Stale while revalidate for HTML/CSS/JS
  STALE_WHILE_REVALIDATE: [
    /\/_next\/.*/,
    /\.(?:js|css)$/,
  ],
};

/**
 * Install event - cache core assets
 */
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching pre-cache assets');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

/**
 * Activate event - clean up old caches
 */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME && name !== RUNTIME_CACHE)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

/**
 * Fetch event - handle requests with caching strategies
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin requests
  if (url.origin !== self.location.origin) {
    // But handle OpenRouter and GitHub requests
    if (CACHE_STRATEGIES.NETWORK_FIRST.some(pattern => pattern.test(url.href))) {
      event.respondWith(networkFirst(request));
    }
    return;
  }

  // Determine cache strategy
  let strategy = null;

  if (CACHE_STRATEGIES.CACHE_FIRST.some(pattern => pattern.test(url.pathname))) {
    strategy = cacheFirst;
  } else if (CACHE_STRATEGIES.NETWORK_FIRST.some(pattern => pattern.test(url.pathname))) {
    strategy = networkFirst;
  } else if (CACHE_STRATEGIES.STALE_WHILE_REVALIDATE.some(pattern => pattern.test(url.pathname))) {
    strategy = staleWhileRevalidate;
  } else {
    strategy = networkFirst; // Default
  }

  event.respondWith(strategy(request));
});

/**
 * Cache First strategy
 */
async function cacheFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);

  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.error('[SW] Fetch failed:', error);
    return new Response('Offline', { status: 503 });
  }
}

/**
 * Network First strategy
 */
async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.error('[SW] Network failed, trying cache:', error);
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    return new Response('Offline', { status: 503 });
  }
}

/**
 * Stale While Revalidate strategy
 */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  });

  return cached || fetchPromise;
}

/**
 * Background Sync for offline actions
 */
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);

  if (event.tag === 'sync-sessions') {
    event.waitUntil(syncSessions());
  } else if (event.tag === 'sync-commits') {
    event.waitUntil(syncCommits());
  }
});

/**
 * Sync sessions when back online
 */
async function syncSessions() {
  try {
    const cache = await caches.open('llmos-lite-pending');
    const requests = await cache.keys();

    for (const request of requests) {
      if (request.url.includes('/api/sessions')) {
        const response = await cache.match(request);
        const data = await response.json();

        // Retry the request
        await fetch(request, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        // Remove from pending cache
        await cache.delete(request);
      }
    }

    console.log('[SW] Sessions synced');
  } catch (error) {
    console.error('[SW] Sync failed:', error);
  }
}

/**
 * Sync commits when back online
 */
async function syncCommits() {
  try {
    const cache = await caches.open('llmos-lite-pending');
    const requests = await cache.keys();

    for (const request of requests) {
      if (request.url.includes('/api/git')) {
        const response = await cache.match(request);
        const data = await response.json();

        // Retry the request
        await fetch(request, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        // Remove from pending cache
        await cache.delete(request);
      }
    }

    console.log('[SW] Commits synced');
  } catch (error) {
    console.error('[SW] Sync failed:', error);
  }
}

/**
 * Push notifications
 */
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};

  const options = {
    body: data.body || 'New update available',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    vibrate: [200, 100, 200],
    tag: data.tag || 'default',
    requireInteraction: false,
    data: data.url ? { url: data.url } : undefined,
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'LLMos-Lite', options)
  );
});

/**
 * Notification click handler
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.notification.data && event.notification.data.url) {
    event.waitUntil(
      clients.openWindow(event.notification.data.url)
    );
  }
});

console.log('[SW] Service worker loaded');
