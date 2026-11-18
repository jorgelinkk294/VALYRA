const CACHE = 'valyra-4.0.1'; // sube este numero junto con APP_VERSION en index.html
const LOCAL = ['./', 'index.html', 'manifest.webmanifest', 'logo.png', 'icon-192.png', 'icon-512.png', 'icon-512-maskable.png'];
const REMOTE = ['https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js', 'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js', 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(LOCAL);
    await Promise.all(REMOTE.map(async url => {
      try { await cache.put(url, await fetch(url, { mode: 'no-cors' })); } catch (e) {}
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Sirve lo guardado y actualiza en segundo plano cuando hay internet.
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (new URL(event.request.url).searchParams.has('chk')) return; // revision de version: siempre a la red
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(event.request, { ignoreSearch: true });
    const network = fetch(event.request).then(res => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(event.request, res.clone());
      return res;
    }).catch(() => null);
    if (cached) { event.waitUntil(network); return cached; }
    const res = await network;
    if (res) return res;
    if (event.request.mode === 'navigate') return cache.match('index.html');
    return Response.error();
  })());
});


// ---------- Aviso de actualizacion cuando la app no se esta usando ----------
const WATCH = ['index.html', 'manifest.webmanifest', 'logo.png'];

function idbOpen() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('valyra', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function idbGet(key) {
  try {
    const db = await idbOpen();
    return await new Promise(res => {
      const q = db.transaction('kv').objectStore('kv').get(key);
      q.onsuccess = () => res(q.result === undefined ? null : q.result);
      q.onerror = () => res(null);
    });
  } catch (e) { return null; }
}
async function idbSet(key, val) {
  try {
    const db = await idbOpen();
    await new Promise(res => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(val, key);
      tx.oncomplete = tx.onerror = tx.onabort = res;
    });
  } catch (e) {}
}

// Misma huella que calcula la app (SHA-256 de los archivos en el mismo orden)
async function buildHash() {
  const parts = await Promise.all(WATCH.map(async f => {
    const r = await fetch(f + '?chk=1', { cache: 'no-cache' });
    if (!r.ok) throw new Error(f);
    return new Uint8Array(await r.arrayBuffer());
  }));
  const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  parts.forEach(p => { all.set(p, off); off += p.length; });
  const d = await crypto.subtle.digest('SHA-256', all);
  return Array.from(new Uint8Array(d)).map(x => x.toString(16).padStart(2, '0')).join('');
}

async function checkUpdateInBackground() {
  try {
    if (Notification.permission !== 'granted') return;
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (wins.some(c => c.visibilityState === 'visible')) return;   // la est\u00e1n usando: ah\u00ed sale la ventana
    const saved = await idbGet('__build');
    if (!saved) return;
    const h = await buildHash();
    if (h === saved) return;
    if ((await idbGet('__notified')) === h) return;                 // ya se avis\u00f3 de esta versi\u00f3n
    await idbSet('__notified', h);
    await self.registration.showNotification('Actualizaci\u00f3n disponible', {
      body: 'Hay una versi\u00f3n nueva de VALYRA. Abre la app para actualizar.',
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      tag: 'valyra-update',
      renotify: true,
      silent: false,
      vibrate: [200, 100, 200],
      data: { url: './' }
    });
  } catch (e) {}
}

self.addEventListener('periodicsync', event => {
  if (event.tag === 'valyra-update-check') event.waitUntil(checkUpdateInBackground());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'check-update') event.waitUntil(checkUpdateInBackground());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of wins) { if ('focus' in c) return c.focus(); }
    return self.clients.openWindow('./');
  })());
});
