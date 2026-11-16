// A5 ruta "od trenutne lokacije do X" i "gdje sam", A2 izvoz razgovora, A3 slika iz galerije kontaktu.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/<script src="https:\/\/accounts\.google\.com[^>]*><\/script>/, '');
const res = (o) => ({ ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(o ?? null)), text: async () => JSON.stringify(o ?? null), clone() { return this; } });
const pass = (c, m) => console.log((c ? 'PASS' : 'FAIL') + ' — ' + m);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const HERE = { lat: 43.5081, lng: 16.4402 }, TROGIR = { lat: 43.5170, lng: 16.2510 };

const calls = { photon: [], reverse: [], osrm: [], gemini: 0, geminiBodies: [] };
async function fakeFetch(url, opts = {}) {
  const u = String(url);
  if (u.includes('photon.komoot.io/reverse')) { calls.reverse.push(u); return res({ features: [{ properties: { street: 'Obala', housenumber: '12', city: 'Split', osm_key: 'building' } }] }); }
  if (u.includes('photon.komoot.io/api')) {
    const q = decodeURIComponent(/[?&]q=([^&]*)/.exec(u)[1]); calls.photon.push(q);
    const f = (name, p) => ({ geometry: { coordinates: [p.lng, p.lat] }, properties: { name, osm_key: 'place' } });
    return res({ features: /^Trogir/.test(q) ? [f('Trogir', TROGIR)] : [] });
  }
  if (u.includes('routing.openstreetmap.de')) {
    calls.osrm.push(u);
    const pts = /\/driving\/([^?]+)/.exec(u)[1].split(';').map(s => s.split(',').map(Number));
    return res({ code: 'Ok', routes: [{ distance: 16400, duration: 1300, geometry: { coordinates: pts } }] });
  }
  if (u.includes('generativelanguage')) {
    calls.gemini++; const body = JSON.parse(opts.body); calls.geminiBodies.push(body);
    return res({ candidates: [{ content: { parts: [{ text: 'U redu.' }] } }] });
  }
  throw new Error('Unexpected fetch ' + u);
}
const speech = [], spoken = [], shares = [], downloads = [], picks = [];
let geoMode = 'ok', activation = true, fileShare = true;
class FakeSR { start() { setTimeout(() => { this.onstart && this.onstart(); const r = [{ transcript: speech.shift() }]; r.isFinal = true; this.onresult && this.onresult({ resultIndex: 0, results: [r] }); this.onend && this.onend(); }, 5); } stop() {} }
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.github.io/jarvis/',
  beforeParse(w) {
    const ls = { jarvis_gemini_key: 'g', jarvis_boot_sequence: 'false', jarvis_lang: 'hr-HR',
      jarvis_contacts: JSON.stringify([{ id: 'c1', name: 'Martina', phone: '0911234567' }]) };
    for (const k in ls) w.localStorage.setItem(k, ls[k]);
    w.fetch = fakeFetch; w.webkitSpeechRecognition = FakeSR;
    w.SpeechSynthesisUtterance = function (t) { this.text = t; };
    w.speechSynthesis = { getVoices: () => [], cancel() {}, speak(u) { spoken.push(u.text); setTimeout(() => u.onend && u.onend(), 5); } };
    Object.defineProperty(w.navigator, 'geolocation', { configurable: true, value: { getCurrentPosition(ok, err) {
      setTimeout(() => geoMode === 'ok' ? ok({ coords: { latitude: HERE.lat, longitude: HERE.lng, accuracy: 12 } }) : err({ code: 1 }), 5);
    } } });
    Object.defineProperty(w.navigator, 'userActivation', { configurable: true, get: () => ({ isActive: activation, hasBeenActive: true }) });
    w.navigator.share = async (data) => { shares.push(data); };
    w.navigator.canShare = (data) => fileShare || !data.files;
    w.navigator.clipboard = { writeText: async () => {} };
    w.HTMLAnchorElement.prototype.click = function () { if (this.download) downloads.push(this.download); };
    w.HTMLInputElement.prototype.click = function () { if (this.type === 'file') picks.push(this.id); };
    w.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {} });
    w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,R0FMSU1H';
    w.URL.createObjectURL = () => 'blob:fake'; w.URL.revokeObjectURL = () => {};
    w.Image = class { set src(v) { this.width = 3000; this.height = 2000; setTimeout(() => this.onload && this.onload(), 1); } };
  } });
const w = dom.window, d = w.document, $ = id => d.getElementById(id);
async function waitFor(fn, l, ms = 4000) { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await sleep(20); } console.log('TIMEOUT: ' + l); return false; }
const click = el => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const idle = () => $('stateLabel').textContent === 'STANDBY';
const say = async t => { await waitFor(idle, 'idle'); speech.push(t); click($('micBtn')); await sleep(70); await waitFor(idle, 'after ' + t); await sleep(60); };
const lastSpoken = () => spoken[spoken.length - 1] || '';
const cards = title => [...d.querySelectorAll('.card-util')].filter(c => c.querySelector('.card-header').textContent.includes(title));
const lastCard = title => cards(title).slice(-1)[0];
const rows = card => [...card.querySelectorAll('.util-row')].map(r => r.textContent.replace(/\s+/g, ' ').trim());
const btn = (card, label) => [...card.querySelectorAll('.util-actions button')].find(b => b.textContent.includes(label));
const fileText = f => new Promise(r => { const fr = new w.FileReader(); fr.onload = () => r(fr.result); fr.readAsText(f); });
const pick = async (name = 'IMG_2041.jpg') => {
  const input = $('galleryInput');
  Object.defineProperty(input, 'files', { configurable: true, value: [new w.File(['RAW-PHOTO'], name, { type: 'image/jpeg' })] });
  input.dispatchEvent(new w.Event('change')); await sleep(80); await waitFor(idle, 'after pick'); await sleep(60);
};

(async () => {
  await sleep(300);
  console.log('--- A5. "Od trenutne lokacije do X" ---');
  await say('Jarvis, od trenutne lokacije do Trogira');
  let card = lastCard('RUTA');
  pass(card && rows(card).some(r => r.startsWith('Polazak') && r.includes('Tvoja lokacija (±12 m)')), 'Polazak = trenutna lokacija (GPS)');
  pass(rows(card).some(r => r.startsWith('Odredište') && r.includes('Trogir')) && calls.osrm[0].includes('16.440200,43.508100;16.251000,43.517000'), 'Ruta od GPS lokacije do Trogira');
  pass(calls.gemini === 0, 'Bez riječi "ruta" ili "upute" — i dalje lokalno, bez AI modela');
  await say('od moje lokacije do lokacije Trogir');
  pass(calls.photon[calls.photon.length - 1] === 'Trogir' && rows(lastCard('RUTA')).some(r => r.startsWith('Polazak') && r.includes('Tvoja lokacija')), '"od moje lokacije do lokacije Trogir" → odredište "Trogir"');
  await say('odavde do Trogira');
  pass(rows(lastCard('RUTA')).some(r => r.startsWith('Polazak') && r.includes('Tvoja lokacija')) && calls.gemini === 0, '"odavde do Trogira"');
  await say('rutu od mjesta gdje se nalazim do Trogira');
  pass(rows(lastCard('RUTA')).some(r => r.startsWith('Polazak') && r.includes('Tvoja lokacija')), '"od mjesta gdje se nalazim"');
  const g0 = calls.gemini;
  await say('od jutra do mraka');
  pass(calls.gemini === g0 + 1, '"od jutra do mraka" nije ruta');

  console.log('--- A5. "Gdje sam?" ---');
  await say('gdje sam');
  card = lastCard('MOJA LOKACIJA');
  pass(card && rows(card).some(r => r.includes('Adresa') && r.includes('Obala 12, Split')) && rows(card).some(r => r.includes('±12 m')), 'Kartica: adresa i koordinate');
  pass(lastSpoken() === 'Nalaziš se na adresi Obala 12, Split.', 'Glasom: ' + lastSpoken());
  click(btn(card, 'Podijeli lokaciju')); await sleep(30);
  pass(shares.length === 1 && shares[0].text.includes('Obala 12, Split') && shares[0].text.includes('https://www.google.com/maps/search/?api=1&query=43.508100,16.440200'), 'Podijeli lokaciju: adresa + Google Maps poveznica');

  console.log('--- A2. Izvoz razgovora ---');
  activation = true;
  await say('izvezi razgovor');
  let sh = shares[shares.length - 1];
  pass(shares.length === 2 && sh.files && sh.files[0].name.startsWith('jarvis-razgovor-') && sh.files[0].name.endsWith('.txt') && sh.files[0].type === 'text/plain', 'Otvara Androidovo dijeljenje s .txt datotekom');
  const txt = await fileText(sh.files[0]);
  pass(txt.startsWith('J.A.R.V.I.S. — razgovor, izvezeno') && txt.includes('Ti: od trenutne lokacije do Trogira\n\n[⌖ RUTA]') && txt.includes('Jarvis: Nalaziš se na adresi Obala 12, Split.'), 'Datoteka sadrži razgovor (Ti / Jarvis)');
  pass(/\[.*RUTA\]\n\s+Polazak: 📍 Tvoja lokacija/.test(txt) && txt.includes('Adresa: Obala 12, Split'), 'I sadržaj kartica (ruta, lokacija)');
  activation = false;
  await say('podijeli razgovor na WhatsApp');
  pass(shares.length === 2 && lastSpoken() === 'Razgovor je spreman. Dodirni Podijeli ili Spremi.', 'Bez svježeg dodira: kartica s tipkama');
  click(btn(lastCard('IZVOZ RAZGOVORA'), 'Podijeli')); await sleep(40);
  pass(shares.length === 3, 'Tipka Podijeli otvara dijeljenje');
  click(btn(lastCard('IZVOZ RAZGOVORA'), 'Spremi')); await sleep(20);
  pass(downloads.length === 1 && downloads[0].endsWith('.txt'), 'Tipka Spremi sprema .txt');
  fileShare = false;
  click($('exportBtn')); await sleep(60);
  pass(downloads.length === 2 || shares.length === 4, 'Tipka ⇪ u gornjoj traci (bez dijeljenja datoteka → tekst ili spremanje)');
  fileShare = true;

  console.log('--- A3. Slika iz galerije kontaktu ---');
  activation = true; picks.length = 0;
  await say('pošalji Martini sliku iz galerije');
  pass(picks.length === 1, 'Galerija se otvorila');
  await pick('more.jpg');
  card = lastCard('SLIKA ZA: MARTINA');
  pass(card && card.querySelector('img') && btn(card, 'Pošalji — Martina'), 'Kartica "Slika za: Martina" s tipkom Pošalji');
  pass(lastSpoken() === 'Slika je spremna. Dodirni Pošalji, pa u WhatsAppu odaberi osobu: Martina.', 'Glasom: ' + lastSpoken());
  const n3 = shares.length;
  click(btn(card, 'Pošalji')); await sleep(40);
  pass(shares.length === n3 + 1 && shares[shares.length - 1].files[0].name === 'more.jpg', 'Dijeli se originalna fotografija');
  click($('galleryBtn')); await pick('kava.jpg');
  pass(btn(lastCard('IZ GALERIJE'), 'Podijeli'), 'Kartica "Iz galerije" ima tipku Podijeli');
  await say('opiši je');
  const n4 = shares.length;
  await say('pošalji je Martini');
  pass(shares.length === n4 + 1 && shares[shares.length - 1].files[0].name === 'kava.jpg' && lastCard('SLIKA ZA: MARTINA'), '"pošalji je Martini" nakon opisa šalje istu sliku');
  const g1 = calls.gemini, n5 = shares.length, c5 = cards('SLIKA ZA').length;
  await say('pošalji Martini poruku da kasnim');
  pass(shares.length === n5 && cards('SLIKA ZA').length === c5, '"pošalji Martini poruku…" ne šalje sliku');

  console.log('--- A5. Bez dozvole za lokaciju ---');
  geoMode = 'denied';
  w.Date.now = (n => () => n() + 5 * 60000)(w.Date.now); // zapamćena lokacija istekla
  await say('gdje sam');
  pass(lastSpoken().startsWith('Pristup lokaciji je odbijen.'), 'Jasna poruka kad lokacija nije dopuštena');

  console.log('--- AI alati ---');
  const decl = calls.geminiBodies[0].tools[0].functionDeclarations;
  pass(['get_current_location', 'export_conversation'].every(n => decl.some(f => f.name === n)) && decl.find(f => f.name === 'open_gallery').parameters.properties.purpose.enum.includes('share'), 'get_current_location, export_conversation, open_gallery (share) poslani modelu');
  process.exit(0);
})().catch(e => { console.error('TEST ERROR', e); process.exit(1); });
