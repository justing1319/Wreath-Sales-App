const CACHE = 'pack47-evergreen-v1';
const ASSETS = ['./', './index.html', './styles.css', './app.js', './sales.js', './manifest.webmanifest', './icon.svg', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('pack47-evergreen-') && key !== CACHE).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request).then(cached => {
    if (cached) return cached;
    return fetch(event.request).catch(error => {
      if (event.request.mode === 'navigate') return caches.match('./index.html');
      throw error;
    });
  }));
});
