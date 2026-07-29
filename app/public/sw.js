/* ProDough PM service worker.
   Caches the shell so the app opens instantly and still opens with no signal.
   HTML is always network-first — stale product data is worse than a spinner. */

var CACHE = 'prodough-shell-v1';
var SHELL = [
  '/app.css',
  '/app.js',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/offline.html',
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(function (cache) {
        return cache.addAll(SHELL);
      })
      .then(function () {
        return self.skipWaiting();
      }),
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        );
      })
      .then(function () {
        return self.clients.claim();
      }),
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API or PDF responses.
  if (url.pathname.startsWith('/api/') || url.pathname.endsWith('/pdf')) return;

  var isHtml =
    req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');

  if (isHtml) {
    event.respondWith(
      fetch(req).catch(function () {
        return caches.match('/offline.html');
      }),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res.ok && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) {
            c.put(req, copy);
          });
        }
        return res;
      });
    }),
  );
});

// ---------------------------------------------------------------- push

self.addEventListener('push', function (event) {
  var payload = { title: 'ProDough', body: '', url: '/' };
  if (event.data) {
    try {
      payload = Object.assign(payload, event.data.json());
    } catch (e) {
      payload.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: payload.tag || 'prodough',
      renotify: false,
      data: { url: payload.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var target = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].url.indexOf(self.location.origin) === 0 && 'focus' in list[i]) {
          list[i].navigate(target);
          return list[i].focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
