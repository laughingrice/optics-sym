// Simple service worker: precache core assets and serve from cache-first strategy
const CACHE_NAME = 'optics-sym-v1';
const PRECACHE = [
  '/',
  '/index.html',
  '/app.js',
  '/style.css',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', event => {
  // navigation requests => serve index.html for SPA-style routing
  if (event.request.mode === 'navigate') {
    event.respondWith(caches.match('/index.html').then(r => r || fetch('/index.html')));
    return;
  }
  // other requests: cache-first, fallback to network
  event.respondWith(caches.match(event.request).then(resp => resp || fetch(event.request).then(r=>{ if(r && r.status===200) { const copy = r.clone(); caches.open(CACHE_NAME).then(c => c.put(event.request, copy)); } return r; }).catch(()=> caches.match('/index.html'))));
});