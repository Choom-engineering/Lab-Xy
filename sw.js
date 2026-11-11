// XY Studio service worker: l'app s'ouvre hors ligne une fois chargée.
// L'interface est servie depuis le réseau quand il répond (pour recevoir les mises à jour),
// le reste (fichiers versionnés, machines, polices) depuis le cache, rempli au fil de l'usage.
const VERSION = '26';
const CACHE = 'xy-studio-' + VERSION;
const SHELL = ['./', 'index.html', 'app.bundle.js?v=' + VERSION,
  'machines/index.json', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('xy-studio-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const own = url.origin === location.origin;
  const fonts = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!own && !fonts) return;
  const page = req.mode === 'navigate' || (own && (url.pathname.endsWith('/') || url.pathname.endsWith('index.html') || url.pathname.endsWith('machines/index.json')));
  if (page) {
    e.respondWith(fetch(req).then(res => { if (res.ok) caches.open(CACHE).then(c => c.put(req, res.clone())); return res; })
      .catch(() => caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then(r => r || caches.match('index.html'))));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  })));
});
