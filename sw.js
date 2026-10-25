// Offlinestöd: appens egna filer sparas i en cache så att appen startar och
// sparade annonser går att läsa utan nät. Annonser och API-anrop cachas inte.

const CACHE = 'jobbmatchen-v2';
const SHELL = [
  './', './index.html', './css/app.css', './manifest.webmanifest',
  './js/app.js', './js/config.js', './js/text.js', './js/matching.js', './js/learning.js', './js/tracker.js',
  './js/store.js', './js/sources.js', './js/taxonomy.js', './js/cv.js', './js/geo.js', './js/ai.js',
  './js/skills.js', './js/salary.js', './js/transit.js',
  './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

// Nätet först så att uppdateringar syns direkt; cachen används bara offline.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((cache) => cache.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('./index.html'))),
  );
});
