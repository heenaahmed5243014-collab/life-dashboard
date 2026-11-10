// Life Dashboard service worker: keeps the app itself on the phone so it opens offline.
// Your data is handled separately by the app (saved copy + sync queue), never cached here.
const CACHE = 'ld-app-v3';
const CORE = ['/', '/manifest.webmanifest', '/icon.svg', '/apple-touch-icon.png', '/icon-192.png', '/img/wallet.png', '/img/purse.png', '/img/bowl.png', '/img/focus.png', '/img/airpods.png', '/img/sleep.png', '/img/shoebox.png', '/img/areas/camera.png', '/img/areas/work.png', '/img/areas/jobsearch.png', '/img/areas/sketchbook.png', '/img/coffee.png', '/img/iphone.png', '/img/areas/home.png', '/img/areas/inbox.png', '/img/gym.png', '/img/rent.png', '/img/groceries.png', '/img/transport.png', '/img/steps.png', '/img/water.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('ld-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const putInCache = async (req, res) => {
  if (res && res.ok && (res.type === 'basic' || res.type === 'cors')) {
    const cache = await caches.open(CACHE);
    await cache.put(req, res.clone());
  }
  return res;
};

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // Never cache the Claude helper or any data/API calls.
  if (sameOrigin && url.pathname.startsWith('/api/')) return;

  // The page itself: try the network first (to get updates), fall back to the saved copy.
  if (sameOrigin && req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => putInCache('/', res))
        .catch(() => caches.match('/').then((r) => r || caches.match(req))),
    );
    return;
  }

  // Built app files have unique names, so a saved copy is always right.
  if (sameOrigin && url.pathname.startsWith('/assets/')) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => putInCache(req, res))));
    return;
  }

  // Icons, manifest and fonts: use the saved copy straight away, refresh it in the background.
  const isFont = url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com';
  if (sameOrigin || isFont) {
    event.respondWith(
      caches.match(req).then((hit) => {
        const fresh = fetch(req).then((res) => putInCache(req, res)).catch(() => hit);
        return hit || fresh;
      }),
    );
  }
});

// Morning debrief notifications
self.addEventListener('push', (event) => {
  let data = { title: '☀️ Morning debrief', body: 'Open your day.', url: '/#/' };
  try { data = { ...data, ...event.data.json() }; } catch (e) { /* plain text or empty */ }
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body, icon: '/icon-192.png', badge: '/icon-192.png', tag: 'morning-debrief', renotify: true, data: { url: data.url },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/#/';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) { await c.focus(); c.postMessage({ type: 'open-debrief' }); return; }
    }
    await self.clients.openWindow('/?debrief=1#/');
  })());
});
