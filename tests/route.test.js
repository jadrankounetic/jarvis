// Rute: polazak s trenutne lokacije, zadani polazak ("od X do Y"), usputna stajališta,
// navigacija u Google Kartama. Svi vanjski servisi (GPS, Photon, OSRM, Overpass) su lažni.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/<script src="https:\/\/accounts\.google\.com[^>]*><\/script>/, '');
const res = (o) => ({ ok: true, status: 200, json: async () => o, text: async () => JSON.stringify(o), clone() { return this; } });

// Neutralne testne koordinate
const HERE = { lat: 43.5081, lng: 16.4402 };
const TROGIR = { lat: 43.5170, lng: 16.2510 };
const KASTELA = { lat: 43.5480, lng: 16.3500 };
const along = (t, dLat = 0) => ({ lat: HERE.lat + t * (TROGIR.lat - HERE.lat) + dLat, lng: HERE.lng + t * (TROGIR.lng - HERE.lng) });
const FUEL_EARLY = along(0.13, 0.0009);   // ~2 km od polaska, ~100 m od rute
const FUEL_LATER = along(0.65);           // na ruti, ali kasnije
const FUEL_FAR = along(0.02, 0.045);      // blizu polaska, ali 5 km od rute
const SHOP = along(0.40, 0.0005);
const PHARM_NEAR = { lat: HERE.lat + 0.004, lng: HERE.lng }, PHARM_FAR = { lat: HERE.lat + 0.02, lng: HERE.lng };

function dist(a, b) { const R = 6371000, r = Math.PI / 180; const h = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lng - a.lng) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }
const calls = { photon: [], osrm: [], overpass: [], gemini: 0, geminiBodies: [] };
const feature = (name, key, p, city) => ({ geometry: { coordinates: [p.lng, p.lat] }, properties: { name, osm_key: key, city } });
const node = (id, p, tags) => ({ type: 'node', id, lat: p.lat, lon: p.lng, tags });

async function fakeFetch(url, opts) {
  const u = String(url);
  if (u.includes('photon.komoot.io')) {
    const q = decodeURIComponent(/[?&]q=([^&]*)/.exec(u)[1]);
    calls.photon.push(q);
    const db = { 'Trogira': [feature('Trogirska ulica', 'highway', TROGIR, 'Split')], 'Trogir': [feature('Trogir', 'place', TROGIR)],
      'Kaštela': [feature('Kaštela', 'place', KASTELA)] };
    return res({ features: db[q] || [] });
  }
  if (u.includes('routing.openstreetmap.de')) {
    calls.osrm.push(u);
    const pts = /\/driving\/([^?]+)/.exec(u)[1].split(';').map(s => { const [lng, lat] = s.split(',').map(Number); return { lat, lng }; });
    const line = []; let d = 0;
    for (let i = 0; i < pts.length - 1; i++) { for (let k = 0; k < 20; k++) { const t = k / 20; line.push([pts[i].lng + t * (pts[i + 1].lng - pts[i].lng), pts[i].lat + t * (pts[i + 1].lat - pts[i].lat)]); } d += dist(pts[i], pts[i + 1]); }
    line.push([pts[pts.length - 1].lng, pts[pts.length - 1].lat]);
    d *= 1.07;
    return res({ code: 'Ok', routes: [{ distance: d, duration: d / 12.5, geometry: { coordinates: line } }] });
  }
  if (u.includes('overpass')) {
    const q = decodeURIComponent(String(opts.body).replace(/^data=/, ''));
    calls.overpass.push(q);
    if (q.includes('"amenity"="fuel"')) return res({ elements: [
      node(1, FUEL_FAR, { name: 'Daleka pumpa' }), node(2, FUEL_LATER, { name: 'Kasnija pumpa' }),
      node(3, FUEL_EARLY, { name: 'INA', 'addr:street': 'Primorska cesta', 'addr:housenumber': '5' })] });
    if (q.includes('"shop"~')) return res({ elements: [node(10, SHOP, { name: 'Market Kod Ive' })] });
    if (q.includes('"amenity"="pharmacy"')) return res({ elements: [node(20, PHARM_FAR, { name: 'Ljekarna Daleko' }), node(21, PHARM_NEAR, { name: 'Ljekarna Blizu', 'addr:street': 'Obala' })] });
    return res({ elements: [] });
  }
  if (u.includes('generativelanguage')) {
    calls.gemini++;
    const body = JSON.parse(opts.body); calls.geminiBodies.push(body);
    const last = body.contents[body.contents.length - 1];
    const asked = JSON.stringify(body.contents);
    if (last.parts.some(p => p.functionResponse)) return res({ candidates: [{ content: { parts: [{ text: 'Ruta je spremna, gospodine.' }] } }] });
    if (asked.includes('jednim stajalištem')) return res({ candidates: [{ content: { parts: [
      { text: 'Računam rutu.' }, { functionCall: { name: 'plan_route', args: { destination: 'Trogir', stops: ['najbliža benzinska'] } } }] } }] });
    return res({ candidates: [{ content: { parts: [{ text: 'OK.' }] } }] });
  }
  throw new Error('Unexpected fetch ' + u);
}

const events = []; const speechQueue = []; const opened = [];
let geoMode = 'denied', geoCalls = 0;
class FakeSR { start() { setTimeout(() => { this.onstart && this.onstart(); const r = [{ transcript: speechQueue.shift() }]; r.isFinal = true;
  this.onresult && this.onresult({ resultIndex: 0, results: [r] }); this.onend && this.onend(); }, 5); } stop() {} }
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.github.io/jarvis/',
  beforeParse(w) {
    const ls = { jarvis_gemini_key: 'g', jarvis_boot_sequence: 'false', jarvis_lang: 'hr-HR' };
    for (const k in ls) w.localStorage.setItem(k, ls[k]);
    w.fetch = fakeFetch; w.webkitSpeechRecognition = FakeSR;
    Object.defineProperty(w.navigator, 'userAgent', { value: 'Mozilla/5.0 (Linux; Android 14; Pixel) Chrome/140 Mobile', configurable: true });
    Object.defineProperty(w.navigator, 'geolocation', { configurable: true, value: { getCurrentPosition(ok, err) {
      geoCalls++;
      setTimeout(() => geoMode === 'ok' ? ok({ coords: { latitude: HERE.lat, longitude: HERE.lng, accuracy: 12 } }) : err({ code: 1 }), 5);
    } } });
    w.HTMLAnchorElement.prototype.click = function () { opened.push(this.getAttribute('href')); };
    w.SpeechSynthesisUtterance = function (t) { this.text = t; };
    w.speechSynthesis = { getVoices: () => [], cancel() {}, speak(u) { events.push('SPEAK ' + u.text); setTimeout(() => u.onend && u.onend(), 5); } };
  } });
const w = dom.window, d = w.document, $ = id => d.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, l, ms = 4000) { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await sleep(20); } console.log('TIMEOUT: ' + l); return false; }
const click = el => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const idle = () => $('stateLabel').textContent === 'STANDBY';
const say = async (...utterances) => { await waitFor(idle, 'idle'); speechQueue.push(...utterances); click($('micBtn')); await sleep(80); await waitFor(() => idle() && !speechQueue.length, 'after ' + utterances[0]); await sleep(80); };
const lastSpeak = () => ([...events].reverse().find(e => e.startsWith('SPEAK')) || '').replace(/^SPEAK /, '');
const routeCards = () => [...d.querySelectorAll('.card-route')];
const lastRoute = () => routeCards().slice(-1)[0];
const rowText = (card) => [...card.querySelectorAll('.util-row')].map(r => r.textContent.replace(/\s+/g, ' ').trim());
const btn = (card, label) => [...card.querySelectorAll('.util-actions button')].find(b => b.textContent.includes(label));
const qs = (href) => new URLSearchParams(decodeURIComponent(/S\.browser_fallback_url=([^;]+)/.exec(href)[1]).split('?')[1]);
const pass = (c, m) => console.log((c ? 'PASS' : 'FAIL') + ' — ' + m);

(async () => {
  await sleep(300);

  console.log('--- 1. Lokacija odbijena: polazak prepušten Google Kartama ---');
  await say('Jarvis daj mi upute do Trogira');
  let card = lastRoute();
  pass(geoCalls === 1, 'Jarvis je zatražio trenutnu lokaciju');
  pass(card && rowText(card).some(r => r.includes('odredit će Google Karte')), 'Kartica: polazak "Tvoja lokacija (odredit će Google Karte)"');
  pass(card.textContent.includes('Dopuštenja') && card.textContent.includes('Lokacija'), 'Kartica objašnjava kako dopustiti lokaciju');
  pass(lastSpeak().includes('Nisam mogao odrediti tvoju lokaciju'), 'Jarvis to kaže glasom');
  pass(calls.gemini === 0, 'Bez AI modela');
  click(btn(card, 'Navigacija')); await sleep(30);
  let nav = qs(opened.slice(-1)[0]);
  pass(opened.slice(-1)[0].startsWith('intent://www.google.com/maps/dir/') && opened.slice(-1)[0].includes('package=com.google.android.apps.maps'), 'Navigacija otvara aplikaciju Google Karte (Android)');
  pass(!nav.has('origin') && nav.get('destination') === '43.517000,16.251000' && nav.get('travelmode') === 'driving' && nav.get('dir_action') === 'navigate', 'Bez polazišta (Google uzima živu lokaciju), odredište = Trogir, autom');
  pass(calls.photon[0] === 'Trogira' && calls.photon.includes('Trogir'), '"Trogira" (genitiv) → pronađen "Trogir"');

  console.log('--- 2. Ruta do najbližeg mjesta ---');
  geoMode = 'ok';
  await say('vodi me do najbliže ljekarne');
  card = lastRoute();
  pass(rowText(card).some(r => r.includes('Odredište') && r.includes('Ljekarna Blizu')), 'Odredište = najbliža ljekarna (ne ona dalja)');
  pass(lastSpeak().startsWith('Najbliža ljekarna je Ljekarna Blizu, Obala, 450 metara od tebe.'), 'Glasom: koja je, adresa i udaljenost');
  pass(calls.overpass.slice(-1)[0].includes('around:2000,43.50810,16.44020'), 'Traženje oko trenutne lokacije');

  console.log('--- 3. Ruta s trenutne lokacije ---');
  calls.osrm.length = 0;
  await say('kako da dođem do Trogira');
  card = lastRoute();
  pass(rowText(card).some(r => r.startsWith('Polazak') && r.includes('Tvoja lokacija (±12 m)')), 'Polazak = trenutna lokacija s točnošću');
  pass(rowText(card).some(r => r.startsWith('Odredište') && r.includes('Trogir')), 'Odredište Trogir');
  pass(calls.osrm.length === 1 && calls.osrm[0].includes('routed-car/route/v1/driving/16.440200,43.508100;16.251000,43.517000'), 'Izračun rute od lokacije do odredišta');
  pass(rowText(card).some(r => /Ukupno autom\s*16,\d km · 2\d min/.test(r)), 'Kartica: udaljenost i vrijeme');
  pass(/^Ruta je spremna: 16 kilometara, vožnja traje otprilike 2\d minut[ae]\./.test(lastSpeak()), 'Glasom (ispravna gramatika): ' + lastSpeak());
  pass(card.querySelector('iframe.route-map').getAttribute('src').startsWith('https://maps.google.com/maps?saddr=43.508100%2C16.440200&daddr=43.517000%2C16.251000'), 'Karta prikazuje rutu');
  const oldCards = routeCards().length;

  console.log('--- 4. Usputna stajališta ---');
  await say('dodaj usput najbliži dućan');
  card = lastRoute();
  pass(routeCards().length === oldCards, 'Ista kartica se ažurira (nema nove)');
  pass(calls.overpass.slice(-1)[0].includes('around:1500,43.50810,16.44020,'), 'Traženje dućana uzduž rute');
  pass(rowText(card).some(r => r.includes('Usput 1') && r.includes('Market Kod Ive')), 'Dućan dodan kao stajalište');
  pass(/^Dodao sam usput Market Kod Ive, (na samoj ruti|\d+ metara od rute)\. Ruta je sada \d+ kilometara/.test(lastSpeak()), 'Glasom: ' + lastSpeak());
  click(btn(card, 'Benzinska'));
  await waitFor(() => rowText(lastRoute()).some(r => r.includes('INA')), 'benzinska');
  await waitFor(idle, 'idle'); await sleep(60);
  const rows = rowText(lastRoute());
  pass(rows.some(r => r.includes('Usput 1') && r.includes('INA, Primorska cesta 5')), 'Tipka "+ Benzinska": odabrana prva pumpa uz rutu (ne ona 5 km od rute, ni kasnija)');
  pass(rows.some(r => r.includes('Usput 2') && r.includes('Market Kod Ive')), 'Stajališta poredana redom kojim su na ruti');
  pass(calls.osrm.slice(-1)[0].split(';').length === 4, 'Ruta preračunata kroz oba stajališta');

  console.log('--- 5. Popis za kupovinu i dalje radi dok je ruta aktivna ---');
  const n = calls.overpass.length;
  await say('dodaj mlijeko na popis');
  pass(calls.overpass.length === n && lastSpeak().includes('Dodao sam: mlijeko'), '"dodaj mlijeko na popis" ide na popis, ne u rutu');

  console.log('--- 6. Navigacija sa stajalištima ---');
  events.length = 0;
  await say('pokreni navigaciju');
  nav = qs(opened.slice(-1)[0]);
  pass(nav.get('waypoints') && nav.get('waypoints').split('|').length === 2 && nav.get('waypoints').startsWith(`${FUEL_EARLY.lat.toFixed(6)},${FUEL_EARLY.lng.toFixed(6)}|`), 'Google Karte dobivaju oba stajališta, pravim redom');
  pass(!nav.has('origin'), 'Polazak = živa lokacija');
  pass(!events.some(e => e.startsWith('SPEAK')), 'Jarvis ne priča preko Google Karata');

  console.log('--- 7. Micanje stajališta ---');
  await say('makni zadnje stajalište');
  pass(!rowText(lastRoute()).some(r => r.includes('Market Kod Ive')) && rowText(lastRoute()).some(r => r.includes('INA')), '"makni zadnje stajalište"');
  pass(lastSpeak().startsWith('Maknuo sam stajalište Market Kod Ive.'), 'Glasom potvrđeno');
  await say('makni benzinsku');
  pass(!rowText(lastRoute()).some(r => r.includes('Usput ')), '"makni benzinsku" — ruta bez stajališta');

  console.log('--- 8. Zadani polazak ---');
  calls.osrm.length = 0;
  await say('daj mi upute od Kaštela do Trogira');
  card = lastRoute();
  pass(routeCards().length === oldCards + 1, 'Nova ruta = nova kartica');
  pass(rowText(card).some(r => r.startsWith('Polazak') && r.includes('Kaštela')), 'Polazak = izgovoreno mjesto');
  pass(calls.osrm[0].includes(`/driving/${KASTELA.lng.toFixed(6)},${KASTELA.lat.toFixed(6)};`), 'Ruta računata od zadanog polaska');
  click(btn(card, 'Navigacija')); await sleep(30);
  nav = qs(opened.slice(-1)[0]);
  pass(nav.get('origin') === '43.548000,16.350000', 'Google Karte dobivaju zadani polazak');
  pass(routeCards()[routeCards().length - 2].querySelector('.util-actions') === null, 'Stara kartica više nema tipke');
  await say('daj mi upute od Kaštela to Trogir');
  pass(rowText(lastRoute()).some(r => r.startsWith('Polazak') && r.includes('Kaštela')), '"od X to Y" također radi');

  console.log('--- 9. Sve u jednoj rečenici, pješice ---');
  calls.osrm.length = 0;
  await say('ruta do Trogira pješice usput najbližu benzinsku');
  pass(calls.osrm.every(u => u.includes('routed-foot')), 'Pješice → pješačka ruta');
  pass(rowText(lastRoute()).some(r => r.includes('Usput 1') && r.includes('INA')), 'Stajalište iz iste rečenice');
  pass(lastSpeak().includes('hod traje otprilike') && lastSpeak().includes('Usput: INA'), 'Glasom: ' + lastSpeak());

  console.log('--- 10. Gola "najbliža benzinska" odmah nakon rute ide u rutu ---');
  await say('makni sva stajališta');
  await say('najbliža benzinska');
  pass(rowText(lastRoute()).some(r => r.includes('Usput 1') && r.includes('INA')), 'Dodana na trenutnu rutu');

  console.log('--- 11. Nije ruta → AI model ---');
  const g = calls.gemini;
  await say('koja je najbliža zvijezda Suncu');
  pass(calls.gemini === g + 1, '"koja je najbliža zvijezda Suncu" — odgovara AI model, ne karta');

  console.log('--- 12. Slobodna rečenica preko AI modela (alat plan_route) ---');
  const before = routeCards().length;
  await say('trebao bih stići do Trogira s jednim stajalištem kod benzinske');
  await waitFor(() => calls.geminiBodies.length >= g + 3, 'gemini follow-up');
  await waitFor(idle, 'idle'); await sleep(80);
  pass(routeCards().length === before + 1 && rowText(lastRoute()).some(r => r.includes('Usput 1') && r.includes('INA')), 'AI model planira rutu sa stajalištem');
  const fr = JSON.stringify(calls.geminiBodies.slice(-1)[0].contents);
  pass(fr.includes('Route card shown') && fr.includes('the user\'s current GPS location'), 'Model dobiva sažetak rute (polazak = GPS)');
  pass(lastSpeak().endsWith('Ruta je spremna, gospodine.'), 'Model izgovara kratki sažetak');
  const decls = calls.geminiBodies[0].tools[0].functionDeclarations.map(x => x.name);
  pass(['plan_route', 'add_route_stop', 'start_navigation', 'show_ideas'].every(x => decls.includes(x)), 'Novi alati poslani modelu');

  console.log('--- 13. "gdje je najbliža ljekarna" kad nema aktivne rute ---');
  const realNow = w.Date.now; w.Date.now = () => realNow() + 4 * 3600000; // ruta je istekla
  const cardsBefore = routeCards().length;
  await say('gdje je najbliža ljekarna');
  pass(routeCards().length === cardsBefore + 1 && rowText(lastRoute()).some(r => r.startsWith('💊 Odredište') && r.includes('Ljekarna Blizu')), 'Nova ruta do najbliže ljekarne');
  pass(lastSpeak().startsWith('Najbliža ljekarna je Ljekarna Blizu, Obala, 450 metara od tebe. Ruta je spremna'), 'Glasom: ' + lastSpeak());
  await say('dodaj usput bankomat');
  pass(lastSpeak().startsWith('Blizu rute nisam našao bankomat.'), 'Kad stajališta nema, Jarvis to kaže');
  process.exit(0);
})().catch(e => { console.error('TEST ERROR', e); process.exit(1); });
