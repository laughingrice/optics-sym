// Robust service worker: resilient precache and offline fallback
const CACHE_NAME = 'optics-sym-v1';
const PRECACHE = [
  './',
  './index.html',
  './offline.html',
  './app.js',
  './style.css',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// install: attempt to cache each resource, but don't fail the whole install if one resource is missing
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    for(const url of PRECACHE){
      try{
        const resp = await fetch(url, {cache: 'reload'});
        if(resp && resp.ok) await cache.put(url, resp.clone());
        else console.warn('Resource not cached (non-OK):', url, resp && resp.status);
      }catch(err){ console.warn('Resource not cached (fetch failed):', url, err); }
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  // cleanup old caches if any
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => { if(k !== CACHE_NAME) return caches.delete(k); else return null; }));
    await clients.claim();
  })());
});

// Fetch handler
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // navigation requests: return cached index.html if available, otherwise network, otherwise offline page
  if(req.mode === 'navigate'){
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cachedIndex = await cache.match('./index.html');
      if(cachedIndex) return cachedIndex;
      try{
        const networkResp = await fetch(req);
        if(networkResp && networkResp.ok){ await cache.put('./index.html', networkResp.clone()); return networkResp; }
      }catch(e){ /* network failed */ }
      const offline = await cache.match('./offline.html');
      return offline || new Response('<h1>Offline</h1><p>The application is not available offline.</p>', { headers: {'Content-Type':'text/html'} });
    })());
    return;
  }

  // for other requests: try cache first, then network, and if both fail, serve fallback or nothing
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    if(cached) return cached;
    try{
      const response = await fetch(req);
      if(response && response.ok){ cache.put(req, response.clone()); return response; }
    }catch(e){ /* ignore */ }
    // fallback for images -> optionally return a placeholder (not included here)
    // finally, for anything else return offline.html for navigations already handled above
    return caches.match('./offline.html');
  })());
});