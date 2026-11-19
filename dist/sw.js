const SHELL = 'classbridge-shell-v20';
const RUNTIME = 'classbridge-runtime-v1';
const FILES = ['./', './index.html', './style.css', './app.js', './core.js', './speech-core.js', './caption-state.js', './capture-audio.js', './cloud-speech.js', './file-paths.js', './subtitles.js', './video-links.js', './media-core.js', './media-store.js', './media-library.js', './file-import.js', './browser-speech.js', './translation-api.js', './api-settings.js', './inference-worker.js', './audio-worklet.js', './manifest.webmanifest', './icon.svg', './sample.wav'];
self.addEventListener('install', e => { e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil((async () => { for (const key of await caches.keys()) if (key.startsWith('classbridge-shell-') && key !== SHELL) await caches.delete(key); await self.clients.claim(); })()); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url); if (event.request.method !== 'GET') return;
  if (url.origin === self.location.origin && event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(async()=>await caches.match(event.request)||await caches.match('./index.html')));return;
  }
  if (url.origin === self.location.origin) {
    event.respondWith((async () => { const cached = await caches.match(event.request); if (cached) return cached; return fetch(event.request); })());
  } else if (url.hostname === 'cdn.jsdelivr.net') {
    // Model weights use Transformers.js's own cache. Persist the JS and WASM runtime here.
    event.respondWith((async () => { const cache = await caches.open(RUNTIME); const cached = await cache.match(event.request); if (cached) return cached; const res = await fetch(event.request); if (res.ok) await cache.put(event.request, res.clone()); return res; })());
  }
});
