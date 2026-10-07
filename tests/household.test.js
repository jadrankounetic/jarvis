const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/<script src="https:\/\/accounts\.google\.com[^>]*><\/script>/, '');
const res = (o) => ({ ok: true, status: 200, json: async () => o, text: async () => JSON.stringify(o), clone() { return this; } });
const pass = (c, m) => console.log((c ? 'PASS' : 'FAIL') + ' — ' + m);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pad = n => String(n).padStart(2, '0');

// One simulated phone. `opts.ls` = localStorage, `opts.url` = page address, `opts.cache` = share cache content.
function makePhone(opts = {}) {
  const P = { gemini: [], visionQueue: [], links: [], speech: [], spoken: [] };
  async function fakeFetch(url, o = {}) {
    if (!String(url).includes('generativelanguage')) throw new Error('Unexpected fetch ' + url);
    const body = JSON.parse(o.body); P.gemini.push(body);
    const parts0 = body.contents[0].parts;
    if (parts0.some(p => p.inlineData)) return res({ candidates: [{ content: { parts: [{ text: P.visionQueue.shift() || 'Opis.' }] } }] });
    const last = body.contents[body.contents.length - 1];
    const fr = last.parts.find(p => p.functionResponse);
    if (fr) return res({ candidates: [{ content: { parts: [{ text: 'Rezultat: ' + fr.functionResponse.response.content }] } }] });
    const text = last.parts.map(p => p.text || '').join(' ');
    if (/na listu staviti sir/.test(text)) return res({ candidates: [{ content: { parts: [{ functionCall: { name: 'shopping_list', args: { action: 'add', items: ['sir'] } } }] } }] });
    if (/garancija za perilicu/.test(text)) return res({ candidates: [{ content: { parts: [{ functionCall: { name: 'get_warranties', args: {} } }] } }] });
    return res({ candidates: [{ content: { parts: [{ text: 'OK.' }] } }] });
  }
  class FakeSR { start() { setTimeout(() => { this.onstart && this.onstart();
    if (P.speech.length) { const r = [{ transcript: P.speech.shift() }]; r.isFinal = true; this.onresult && this.onresult({ resultIndex: 0, results: [r] }); }
    this.onend && this.onend(); }, 5); } stop() {} }
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: opts.url || 'https://example.github.io/jarvis/',
    beforeParse(w) {
      const ls = Object.assign({ jarvis_gemini_key: 'g', jarvis_boot_sequence: 'false', jarvis_lang: 'hr-HR' }, opts.ls || {});
      for (const k in ls) w.localStorage.setItem(k, typeof ls[k] === 'string' ? ls[k] : JSON.stringify(ls[k]));
      w.fetch = fakeFetch; w.webkitSpeechRecognition = FakeSR;
      w.SpeechSynthesisUtterance = function (t) { this.text = t; };
      w.speechSynthesis = { getVoices: () => [], cancel() {}, speak(u) { P.spoken.push(u.text); setTimeout(() => u.onend && u.onend(), 5); } };
      w.HTMLAnchorElement.prototype.click = function () { P.links.push(this.getAttribute('href')); };
      w.HTMLMediaElement.prototype.play = () => Promise.resolve();
      w.navigator.mediaDevices = { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) };
      w.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {} });
      w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,IMG';
      w.URL.createObjectURL = () => 'blob:fake'; w.URL.revokeObjectURL = () => {};
      w.Image = class { set src(v) { this.width = 2000; this.height = 1000; setTimeout(() => this.onload && this.onload(), 1); } };
      const store = new Map(Object.entries(opts.cache || {}));
      P.cacheStore = store;
      w.caches = { open: async () => ({
        match: async (k) => { const k2 = String(k).replace(/^.*?(shared\/)/, '$1'); return store.has(k2) ? store.get(k2)(w) : undefined; },
        delete: async (k) => store.delete(String(k).replace(/^.*?(shared\/)/, '$1')),
      }) };
    } });
  const w = dom.window, d = w.document, $ = id => d.getElementById(id);
  async function waitFor(fn, l, ms = 4000) { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await sleep(20); } console.log('TIMEOUT: ' + l); return false; }
  const click = el => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const idle = () => $('stateLabel').textContent === 'STANDBY';
  const say = async t => { await waitFor(idle, 'idle'); P.speech.push(t); click($('micBtn')); await sleep(70); await waitFor(idle, 'after ' + t); await sleep(50); };
  const list = k => JSON.parse(w.localStorage.getItem(k) || '[]');
  const lastSpoken = () => P.spoken[P.spoken.length - 1] || '';
  const cards = title => [...d.querySelectorAll('.card-util')].filter(c => c.querySelector('.card-header').textContent.includes(title));
  const btn = (card, label) => [...card.querySelectorAll('.util-actions button')].find(b => b.textContent.includes(label));
  const capture = async () => { await waitFor(() => d.querySelector('.camera-btn-capture'), 'camera'); await sleep(30); click(d.querySelector('.camera-btn-capture')); };
  return { P, w, d, $, waitFor, click, idle, say, list, lastSpoken, cards, btn, capture };
}

(async () => {
  // ================= Shopping list =================
  console.log('--- 1. Popis za kupovinu ---');
  let ph = makePhone({ ls: { jarvis_contacts: [{ id: 'c1', name: 'Martina', phone: '+385911112222' }] } });
  await sleep(300);
  let g0 = ph.P.gemini.length;
  await ph.say('dodaj mlijeko i jaja na popis');
  pass(ph.list('jarvis_shopping').map(i => i.text).join('|') === 'mlijeko|jaja' && ph.lastSpoken() === 'Dodao sam: mlijeko, jaja.', '"dodaj mlijeko i jaja na popis" → dvije stavke');
  pass(ph.cards('POPIS ZA KUPOVINU').length === 1, 'Kartica 🛒 s popisom');
  await ph.say('dodaj mlijeko na popis');
  pass(ph.list('jarvis_shopping').length === 2 && ph.lastSpoken().includes('Već na popisu: mlijeko'), 'Duplikat se ne dodaje');
  await ph.say('trebamo kupiti kruh');
  pass(ph.list('jarvis_shopping').some(i => i.text === 'kruh'), '"trebamo kupiti kruh"');
  await ph.say('kupio sam jaja');
  pass(ph.list('jarvis_shopping').find(i => i.text === 'jaja').done && ph.lastSpoken().includes('Još 2 stavke'), '"kupio sam jaja" → označeno kupljeno');
  pass(ph.P.gemini.length === g0, 'Sve dosad lokalno, bez AI modela');
  await ph.say('kupio sam novi auto');
  pass(ph.P.gemini.length === g0 + 1, '"kupio sam novi auto" (nije na popisu) ide AI modelu');
  await ph.say('što imam na popisu');
  pass(ph.lastSpoken() === 'Na popisu imaš 2 stavke: mlijeko, kruh.', 'Čita samo nekupljeno, ispravna gramatika');
  await ph.say('makni mlijeko s popisa');
  pass(!ph.list('jarvis_shopping').some(i => i.text === 'mlijeko'), '"makni mlijeko s popisa"');
  await ph.say('pošalji popis Martini');
  const link = [...ph.d.querySelectorAll('.card-link')].pop();
  pass(link && link.getAttribute('href').startsWith('https://wa.me/385911112222?text=') && decodeURIComponent(link.getAttribute('href')).includes('• kruh') && !decodeURIComponent(link.getAttribute('href')).includes('jaja'),
    '"pošalji popis Martini" → WhatsApp s nekupljenim stavkama');
  await ph.say('možeš li na listu staviti sir');
  pass(ph.list('jarvis_shopping').some(i => i.text === 'sir'), 'Slobodna rečenica → alat shopping_list');
  await ph.say('očisti popis');
  pass(ph.list('jarvis_shopping').length === 3 && ph.lastSpoken().includes('Reci potvrdi'), '"očisti popis" traži potvrdu');
  await ph.say('potvrdi');
  pass(ph.list('jarvis_shopping').length === 0, '"potvrdi" → popis obrisan');
  await ph.say('dodaj sol na popis');
  ph.click(ph.$('settingsBtn')); await sleep(40);
  ph.click(ph.d.querySelector('#shoppingList .shop-item')); await sleep(20);
  pass(ph.list('jarvis_shopping')[0].done === true, 'Tap na stavku u postavkama označava kupljeno');
  ph.click(ph.$('shoppingClearDoneBtn')); await ph.waitFor(() => ph.$('pwModal').dataset.open === 'true', 'pw');
  ph.$('pwInput').value = '1234'; ph.click(ph.$('pwConfirm')); await sleep(40);
  pass(ph.list('jarvis_shopping').length === 0, '"Ukloni kupljeno" uz lozinku');
  ph.click(ph.$('closeSettings'));

  // ================= Warranties =================
  console.log('--- 2. Garancije ---');
  ph.P.visionQueue.push('{"product":"Perilica rublja Bosch","store":"Links","purchase_date":"2026-03-15","warranty_months":null,"price":549,"currency":"EUR","confidence":"high"}');
  await ph.waitFor(ph.idle, 'idle'); ph.P.speech.push('slikaj garanciju'); ph.click(ph.$('micBtn'));
  await ph.capture(); await ph.waitFor(() => ph.cards('GARANCIJA').length, 'warranty card'); await ph.waitFor(ph.idle, 'idle');
  const wc = ph.cards('GARANCIJA')[0];
  pass(wc.textContent.includes('Perilica rublja Bosch') && wc.textContent.includes('15.03.2028.') && wc.textContent.includes('uzeo 2 godine'), 'Pročitano s računa; trajanje nije pisalo → 2 godine, vrijedi do 15.03.2028.');
  pass(ph.list('jarvis_warranties').length === 0, 'Ništa spremljeno prije potvrde');
  await ph.say('garancija 5 godina');
  pass(ph.lastSpoken().includes('5 godina') && ph.lastSpoken().includes('15.03.2031.'), '"garancija 5 godina" → vrijedi do 15.03.2031.');
  await ph.say('potvrdi');
  const ws = ph.list('jarvis_warranties');
  pass(ws.length === 1 && ws[0].months === 60 && ws[0].store === 'Links', 'Spremljeno (60 mjeseci, Links)');
  await ph.say('koje garancije imam');
  pass(ph.lastSpoken().startsWith('Imaš 1 važeću garanciju') && ph.cards('GARANCIJE').length, '"koje garancije imam" → kartica i sažetak');
  await ph.say('do kada vrijedi garancija za perilicu');
  const follow = ph.P.gemini[ph.P.gemini.length - 1];
  pass(JSON.stringify(follow).includes('15.03.2031.'), 'AI model dobio podatke o garanciji (alat get_warranties)');

  // ================= Important dates =================
  console.log('--- 3. Važni datumi ---');
  await ph.say('zapamti da Martina ima rođendan 12. svibnja');
  let ds = ph.list('jarvis_dates');
  pass(ds.length === 1 && ds[0].name === 'Martina' && ds[0].month === 5 && ds[0].day === 12 && ds[0].type === 'rođendan', 'Martina, rođendan 12. svibnja');
  await ph.say('zapamti da Ivan ima imendan 24.6.');
  ds = ph.list('jarvis_dates');
  pass(ds.some(e => e.name === 'Ivan' && e.type === 'imendan' && e.month === 6 && e.day === 24), 'Ivan, imendan 24.6.');
  await ph.say('zapamti da Pero ima rođendan 31. veljače');
  pass(ph.lastSpoken().startsWith('Nisam razumio datum') && !ph.list('jarvis_dates').some(e => e.name === 'Pero'), 'Nemoguć datum (31. veljače) se ne sprema');
  await ph.say('koji rođendani su uskoro');
  pass(ph.cards('VAŽNI DATUMI').length && ph.lastSpoken().startsWith('Sljedeći su'), '"koji rođendani su uskoro"');

  // ================= Daily notices + morning briefing =================
  console.log('--- 4. Podsjetnici pri prvom otvaranju dana ---');
  const now = new Date(); const soon = new Date(now); soon.setDate(soon.getDate() + 10);
  const bought = new Date(soon); bought.setFullYear(bought.getFullYear() - 2);
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  ph = makePhone({ ls: {
    jarvis_contacts: [{ id: 'c1', name: 'Martina', phone: '+385911112222' }],
    jarvis_dates: [{ id: 'd1', name: 'Martina', type: 'rođendan', month: now.getMonth() + 1, day: now.getDate(), year: now.getFullYear() - 30 }],
    jarvis_warranties: [{ id: 'w1', product: 'Televizor', store: '', purchaseDate: iso(bought), months: 24 }],
    jarvis_morning_briefing: 'true',
  } });
  await sleep(1200);
  const nc = ph.cards('PODSJETNICI')[0];
  pass(nc && nc.textContent.includes('Danas: Martina — rođendan (30.)') && nc.textContent.includes('Za 10 dana istječe garancija: Televizor'), 'Kartica: rođendan danas (30.) i garancija za 10 dana');
  ph.click(ph.btn(nc, 'Čestitka')); await sleep(20);
  pass(decodeURIComponent(ph.P.links[ph.P.links.length - 1] || '').includes('Sretan rođendan, Martina! 🎉'), 'Tipka "Čestitka" otvara WhatsApp s gotovom čestitkom');
  const briefing = ph.P.gemini.find(b => JSON.stringify(b).includes('Uključi i ove podsjetnike'));
  pass(briefing && JSON.stringify(briefing).includes('Martina') && JSON.stringify(briefing).includes('ideju za poklon'), 'Jutarnji brifing spominje rođendan i predlaže poklon');

  // ================= Sharing =================
  console.log('--- 5. Podijeli s Jarvisom ---');
  const jsonRes = obj => w => new w.Response ? new w.Response(JSON.stringify(obj)) : { json: async () => obj };
  const meta = obj => () => ({ json: async () => obj });
  const fileRes = (w, data, type) => ({ blob: async () => new w.Blob([data], { type }) });
  ph = makePhone({ url: 'https://example.github.io/jarvis/?shared=t1', cache: {
    'shared/t1/meta': meta({ title: 'Recept za palačinke', text: 'brašno\njaja\nmlijeko', url: '', files: [] }) } });
  await ph.waitFor(() => ph.cards('PODIJELJENO').length, 'shared text card');
  const sc = ph.cards('PODIJELJENO')[0];
  pass(sc && sc.textContent.includes('Recept za palačinke') && ph.w.location.search === '', 'Podijeljeni tekst: kartica, adresa očišćena');
  pass(!ph.P.cacheStore.size, 'Privremeni podijeljeni sadržaj obrisan nakon čitanja');
  ph.click(ph.btn(sc, 'Na popis')); await sleep(80); await ph.waitFor(ph.idle, 'idle');
  pass(ph.list('jarvis_shopping').map(i => i.text).join('|') === 'brašno|jaja|mlijeko', '"Na popis" → 3 stavke iz recepta');
  ph.click(ph.btn(sc, 'Sažmi')); await sleep(80); await ph.waitFor(ph.idle, 'idle');
  pass(JSON.stringify(ph.P.gemini[ph.P.gemini.length - 1]).includes('[Podijeljeni sadržaj]'), '"Sažmi" šalje podijeljeni tekst AI modelu');

  ph = makePhone({ url: 'https://example.github.io/jarvis/?shared=i1', cache: {
    'shared/i1/meta': meta({ title: '', text: '', url: '', files: [{ name: 'racun.png', type: 'image/png' }] }),
    'shared/i1/0': w => fileRes(w, 'PNGDATA', 'image/png') } });
  await ph.waitFor(() => ph.cards('PODIJELJENO').length, 'shared image card');
  const ic = ph.cards('PODIJELJENO')[0];
  pass(ic.querySelector('img') && ph.btn(ic, 'Opiši') && ph.btn(ic, 'Spremi garanciju'), 'Podijeljena slika: pregled i tipke');
  ph.click(ph.btn(ic, 'Opiši')); await sleep(80); await ph.waitFor(ph.idle, 'idle');
  const vreq = ph.P.gemini[ph.P.gemini.length - 1].contents[0].parts.find(p => p.inlineData);
  pass(vreq && vreq.inlineData.mimeType === 'image/jpeg' && vreq.inlineData.data === 'IMG', 'Slika smanjena u JPEG i poslana na opis (bez kamere)');

  ph = makePhone({ url: 'https://example.github.io/jarvis/?shared=p1', cache: {
    'shared/p1/meta': meta({ title: '', text: '', url: '', files: [{ name: 'racun.pdf', type: 'application/pdf' }] }),
    'shared/p1/0': w => fileRes(w, '%PDF-1.4 test', 'application/pdf') } });
  await ph.waitFor(() => ph.cards('PODIJELJENO').length, 'shared pdf card');
  ph.click(ph.btn(ph.cards('PODIJELJENO')[0], 'Sažmi')); await sleep(80); await ph.waitFor(ph.idle, 'idle');
  const preq = ph.P.gemini[ph.P.gemini.length - 1].contents[0].parts.find(p => p.inlineData);
  pass(preq && preq.inlineData.mimeType === 'application/pdf', 'PDF poslan AI modelu kao PDF');
  ph.P.visionQueue.push('{"product":"Hladnjak","store":"","purchase_date":"2026-01-10","warranty_months":36,"confidence":"high"}');
  await ph.say('spremi garanciju');
  pass(!ph.d.querySelector('.camera-btn-capture') && ph.cards('GARANCIJA').length && ph.cards('GARANCIJA')[0].textContent.includes('10.01.2029.'), '"spremi garanciju" koristi podijeljeni PDF umjesto kamere (3 godine → 10.01.2029.)');
  process.exit(0);
})().catch(e => { console.error('TEST ERROR', e); process.exit(1); });
