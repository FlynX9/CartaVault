const CACHE_PREFIX = 'cartavault-shell-'
const CACHE_NAME = `${CACHE_PREFIX}v2`
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

  // API responses and third-party map tiles must stay fresh and are never
  // cached here: they can contain private data or provider-controlled assets.
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

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
