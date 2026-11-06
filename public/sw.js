// Service worker: funciona sin conexión (caché) y muestra las notificaciones push.
const CACHE = 'pd-v83';
const SHELL = ['/', '/index.html', '/app.js', '/rise.js', '/phrases.js', '/style.css', '/art.js', '/px.js', '/assets.js', '/manifest.webmanifest', '/icon-180.png', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Páginas y archivos propios: responde del caché y actualiza en segundo plano. La API nunca se cachea.
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: true }) || (e.request.mode === 'navigate' ? await c.match('/index.html') : undefined);
    const net = fetch(e.request).then(r => { const isImg = u.pathname.startsWith('/img/'); if (r.ok && (!isImg || (r.headers.get('content-type') || '').startsWith('image/'))) c.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});

self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let n = { title: 'Rise', body: 'Tenés un recordatorio.' };
    try { const r = await fetch('/api/last-notification', { cache: 'no-store' }); if (r.ok) n = await r.json(); } catch { /* sin red: texto genérico */ }
    const o = { body: n.body, icon: n.icon || '/icon-192.png', badge: '/icon-192.png', tag: 'pd-reminder' }; if (n.image) o.image = n.image;
    await self.registration.showNotification(n.title, o);
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => cs.length ? cs[0].focus() : self.clients.openWindow('/')));
});
