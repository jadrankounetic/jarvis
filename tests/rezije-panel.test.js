const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/<script src="https:\/\/accounts\.google\.com[^>]*><\/script>/, '');

// ---------- Lažna Firebase baza ----------
const P = { c_m3_v: 1.68, fix_v: 0, c_kwh_s: 0.142714, mjer: 1.73, pdv_s: 0.13, doi: 0.982, smece: 0, kom: 0, amis: 0, hrt: 10.62, ost: 0 };
const db = { params: { ...P }, entries: [
  { id: 1, d: '01.07.2026.', v: 1250, k: 12000, p: { ...P } },
  { id: 2, d: '01.08.2026.', v: 1262, k: 12150, p: { ...P } },
] };
const fbLog = [];
// ---------- Lažni Gemini ----------
const geminiUtterances = []; let geminiCalls = 0; const visionQueue = []; let lastGeminiBody = null;
function geminiChat(body) {
  geminiCalls++; lastGeminiBody = body;
  const last = body.contents[body.contents.length - 1];
  const fr = last.parts.find(p => p.functionResponse);
  if (fr) return [{ text: 'Rezultat: ' + fr.functionResponse.name + '.' }];
  const text = last.parts.map(p => p.text || '').join(' ');
  geminiUtterances.push(text);
  if (/upiši očitanje/.test(text)) return [{ text: 'Voda 1275, struja 12250.' }, { functionCall: { name: 'add_meter_reading', args: { water_m3: 1275, electricity_kwh: 12250 } } }];
  if (/koliko su bile režije/.test(text)) return [{ text: 'Trenutak, provjeravam.' }, { functionCall: { name: 'get_utility_summary', args: { periods: 3 } } }];
  if (/promijeni hrt/.test(text)) return [{ functionCall: { name: 'update_utility_price', args: { key: 'hrt', value: 11 } } }];
  if (/obriši zadnje očitanje/.test(text)) return [{ functionCall: { name: 'delete_last_meter_reading', args: {} } }];
  return [{ text: 'OK.' }];
}
const res = (obj) => ({ ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(obj ?? null)), text: async () => JSON.stringify(obj ?? null), clone() { return this; } });
async function fakeFetch(url, opts = {}) {
  url = String(url);
  if (url.includes('generativelanguage')) {
    const body = JSON.parse(opts.body);
    if (body.contents[0].parts.some(p => p.inlineData)) return res({ candidates: [{ content: { parts: [{ text: visionQueue.shift() }] } }] });
    return res({ candidates: [{ content: { parts: geminiChat(body) } }], usageMetadata: {} });
  }
  if (url.startsWith('https://test-rtdb.example.app/')) {
    const u = new URL(url); const segs = u.pathname.replace(/\.json$/, '').split('/').filter(Boolean).slice(1);
    const method = opts.method || 'GET'; fbLog.push(method + ' /' + segs.join('/'));
    const body = opts.body ? JSON.parse(opts.body) : null;
    if (method === 'GET') return res(segs.length === 0 ? db : segs[0] === 'entries' ? db.entries : db.params);
    if (method === 'PUT' && segs[0] === 'entries' && segs.length === 2) { db.entries[Number(segs[1])] = body; return res(body); }
    if (method === 'PUT' && segs[0] === 'entries') { db.entries = body; return res(body); }
    if (method === 'PATCH' && segs[0] === 'params') { Object.assign(db.params, body); return res(body); }
    if (method === 'DELETE' && segs[0] === 'entries') { const i = Number(segs[1]); if (i === db.entries.length - 1) db.entries.pop(); else db.entries[i] = null; return res(null); }
  }
  throw new Error('Unexpected fetch ' + url);
}
// ---------- Lažni govor i kamera ----------
const speechQueue = [];
class FakeSR { start() { setTimeout(() => { this.onstart && this.onstart(); const t = speechQueue.shift();
  const r = [{ transcript: t }]; r.isFinal = true; this.onresult && this.onresult({ resultIndex: 0, results: [r] }); this.onend && this.onend(); }, 5); } stop() {} }

const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.github.io/jarvis/',
  beforeParse(w) {
    const ls = { jarvis_gemini_key: 'g', jarvis_boot_sequence: 'false', jarvis_lang: 'hr-HR',
      jarvis_rezije_url: 'https://test-rtdb.example.app', jarvis_rezije_node: 'house' };
    for (const k in ls) w.localStorage.setItem(k, ls[k]);
    w.fetch = fakeFetch; w.webkitSpeechRecognition = FakeSR;
    w.HTMLMediaElement.prototype.play = () => Promise.resolve();
    w.navigator.mediaDevices = { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) };
    w.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {} });
    w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,AAAA';
  } });
const w = dom.window, d = w.document, $ = id => d.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, label, ms = 3000) { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await sleep(20); } console.log('TIMEOUT waiting: ' + label); return false; }
const click = el => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const idle = () => $('stateLabel').textContent === 'STANDBY';
const say = async (t) => { await waitFor(idle, 'idle before speech'); speechQueue.push(t); click($('micBtn')); await sleep(60); await waitFor(idle, 'idle after: ' + t); await sleep(40); };
const lastText = () => { const m = d.querySelectorAll('.msg-assistant .msg-text, .msg-error .msg-text'); return m.length ? m[m.length - 1].textContent : ''; };
const btn = (label) => [...d.querySelectorAll('.util-actions button')].reverse().find(b => b.textContent.includes(label));
const capture = async () => { await waitFor(() => d.querySelector('.camera-btn-capture'), 'camera open'); await sleep(30); click(d.querySelector('.camera-btn-capture')); };
const pass = (c, m) => console.log((c ? 'PASS' : 'FAIL') + ' — ' + m);
const expectedUk = (a, b) => { const vt = (b.v - a.v) * P.c_m3_v + P.fix_v; const st = ((b.k - a.k) + P.doi) * P.c_kwh_s * (1 + P.pdv_s); return vt + st + P.smece + P.kom + P.amis + P.hrt + P.ost; };


const input = (id, v) => { const el = $(id); el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
const tab = (name) => click(d.querySelector(`.rz-tab[data-tab="${name}"]`));
const panelOpen = () => $('rzPanel').dataset.open === 'true';
(async () => {
  await sleep(300);
  console.log('--- 1. Otvaranje ploče (tipka ⌂) ---');
  click($('rezijeBtn')); await waitFor(() => d.querySelector('.rz-table'), 'table');
  pass(panelOpen() && $('rzSync').textContent === 'Povezano', 'Ploča otvorena, status Povezano');
  pass(d.querySelectorAll('.rz-stat').length === 4, '4 sažetka (prosjek, voda, struja, ukupno)');
  pass(d.querySelectorAll('.rz-table tr').length === 2, 'Tablica: 1 razdoblje iz 2 očitanja');
  pass($('rzPanel').style.bottom !== '', 'Ploča ostavlja prostor za mikrofon');

  console.log('--- 2. Unos dodirom ---');
  tab('unos'); await waitFor(() => $('rzV'), 'entry form');
  pass(d.querySelectorAll('#rzContent .rz-del').length === 1, 'Početno očitanje nema × (ne može se obrisati)');
  input('rzV', '1255'); input('rzK', '12200');
  pass($('rzPreview').textContent.includes('manja od prethodnog') && $('rzSaveReading').disabled, 'Manji broj vode: upozorenje i Spremi onemogućen');
  input('rzV', '1270');
  const uk = expectedUk(db.entries[1], { v: 1270, k: 12200 }).toFixed(2).replace('.', ',');
  pass($('rzPreview').textContent.includes(uk) && !$('rzSaveReading').disabled, `Pregled troška prije spremanja (${uk} €)`);
  pass(db.entries.length === 2, 'Ništa upisano dok se ne klikne Spremi');
  click($('rzSaveReading')); await sleep(80); await waitFor(idle, 'after save');
  pass(db.entries.length === 3 && db.entries[2].v === 1270 && fbLog.includes('PUT /entries/2'), 'Spremljeno ciljanim upisom');
  await waitFor(() => d.querySelector('.rz-section') && d.querySelector('.rz-section').textContent.includes('(3)'), 'list refresh');
  pass(d.querySelector('.rz-section').textContent.includes('(3)'), 'Popis očitanja osvježen (3)');

  console.log('--- 3. Grafovi ---');
  tab('grafovi'); await waitFor(() => d.querySelectorAll('.rz-chart svg').length, 'charts');
  pass(d.querySelectorAll('.rz-chart svg').length === 2, 'Dva grafa (struktura + trend)');
  pass(d.querySelectorAll('.rz-chart svg')[0].querySelectorAll('rect').length === 2 * 3 + 3, 'Stupci: 2 razdoblja × 3 dijela + legenda');

  console.log('--- 4. Cijene ---');
  tab('cijene'); await waitFor(() => $('rzp_hrt'), 'prices');
  pass($('rzp_pdv_s').value === '13', 'PDV prikazan kao 13 (%)');
  const logLen = fbLog.length;
  click($('rzSavePrices')); await sleep(80);
  pass($('rzPriceStatus').textContent.includes('Nema promjena') && !fbLog.slice(logLen).includes('PATCH /params'), 'Bez promjena: ništa se ne šalje');
  input('rzp_hrt', '11'); click($('rzSavePrices')); await waitFor(() => $('rzPriceStatus') && $('rzPriceStatus').textContent.includes('spremljene'), 'price saved');
  pass(db.params.hrt === 11 && db.params.pdv_s === 0.13 && db.params.c_kwh_s === P.c_kwh_s, 'Promijenjen samo HRT, ostale cijene netaknute');
  pass(db.entries[2].p.hrt === 10.62, 'Stara očitanja zadržala stare cijene');

  console.log('--- 5. Brisanje iz tablice (srednje očitanje) ---');
  tab('tablica'); await waitFor(() => d.querySelectorAll('.rz-table .rz-del').length === 2, 'table rows');
  const midId = db.entries[1].id;
  click(d.querySelector(`.rz-table .rz-del[data-id="${midId}"]`));
  await waitFor(() => $('pwModal').dataset.open === 'true', 'password');
  $('pwInput').value = '1234'; click($('pwConfirm')); await sleep(100);
  pass(db.entries.length === 2 && !db.entries.some(e => e === null) && !db.entries.some(e => e.id === midId), 'Obrisano srednje očitanje, lista bez rupa');

  console.log('--- 6. Glasom: otvaranje i zatvaranje ---');
  click($('rzClose')); pass(!panelOpen(), 'Zatvaranje tipkom ✕');
  const g0 = geminiCalls;
  await say('otvori režije grafove');
  pass(panelOpen() && d.querySelector('.rz-tab.active').dataset.tab === 'grafovi' && geminiCalls === g0, '"otvori režije grafove" — lokalno, na kartici Grafovi');
  await say('zatvori režije');
  pass(!panelOpen(), '"zatvori režije" zatvara ploču');

  console.log('--- 7. Glasovni upis dok je ploča otvorena ---');
  click($('rezijeBtn')); await sleep(80);
  await say('upiši očitanje voda 1275 struja 12250');
  pass(d.querySelector('.rz-tab.active').dataset.tab === 'unos' && $('rzV').value === '1275' && $('rzK').value === '12250', 'Ploča se sama prebacila na Unos s izgovorenim brojevima');
  await say('potvrdi');
  pass(db.entries.length === 3 && db.entries[2].k === 12250, '"potvrdi" spremilo, ploča otvorena');

  console.log('--- 8. Slikanje iz ploče ---');
  tab('unos'); await waitFor(() => $('rzV'), 'form');
  visionQueue.push('{"type":"water","value":1288,"confidence":"high","note":""}');
  click(d.querySelector('.rz-cam[data-meter="v"]'));
  pass(!panelOpen(), 'Ploča se sklonila za kameru');
  await capture(); await waitFor(panelOpen, 'panel back', 4000); await waitFor(() => $('rzV'), 'form back');
  pass(panelOpen() && $('rzV').value === '1288' && $('rzK').value === '', 'Vraćeno na Unos, voda popunjena s fotografije');
  process.exit(0);
})().catch(e => { console.error('TEST ERROR', e); process.exit(1); });
