// Puna povijest režija: potrošnja i trošak između bilo koja dva datuma (obračunska i kontrolna očitanja).
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/<script src="https:\/\/accounts\.google\.com[^>]*><\/script>/, '');
const res = (obj) => ({ ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(obj ?? null)), text: async () => JSON.stringify(obj ?? null), clone() { return this; } });
const pass = (c, m) => console.log((c ? 'PASS' : 'FAIL') + ' — ' + m);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Neovisna referenca formule aplikacije (HEP Plavi): svaka stavka zaokružena na cent.
const c2 = n => Math.round(n * 100) / 100;
const pdHr = s => { const t = s.replace(/\.$/, '').split('.'); return new Date(+t[2], +t[1] - 1, +t[0]); };
const days = (a, b) => Math.round((pdHr(b) - pdHr(a)) / 86400000);
const hep = (kw, mj, c) => { const os = c2(c2(kw * c.c_opsk) + c2(kw * c.c_prij) + c2(kw * c.c_dist) + c2(mj * c.n_opsk) + c2(mj * c.n_omm) + c2(kw * c.c_oie) + c2(kw * c.c_sol) - c2(kw * c.c_solp)); return c2(os + c2(os * c.pdv_s)); };
const eurHr = n => n.toLocaleString('hr-HR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const pad = n => String(n).padStart(2, '0');
const hrDate = dt => `${pad(dt.getDate())}.${pad(dt.getMonth() + 1)}.${dt.getFullYear()}.`;
const today = hrDate(new Date());

const PH = { c_m3_v: 1.68, fix_v: 0, c_opsk: 0.091324, c_dist: 0.037608, c_prij: 0.014716, c_oie: 0.013239, c_sol: 0.003982, c_solp: 0.003982, n_omm: 1.983, n_opsk: 0.982, pdv_s: 0.13, smece: 0, kom: 0, amis: 0, hrt: 10.62, ost: 0 };
const db = { params: { ...PH }, entries: [
  { id: 1, d: '01.09.2026.', v: 1200, k: 11800, p: { ...PH } },
  { id: 2, d: '01.10.2026.', v: 1212, k: 12100, p: { ...PH } },
  { id: 3, d: '15.10.2026.', v: 0, k: 12250, p: { ...PH }, ko: true },
  { id: 4, d: '01.11.2026.', v: 1236, k: 12390, p: { ...PH } },
  { id: 5, d: '04.11.2026.', v: 0, k: 12430, p: { ...PH }, ko: true },
  { id: 6, d: '09.11.2026.', v: 0, k: 12500, p: { ...PH }, ko: true },
] };
const fbLog = [];
let geminiCalls = 0;
const geminiBodies = [];
function geminiChat(body) {
  geminiCalls++; geminiBodies.push(body);
  const last = body.contents[body.contents.length - 1];
  if (last.parts.find(p => p.functionResponse)) return [{ text: 'Potrošeno je 70 kilovatsati.' }];
  const text = last.parts.map(p => p.text || '').join(' ');
  if (/ovaj mjesec/.test(text)) return [{ functionCall: { name: 'get_meter_history', args: { from: '2026-11-01', meter: 'electricity' } } }];
  return [{ text: 'OK.' }];
}
async function fakeFetch(url, opts = {}) {
  url = String(url);
  if (url.includes('generativelanguage')) return res({ candidates: [{ content: { parts: geminiChat(JSON.parse(opts.body)) } }], usageMetadata: {} });
  if (url.startsWith('https://test-rtdb.example.app/')) {
    const segs = new URL(url).pathname.replace(/\.json$/, '').split('/').filter(Boolean).slice(1);
    const method = opts.method || 'GET'; fbLog.push(method + ' /' + segs.join('/'));
    const body = opts.body ? JSON.parse(opts.body) : null;
    if (method === 'GET') return res(segs.length === 0 ? db : segs[0] === 'entries' ? db.entries : db.params);
    if (method === 'PUT' && segs[0] === 'entries' && segs.length === 2) { db.entries[Number(segs[1])] = body; return res(body); }
    if (method === 'PUT' && segs[0] === 'entries') { db.entries = body; return res(body); }
    if (method === 'PATCH' && segs[0] === 'params') { Object.assign(db.params, body); return res(body); }
    if (method === 'DELETE' && segs[0] === 'entries') { db.entries.pop(); return res(null); }
  }
  throw new Error('Unexpected fetch ' + url);
}
const speechQueue = [], spoken = [];
class FakeSR { start() { setTimeout(() => { this.onstart && this.onstart(); const r = [{ transcript: speechQueue.shift() }]; r.isFinal = true; this.onresult && this.onresult({ resultIndex: 0, results: [r] }); this.onend && this.onend(); }, 5); } stop() {} }
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.github.io/jarvis/',
  beforeParse(w) {
    const ls = { jarvis_gemini_key: 'g', jarvis_boot_sequence: 'false', jarvis_lang: 'hr-HR', jarvis_rezije_url: 'https://test-rtdb.example.app', jarvis_rezije_node: 'house' };
    for (const k in ls) w.localStorage.setItem(k, ls[k]);
    w.fetch = fakeFetch; w.webkitSpeechRecognition = FakeSR;
    w.SpeechSynthesisUtterance = function (t) { this.text = t; };
    w.speechSynthesis = { getVoices: () => [], cancel() {}, speak(u) { spoken.push(u.text); setTimeout(() => u.onend && u.onend(), 5); } };
  } });
const w = dom.window, d = w.document, $ = id => d.getElementById(id);
async function waitFor(fn, label, ms = 3000) { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await sleep(20); } console.log('TIMEOUT waiting: ' + label); return false; }
const click = el => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const idle = () => $('stateLabel').textContent === 'STANDBY';
const say = async t => { await waitFor(idle, 'idle'); speechQueue.push(t); click($('micBtn')); await sleep(70); await waitFor(idle, 'after ' + t); await sleep(60); };
const lastSpoken = () => spoken[spoken.length - 1] || '';
const cards = title => [...d.querySelectorAll('.card-util')].filter(c => c.querySelector('.card-header').textContent.includes(title));
const lastCard = title => cards(title).slice(-1)[0];
const rows = card => [...card.querySelectorAll('.util-row')].map(r => r.textContent.replace(/\s+/g, ' ').trim());
const btn = (card, label) => [...card.querySelectorAll('.util-actions button')].find(b => b.textContent.includes(label));
const months = ['siječnja', 'veljače', 'ožujka', 'travnja', 'svibnja', 'lipnja', 'srpnja', 'kolovoza', 'rujna', 'listopada', 'studenoga', 'prosinca'];
const spokenDate = dt => `${dt.getDate()}. ${months[dt.getMonth()]} ${dt.getFullYear()}.`;
const password = async () => { await waitFor(() => $('pwModal').dataset.open === 'true', 'password'); $('pwInput').value = '1234'; click($('pwConfirm')); await sleep(80); };

(async () => {
  await sleep(300);
  console.log('--- 1. Između dva kontrolna očitanja ---');
  await say('Jarvis, koliko sam potrošio struje od 4.11.2026. do 9.11.2026.');
  let card = lastCard('POTROŠNJA');
  const c1 = hep(70, Math.round(5 / 30 * 100) / 100, PH);
  pass(card && rows(card).some(r => r.includes('Od') && r.includes('04.11.2026.') && r.includes('12430 kWh') && r.includes('kontrolno')), 'Početak: kontrolno 04.11. (12430 kWh)');
  pass(rows(card).some(r => r.includes('⚡ Potrošeno') && r.includes('70 kWh') && r.includes('5 dana') && r.includes('14,0 kWh/dan')), '70 kWh u 5 dana, 14,0 kWh/dan');
  pass(rows(card).some(r => r.includes('Procjena troška struje') && r.includes(eurHr(c1))), `Procjena po formuli aplikacije: ${eurHr(c1)}`);
  pass(lastSpoken().startsWith(`Od 4. studenoga 2026. do 9. studenoga 2026. potrošeno je 70 kilovatsati struje u 5 dana, oko 14,0 na dan, procjena troška ${eurHr(c1)}.`), 'Glasom: ' + lastSpoken());
  pass(geminiCalls === 0, 'Lokalno, bez AI modela');
  pass(card.querySelectorAll('.util-table tr').length === 3, 'Popis očitanja u razdoblju (2)');

  console.log('--- 2. Datum bez očitanja: uzima najbliže i kaže to ---');
  await say('potrošnja struje od 3.11.2026. do 10.11.2026.');
  card = lastCard('POTROŠNJA');
  pass(rows(card).some(r => r.includes('⚡ Potrošeno') && r.includes('70 kWh')), 'Najbliža očitanja: 04.11. i 09.11.');
  pass(lastSpoken().includes('Napomena: za 3. studenoga 2026. nema očitanja, pa sam uzeo ono od 4. studenoga 2026.; za 10. studenoga 2026. nema očitanja, pa sam uzeo ono od 9. studenoga 2026.'), 'Napomena o zamjeni datuma');

  console.log('--- 3. Voda samo iz obračunskih ---');
  await say('koliko sam potrošio vode od 1. rujna 2026 do 1. studenog 2026');
  card = lastCard('POTROŠNJA');
  pass(rows(card).some(r => r.includes('💧 Potrošeno') && r.includes('36 m³') && r.includes('61 dan')), 'Voda 01.09. → 01.11.: 36 m³ u 61 dan');
  pass(rows(card).some(r => r.includes('Procjena troška vode') && r.includes(eurHr(36 * 1.68))) && !rows(card).some(r => r.includes('⚡ Potrošeno')), `Samo voda, ${eurHr(36 * 1.68)}`);
  pass(card.querySelectorAll('.util-table tr').length === 5, 'Popis: 4 očitanja u razdoblju (obračunska i kontrolno)');

  console.log('--- 4. Obračunsko razdoblje = isti iznos kao u tablici ---');
  await say('razlika struje između 1.10.2026. i 1.11.2026.');
  const c4 = hep(290, 1, PH);
  pass(rows(lastCard('POTROŠNJA')).some(r => r.includes('290 kWh') && r.includes('31 dan')) && rows(lastCard('POTROŠNJA')).some(r => r.includes(eurHr(c4))), `290 kWh, ${eurHr(c4)} — kao razdoblje u tablici (mjesec = 1)`);
  click($('rezijeBtn')); await sleep(50); click(d.querySelector('.rz-tab[data-tab="tablica"]'));
  await waitFor(() => d.querySelector('.rz-table'), 'table');
  pass(d.querySelector('.rz-table').textContent.includes(c4.toLocaleString('hr-HR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })), 'Tablica režija ima isti iznos struje');
  click($('rzClose')); await sleep(30);

  console.log('--- 5. Struja i voda zajedno, od datuma do danas ---');
  await say('koliko sam potrošio struje i vode od 1. listopada 2026');
  card = lastCard('POTROŠNJA');
  pass(rows(card).some(r => r.includes('⚡ Potrošeno') && r.includes('400 kWh')) && rows(card).some(r => r.includes('💧 Potrošeno') && r.includes('24 m³')), 'Struja do zadnjeg (kontrolnog) očitanja, voda do zadnjeg obračunskog');

  console.log('--- 6. Preko AI modela (alat get_meter_history) ---');
  await say('koliko sam struje potrošio ovaj mjesec');
  const fr = JSON.stringify(geminiBodies[geminiBodies.length - 1].contents);
  pass(fr.includes('12390 kWh') && fr.includes('12500 kWh') && fr.includes('= 110 kWh'), 'Model dobiva razliku 01.11. → zadnje očitanje (110 kWh)');
  pass(fr.includes('All readings in this range') && fr.includes('04.11.2026. control - 12430'), 'Model dobiva i sva očitanja u razdoblju');
  pass(geminiBodies[0].tools[0].functionDeclarations.some(f => f.name === 'get_meter_history'), 'Alat get_meter_history poslan modelu');
  process.exit(0);
})().catch(e => { console.error('TEST ERROR', e); process.exit(1); });
