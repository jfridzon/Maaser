const CACHE = 'maaser-v3';
const FILES = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/core.js', 'js/i18n.js', 'js/rates.js', 'js/sync.js', 'js/icons.js', 'js/liquid.js', 'js/config.js',
  'manifest.webmanifest', 'assets/icon-180.png', 'assets/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Network first, so updates arrive by themselves; the cache only covers being offline.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.registration.scope)) return;
  e.respondWith(fetch(e.request, { cache: 'no-cache' })
    .then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data.json(); } catch (err) { data = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(data.title || 'Maaser', { body: data.body || '', icon: 'assets/icon-180.png', data: { url: data.url || './' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(list => (list[0] ? list[0].focus() : self.clients.openWindow(e.notification.data.url))));
});
