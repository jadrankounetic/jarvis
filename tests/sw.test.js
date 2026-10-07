// Runs sw.js in a simulated service-worker environment.
const fs = require('fs'); const path = require('path'); const vm = require('vm');
const pass = (c, m) => console.log((c ? 'PASS' : 'FAIL') + ' — ' + m);
const src = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const listeners = {}; const store = new Map();
const self = { addEventListener: (t, f) => (listeners[t] = f), registration: { scope: 'https://example.github.io/jarvis/' }, skipWaiting() {}, clients: { claim: async () => {} } };
const caches = { open: async () => ({ put: async (k, r) => store.set(k, r) }) };
vm.runInNewContext(src, { self, caches, URL, Response, console });
(async () => {
  let responded = null;
  const form = new FormData(); form.append('title', 'Naslov'); form.append('text', 'neki tekst'); form.append('files', new Blob(['x'], { type: 'image/png' }), 'slika.png');
  listeners.fetch({ request: new Request('https://example.github.io/jarvis/share-target', { method: 'POST', body: form }), respondWith: p => (responded = p) });
  const r = await responded;
  const loc = r.headers.get('location') || '';
  pass(r.status === 303 && /^https:\/\/example\.github\.io\/jarvis\/\?shared=[a-z0-9]+$/.test(loc), 'Dijeljenje preusmjerava na Jarvisa s ?shared=…');
  const id = loc.split('=')[1];
  const meta = JSON.parse(await store.get(`https://example.github.io/jarvis/shared/${id}/meta`).text());
  pass(meta.title === 'Naslov' && meta.text === 'neki tekst' && meta.files[0].type === 'image/png', 'Naslov, tekst i datoteka spremljeni privremeno');
  pass(store.has(`https://example.github.io/jarvis/shared/${id}/0`), 'Sama datoteka spremljena');
  let touched = false;
  listeners.fetch({ request: new Request('https://example.github.io/jarvis/index.html'), respondWith: () => (touched = true) });
  pass(!touched, 'Obične stranice ne dira (bez spremanja starih verzija Jarvisa)');
  process.exit(0);
})().catch(e => { console.error('TEST ERROR', e); process.exit(1); });
