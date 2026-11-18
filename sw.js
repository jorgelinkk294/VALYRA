const CACHE = 'valyra-4.1.2';
const LOCAL = ['./', 'index.html', 'enhancements.js', 'manifest.webmanifest', 'logo.png', 'icon-192.png', 'icon-512.png', 'icon-512-maskable.png'];
const REMOTE = [
  'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js'
];
const WATCH = ['index.html', 'manifest.webmanifest', 'logo.png'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(LOCAL);
    await Promise.all(REMOTE.map(async url => {
      try { await cache.put(url, await fetch(url, { mode: 'no-cors' })); } catch (error) {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

function isAppPage(request) {
  const url = new URL(request.url);
  return url.origin === self.location.origin &&
    (request.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/'));
}

async function addEnhancements(response) {
  if (!response || response.type === 'opaque') return response;
  const html = await response.text();
  if (html.includes('enhancements.js')) {
    return new Response(html, { status: response.status, statusText: response.statusText, headers: response.headers });
  }
  const at = html.toLowerCase().lastIndexOf('</body>');
  const updated = at < 0 ? html : html.slice(0, at) + '<script src="./enhancements.js"></script>' + html.slice(at);
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  return new Response(updated, { status: response.status, statusText: response.statusText, headers });
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).searchParams.has('chk')) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(event.request, { ignoreSearch: true }) ||
      (event.request.mode === 'navigate' ? await cache.match('index.html') : null);
    const network = fetch(event.request).then(response => {
      if (response && (response.ok || response.type === 'opaque')) cache.put(event.request, response.clone());
      return response;
    }).catch(() => null);
    if (cached) {
      event.waitUntil(network);
      return isAppPage(event.request) ? addEnhancements(cached) : cached;
    }
    const response = await network;
    if (response) return isAppPage(event.request) ? addEnhancements(response) : response;
    if (event.request.mode === 'navigate') {
      const fallback = await cache.match('index.html');
      return addEnhancements(fallback);
    }
    return Response.error();
  })());
});

async function idbValue(key) {
  try {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('valyra', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('kv');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return await new Promise(resolve => {
      const request = db.transaction('kv').objectStore('kv').get(key);
      request.onsuccess = () => resolve(request.result == null ? null : request.result);
      request.onerror = () => resolve(null);
    });
  } catch (error) { return null; }
}

async function currentBuildHash() {
  const parts = await Promise.all(WATCH.map(async file => {
    const response = await fetch(file + '?chk=1', { cache: 'no-cache' });
    if (!response.ok) throw new Error(file);
    return new Uint8Array(await response.arrayBuffer());
  }));
  const bytes = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  parts.forEach(part => { bytes.set(part, offset); offset += part.length; });
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(value => value.toString(16).padStart(2, '0')).join('');
}

async function checkUpdateInBackground() {
  try {
    if (!('Notification' in self) || Notification.permission !== 'granted') return;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (windows.some(client => client.visibilityState === 'visible')) return;
    const saved = await idbValue('__build');
    if (!saved || await currentBuildHash() === saved) return;
    await self.registration.showNotification('Actualización disponible', {
      body: 'Hay una versión nueva de VALYRA. Abre la app para actualizar.',
      icon: 'icon-192.png', badge: 'icon-192.png', tag: 'valyra-update', renotify: true,
      data: { url: './' }
    });
  } catch (error) {}
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
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) if ('focus' in client) return client.focus();
    return self.clients.openWindow('./');
  })());
});
