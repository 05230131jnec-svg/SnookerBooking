const CACHE_NAME = 'greenroom-shell-v4';
const SHELL_FILES = [
  '/',
  '/css/styles.css',
  '/js/api.js',
  '/js/utils.js',
  '/js/app.js',
  '/manifest.webmanifest',
  '/assets/icon.svg',
  '/public/login.html',
  '/public/register.html',
  '/public/forgot-password.html',
  '/public/reset-password.html',
  '/general/dashboard.html',
  '/general/book.html',
  '/general/bookings.html',
  '/general/tournaments.html',
  '/general/notifications.html',
  '/general/profile.html',
  '/admin/dashboard.html',
  '/admin/bookings.html',
  '/admin/tables.html',
  '/admin/equipment.html',
  '/admin/tournaments.html',
  '/admin/feedback.html',
  '/admin/reports.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith(
    fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match(event.request).then((cached) => cached || caches.match('/')))
  );
});
