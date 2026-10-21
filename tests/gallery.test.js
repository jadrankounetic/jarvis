// Slika iz galerije: tipka 🖼, glasovne naredbe, opis / dokument / garancija / brojilo bez kamere.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/<script src="https:\/\/accounts\.google\.com[^>]*><\/script>/, '');
const res = (o) => ({ ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(o ?? null)), text: async () => JSON.stringify(o ?? null), clone() { return this; } });
const pass = (c, m) => console.log((c ? 'PASS' : 'FAIL') + ' — ' + m);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PR = { c_m3_v: 1.68, fix_v: 0, c_kwh_s: 0.142714, mjer: 1.73, pdv_s: 0.13, doi: 0.982, smece: 0, kom: 0, amis: 0, hrt: 10.62, ost: 0 };
const db = { params: { ...PR }, entries: [{ id: 1, d: '01.07.2026.', v: 1250, k: 12000, p: { ...PR } }] };

const G = { vision: [], chat: [], visionQueue: [] };
async function fakeFetch(url, o = {}) {
  url = String(url);
  if (url.includes('generativelanguage')) {
    const body = JSON.parse(o.body);
    if (body.contents[0].parts.some(p => p.inlineData)) { G.vision.push(body); return res({ candidates: [{ content: { parts: [{ text: G.visionQueue.shift() || 'Na slici je šalica kave.' }] } }] }); }
    G.chat.push(body);
    const last = body.contents[body.contents.length - 1];
    if (last.parts.some(p => p.functionResponse)) return res({ candidates: [{ content: { parts: [{ text: 'Dodirni tipku.' }] } }] });
    if (JSON.stringify(body.contents).includes('fotku koju sam slikao jučer')) return res({ candidates: [{ content: { parts: [{ text: 'Može.' }, { functionCall: { name: 'open_gallery', args: { purpose: 'scene' } } }] } }] });
    return res({ candidates: [{ content: { parts: [{ text: 'OK.' }] } }] });
  }
  if (url.startsWith('https://test-rtdb.example.app/')) {
    const segs = new URL(url).pathname.replace(/\.json$/, '').split('/').filter(Boolean).slice(1);
    return res(segs.length === 0 ? db : segs[0] === 'entries' ? db.entries : db.params);
  }
  throw new Error('Unexpected fetch ' + url);
}
const speech = [], spoken = [], picks = []; let getUserMediaCalls = 0; let activation = true;
class FakeSR { start() { setTimeout(() => { this.onstart && this.onstart(); if (speech.length) { const r = [{ transcript: speech.shift() }]; r.isFinal = true; this.onresult && this.onresult({ resultIndex: 0, results: [r] }); } this.onend && this.onend(); }, 5); } stop() {} }
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.github.io/jarvis/',
  beforeParse(w) {
    const ls = { jarvis_gemini_key: 'g', jarvis_boot_sequence: 'false', jarvis_lang: 'hr-HR', jarvis_rezije_url: 'https://test-rtdb.example.app', jarvis_rezije_node: 'house' };
    for (const k in ls) w.localStorage.setItem(k, ls[k]);
    w.fetch = fakeFetch; w.webkitSpeechRecognition = FakeSR;
    w.SpeechSynthesisUtterance = function (t) { this.text = t; };
    w.speechSynthesis = { getVoices: () => [], cancel() {}, speak(u) { spoken.push(u.text); setTimeout(() => u.onend && u.onend(), 5); } };
    w.HTMLMediaElement.prototype.play = () => Promise.resolve();
    w.navigator.mediaDevices = { getUserMedia: async () => { getUserMediaCalls++; return { getTracks: () => [{ stop() {} }] }; } };
    Object.defineProperty(w.navigator, 'userActivation', { configurable: true, get: () => ({ isActive: activation, hasBeenActive: true }) });
    w.HTMLInputElement.prototype.click = function () { if (this.type === 'file') picks.push({ id: this.id, accept: this.accept, capture: this.getAttribute('capture') }); };
    w.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {} });
    w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,GALIMG';
    w.URL.createObjectURL = () => 'blob:fake'; w.URL.revokeObjectURL = () => {};
    w.Image = class { set src(v) { this.width = 3000; this.height = 2000; setTimeout(() => this.onload && this.onload(), 1); } };
  } });
const w = dom.window, d = w.document, $ = id => d.getElementById(id);
async function waitFor(fn, l, ms = 4000) { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await sleep(20); } console.log('TIMEOUT: ' + l); return false; }
const click = el => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const idle = () => $('stateLabel').textContent === 'STANDBY';
const say = async t => { await waitFor(idle, 'idle'); speech.push(t); click($('micBtn')); await sleep(70); await waitFor(idle, 'after ' + t); await sleep(60); };
const cards = title => [...d.querySelectorAll('.card-util')].filter(c => c.querySelector('.card-header').textContent.includes(title));
const btn = (card, label) => [...card.querySelectorAll('.util-actions button')].find(b => b.textContent.includes(label));
const lastSpoken = () => spoken[spoken.length - 1] || '';
const pick = async (name = 'IMG_2041.jpg', type = 'image/jpeg') => {
  const input = $('galleryInput');
  Object.defineProperty(input, 'files', { configurable: true, value: [new w.File(['RAW'], name, { type })] });
  input.dispatchEvent(new w.Event('change')); await sleep(60); await waitFor(idle, 'after pick'); await sleep(60);
};
const lastVision = () => G.vision[G.vision.length - 1];

(async () => {
  await sleep(300);
  console.log('--- 1. Tipka 🖼 ---');
  const gb = $('galleryBtn');
  pass(gb && gb.closest('.action-row') && [...gb.parentNode.children].indexOf(gb) > [...gb.parentNode.children].indexOf($('micBtn')), 'Tipka 🖼 desno od mikrofona');
  click(gb); await sleep(20);
  pass(picks.length === 1 && picks[0].id === 'galleryInput' && picks[0].accept === 'image/*' && !picks[0].capture, 'Otvara galeriju (bez kamere)');
  await pick();
  let card = cards('IZ GALERIJE')[0];
  pass(card && card.querySelector('img').getAttribute('src') === 'data:image/jpeg;base64,GALIMG', 'Kartica "Iz galerije" sa smanjenom slikom');
  pass(['Opiši', 'Pročitaj dokument', 'Spremi garanciju', 'Očitaj brojilo'].every(l => btn(card, l)), 'Tipke: Opiši, Pročitaj dokument, Spremi garanciju, Očitaj brojilo');
  pass(lastSpoken() === 'Učitao sam sliku. Što da napravim s njom?', 'Jarvis pita što da napravi');
  pass(getUserMediaCalls === 0, 'Kamera se nije palila');

  console.log('--- 2. Slobodno pitanje o slici ---');
  await say('koliko kalorija ima ovo');
  let v = lastVision();
  pass(v && v.contents[0].parts.some(p => p.inlineData && p.inlineData.data === 'GALIMG') && JSON.stringify(v).includes('koliko kalorija ima ovo'), 'Prvo pitanje nakon odabira ide uz sliku');
  pass(lastSpoken() === 'Na slici je šalica kave.', 'Jarvis odgovara o slici');
  const nChat = G.chat.length;
  await say('kakvo je vrijeme sutra');
  pass(G.chat.length === nChat + 1 && G.vision.length === 1, 'Sljedeće nepovezano pitanje ide normalnom razgovoru, ne slici');

  console.log('--- 3. Tipka "Pročitaj dokument" i glas "pročitaj račun" ---');
  G.visionQueue.push('SPOKEN: Račun iz pekare na 4,20 eura.\nFIELDS:\nIznos: 4,20 EUR\nRECEIPT: yes\nAMOUNT: 4.20\nCURRENCY: EUR\nCATEGORY: Groceries');
  click(btn(card, 'Pročitaj dokument')); await sleep(80); await waitFor(idle, 'doc');
  pass(G.vision.length === 2 && getUserMediaCalls === 0 && lastSpoken().startsWith('Račun iz pekare'), 'Dokument pročitan sa slike iz galerije');
  G.visionQueue.push('SPOKEN: Isti račun, 4,20 eura.\nFIELDS:\nIznos: 4,20 EUR\nRECEIPT: no');
  await say('pročitaj račun');
  pass(G.vision.length === 3 && getUserMediaCalls === 0 && !d.querySelector('.camera-btn-capture'), '"pročitaj račun" odmah nakon toga koristi istu sliku, ne kameru');
  pass(JSON.stringify(lastVision()).includes('SPOKEN:') && !cards('NOVO OČITANJE').length, '"pročitaj" se ne miješa s "očitaj brojilo"');
  await say('što piše na ovoj slici');
  pass(G.vision.length === 4 && JSON.stringify(lastVision()).includes('što piše na ovoj slici'), '"što piše na ovoj slici" — pitanje o istoj slici');

  console.log('--- 4. Glasom: "očitaj brojilo iz galerije" ---');
  activation = true; picks.length = 0;
  await say('očitaj brojilo vode iz galerije');
  pass(picks.length === 1, 'Galerija se otvorila odmah (dodir mikrofona još vrijedi)');
  pass(cards('GALERIJA').length === 1 && btn(cards('GALERIJA')[0], 'Odaberi sliku') && cards('GALERIJA')[0].textContent.includes('brojilo'), 'Kartica s tipkom "Odaberi sliku" kao rezerva');
  pass(lastSpoken() === 'Odaberi sliku.', 'Jarvis: "Odaberi sliku."');
  G.visionQueue.push('{"type":"water","value":1262,"confidence":"high","note":""}');
  await pick('brojilo.jpg');
  await waitFor(() => cards('NOVO OČITANJE').length, 'meter draft');
  pass(cards('NOVO OČITANJE').length === 1 && cards('NOVO OČITANJE')[0].textContent.includes('1.262'), 'Brojilo očitano sa slike → nacrt očitanja (ništa nije spremljeno bez potvrde)');
  pass(getUserMediaCalls === 0 && cards('GALERIJA').length === 0, 'Bez kamere; kartica galerije maknuta');
  pass(!d.querySelector('.card-util .util-actions') || cards('IZ GALERIJE').length === 2, 'Slika iz galerije prikazana u razgovoru');
  await say('odustani');

  console.log('--- 5. Kad dodir mikrofona više ne vrijedi ---');
  activation = false; picks.length = 0;
  await say('učitaj sliku iz galerije');
  pass(picks.length === 0 && lastSpoken() === 'Dodirni tipku Odaberi sliku.', 'Ne pokušava otvoriti galeriju, nego traži dodir tipke');
  click(btn(cards('GALERIJA')[0], 'Odaberi sliku')); await sleep(20);
  pass(picks.length === 1, 'Tipka "Odaberi sliku" otvara galeriju');
  G.visionQueue.push('{"product":"Usisavač","store":"","purchase_date":"2026-03-01","warranty_months":24,"confidence":"high"}');
  await pick('garancija.jpg');
  await say('spremi garanciju');
  pass(cards('GARANCIJA').length >= 1 && cards('GARANCIJA').slice(-1)[0].textContent.includes('01.03.2028.') && getUserMediaCalls === 0, '"spremi garanciju" koristi sliku iz galerije (2 godine → 01.03.2028.)');
  await say('odustani');

  console.log('--- 6. Nije galerija ---');
  const c0 = G.chat.length, gc0 = cards('GALERIJA').length, v0 = G.vision.length;
  await say('koja je najbolja galerija u gradu');
  pass(G.chat.length === c0 + 1 && cards('GALERIJA').length === gc0 && G.vision.length === v0, '"koja je najbolja galerija u gradu" ide AI modelu (ne galeriji, ne slici)');

  console.log('--- 7. Preko AI modela (alat open_gallery) ---');
  activation = true;
  const before = cards('GALERIJA').length;
  await say('htio bih ti pokazati fotku koju sam slikao jučer');
  await waitFor(() => cards('GALERIJA').length > before, 'gallery card from AI');
  await waitFor(idle, 'idle');
  pass(cards('GALERIJA').length === before + 1 && cards('GALERIJA').slice(-1)[0].textContent.includes('opis'), 'Model prikazuje karticu s tipkom "Odaberi sliku"');
  pass(G.chat[G.chat.length - 1].tools[0].functionDeclarations.some(f => f.name === 'open_gallery'), 'Alat open_gallery poslan modelu');
  click(btn(cards('GALERIJA').slice(-1)[0], 'Odaberi sliku')); await sleep(20);
  await pick('kava.jpg');
  pass(G.vision.length >= 7 && lastVision().contents[0].parts.some(p => p.inlineData), 'Odabrana slika odmah opisana (svrha "opis")');

  console.log('--- 8. Nije slika ---');
  $('galleryInput').dispatchEvent(new w.Event('cancel'));
  await pick('popis.txt', 'text/plain');
  pass([...d.querySelectorAll('.msg-error')].slice(-1)[0].textContent.includes('nije slika'), 'Tekstualna datoteka odbijena porukom');
  process.exit(0);
})().catch(e => { console.error('TEST ERROR', e); process.exit(1); });
