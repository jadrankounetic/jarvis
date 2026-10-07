// J.A.R.V.I.S. service worker.
// Its only job is to receive content shared from other apps (Android share sheet).
// It deliberately caches nothing of the app itself, so every new version published
// on GitHub is used immediately, never an old copy.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'POST' || !url.pathname.endsWith('/share-target')) return; // everything else: normal network
  event.respondWith((async () => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const base = self.registration.scope;
    try {
      const form = await event.request.formData();
      const cache = await caches.open('jarvis-share');
      const files = form.getAll('files').filter((f) => f && typeof f !== 'string').slice(0, 5);
      const meta = { title: String(form.get('title') || ''), text: String(form.get('text') || ''), url: String(form.get('url') || ''), files: [] };
      for (let i = 0; i < files.length; i++) {
        await cache.put(new URL(`shared/${id}/${i}`, base).href, new Response(files[i], { headers: { 'Content-Type': files[i].type || 'application/octet-stream' } }));
        meta.files.push({ name: files[i].name || `datoteka-${i + 1}`, type: files[i].type || '' });
      }
      await cache.put(new URL(`shared/${id}/meta`, base).href, new Response(JSON.stringify(meta), { headers: { 'Content-Type': 'application/json' } }));
      return Response.redirect(new URL(`./?shared=${id}`, base).href, 303);
    } catch (e) {
      return Response.redirect(new URL('./', base).href, 303);
    }
  })());
});
