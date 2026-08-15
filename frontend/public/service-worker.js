const CACHE_PREFIX = 'cartavault-shell-'
// Cache Storage is deliberately limited to the public app shell. Private map,
// trip and POI data lives in the user-isolated IndexedDB offline store.
// These two constants are replaced in the production output by vite.config.ts.
const BUILD_ID = 'development'
const BUILD_ASSETS = []
const CACHE_NAME = `${CACHE_PREFIX}${BUILD_ID}`
const MAP_ASSET_CACHE = 'cartavault-map-assets-v1'
const APP_SHELL = [
  '/',
  '/offline.html',
  '/cartavault-icon.png',
  '/cartavault-logo.png',
  '/icons/cartavault-180.png',
  '/icons/cartavault-192.png',
  '/icons/cartavault-512.png',
  '/icons/cartavault-maskable-512.png',
  '/pwa/capture-desktop.png',
  '/pwa/capture-mobile.png',
  ...BUILD_ASSETS,
]

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (url.origin !== self.location.origin) return

  // Glyphs are shared, non-sensitive parts of the self-hosted basemap. They
  // are the only API responses cached by the service worker.
  if (url.pathname.includes('/basemaps/cartavault/fonts/')) {
    event.respondWith(caches.open(MAP_ASSET_CACHE).then((cache) => cache.match(request).then((cached) => cached ?? fetch(request).then((response) => {
      if (response.ok) void cache.put(request, response.clone())
      return response
    }))))
    return
  }
  // Other API responses can contain private data and stay in IndexedDB only.
  if (url.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          void caches.open(CACHE_NAME).then((cache) => cache.put('/', copy))
          return response
        })
        .catch(() => caches.match('/').then((cached) => cached ?? caches.match('/offline.html'))),
    )
    return
  }

  if (!['script', 'style', 'font', 'image'].includes(request.destination)) return

  event.respondWith(
    caches.match(request).then((cached) => cached ?? fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone()
        void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
      }
      return response
    })),
  )
})
