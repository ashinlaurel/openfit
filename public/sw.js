const CACHE = 'openfit-shell-v1'
const SHELL = ['/', '/manifest.webmanifest', '/app-icon.png']
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()))
})
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/web/') || url.pathname.startsWith('/auth/') || url.pathname === '/share-api' || url.pathname === '/shared-reports') return
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      if (response.ok && url.pathname === '/') void caches.open(CACHE).then(cache => cache.put('/', response.clone()))
      return response
    }).catch(async () => await caches.match('/') || Response.error()))
    return
  }
  if (url.pathname.startsWith('/assets/')) event.respondWith(caches.match(request).then(hit => hit || fetch(request).then(response => {
    if (response.ok) void caches.open(CACHE).then(cache => cache.put(request, response.clone()))
    return response
  })))
})
