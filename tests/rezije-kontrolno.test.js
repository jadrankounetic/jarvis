// Obračunska i kontrolna očitanja (isti zapis kao aplikacija za režije: ko: true, v: 0),
// "glavno stanje struje", HEP Plavi izračun i procjena troška od zadnjeg obračunskog očitanja.
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

const OLD = { c_m3_v: 1.68, fix_v: 0, c_kwh_s: 0.142714, mjer: 1.73, pdv_s: 0.13, doi: 0.982, smece: 0, kom: 0, amis: 0, hrt: 10.62, ost: 0 };
const PH = { c_m3_v: 1.68, fix_v: 0, c_opsk: 0.091324, c_dist: 0.037608, c_prij: 0.014716, c_oie: 0.013239, c_sol: 0.003982, c_solp: 0.003982, n_omm: 1.983, n_opsk: 0.982, pdv_s: 0.13, smece: 0, kom: 0, amis: 0, hrt: 10.62, ost: 0 };
// Glavno očitanje 1. u mjesecu; kontrolna između. Zadnje obračunsko je 1. prošlog mjeseca, kontrolna nakon njega su prije 5 i 2 dana.
const now = new Date(); const mainDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
const k1 = new Date(now.getTime() - 5 * 86400000), k2 = new Date(now.getTime() - 2 * 86400000);
const MAIN = hrDate(mainDate), K1 = hrDate(k1), K2 = hrDate(k2);
const prevMain = hrDate(new Date(mainDate.getFullYear(), mainDate.getMonth() - 1, 1));
const firstMain = hrDate(new Date(mainDate.getFullYear(), mainDate.getMonth() - 2, 1));
const db = { params: { ...PH }, entries: [
  { id: 1, d: firstMain, v: 1200, k: 11500, p: { ...OLD } },
  { id: 2, d: prevMain, v: 1212, k: 11800, p: { ...OLD } }, // staro razdoblje: cijene svog vremena
  { id: 3, d: hrDate(new Date(mainDate.getTime() - 12 * 86400000)), v: 0, k: 11950, p: { ...PH }, ko: true },
  { id: 4, d: MAIN, v: 1225, k: 12100, p: { ...PH } },
  { id: 5, d: K1, v: 0, k: 12240, p: { ...PH }, ko: true },
  { id: 6, d: K2, v: 0, k: 12300, p: { ...PH }, ko: true },
] };
const fbLog = [];
let geminiCalls = 0;
function geminiChat(body) {
  geminiCalls++;
  const last = body.contents[body.contents.length - 1];
  const fr = last.parts.find(p => p.functionResponse);
  if (fr) return [{ text: 'U redu.' }];
  const text = last.parts.map(p => p.text || '').join(' ');
  if (/kontrolno očitanje struje 12400/.test(text)) return [{ functionCall: { name: 'add_meter_reading', args: { electricity_kwh: 12400, control: true } } }];
  const m = /upiši struju (\d+)/.exec(text);
  if (m) return [{ functionCall: { name: 'add_meter_reading', args: { electricity_kwh: Number(m[1]) } } }];
  if (/koliko sam struje potrošio ovaj mjesec/.test(text)) return [{ functionCall: { name: 'get_meter_status', args: { meter: 'electricity', kind: 'control' } } }];
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
  console.log('--- 1. "Glavno stanje struje" ---');
  await say('Jarvis, glavno stanje struje');
  let card = lastCard('STANJE BROJILA');
  pass(card && rows(card).some(r => r.includes('Obračunsko očitanje') && r.includes(MAIN)) && rows(card).some(r => r.includes('Struja') && r.includes('12.100 kWh')), 'Kartica: obračunsko očitanje (ne zadnje kontrolno) — 12.100 kWh');
  pass(!rows(card).some(r => r.includes('Kontrolno')), 'Bez kontrolnih očitanja');
  pass(lastSpoken() === `Glavno stanje struje, prema obračunskom očitanju od ${spokenDate(mainDate)}, je 12.100 kilovatsati.`, 'Glasom: ' + lastSpoken());
  pass(geminiCalls === 0, 'Lokalno, bez AI modela');
  await say('koje je obračunsko stanje vode');
  pass(lastSpoken() === `Glavno stanje vode, prema obračunskom očitanju od ${spokenDate(mainDate)}, je 1.225 kubika.`, '"obračunsko stanje vode": ' + lastSpoken());

  console.log('--- 2. Kontrolno stanje i stanje brojila ---');
  const kw = 12300 - 12100, dn = days(MAIN, K2), proc = hep(kw, Math.round(dn / 30 * 100) / 100, PH);
  await say('kontrolno stanje');
  card = lastCard('STANJE BROJILA');
  pass(rows(card).some(r => r.includes('Kontrolno očitanje') && r.includes(K2)) && rows(card).some(r => r.includes(`${kw} kWh`) && r.includes(`${dn} dan`)), `Zadnje kontrolno: ${kw} kWh u ${dn} dana od obračuna`);
  pass(rows(card).some(r => r.includes('Procjena troška struje') && r.includes(eurHr(proc))), `Procjena kao u aplikaciji: ${eurHr(proc)}`);
  pass(lastSpoken().startsWith(`Zadnje kontrolno očitanje od ${spokenDate(k2)}: 12.300 kilovatsati, to je ${kw} od obračunskog`), 'Glasom: ' + lastSpoken());
  await say('stanje brojila');
  card = lastCard('STANJE BROJILA');
  pass(rows(card).some(r => r.includes('Voda') && r.includes('1.225')) && rows(card).some(r => r.includes('Kontrolno očitanje')), '"stanje brojila": obračunsko (voda i struja) + kontrolno');

  console.log('--- 3. Tablica i izračun bez kontrolnih ---');
  click($('rezijeBtn')); await waitFor(() => d.querySelector('.rz-table'), 'table');
  const main = d.querySelector('.rz-table:not(.rz-ko-table)'), ko = d.querySelector('.rz-ko-table');
  pass(main.querySelectorAll('tr').length === 3, 'Tablica: 2 razdoblja iz 3 obračunska očitanja (kontrolna izostavljena)');
  pass(ko && ko.querySelectorAll('tr').length === 4 && d.querySelector('.rz-ko-title').textContent.includes('informativno'), 'Posebna tablica s 3 kontrolna očitanja (informativno)');
  const stHep = hep(12100 - 11800, 1, PH), vt = (1225 - 1212) * 1.68, uk = vt + stHep + 10.62;
  pass(main.textContent.replace(/\s+/g, ' ').includes(uk.toLocaleString('hr-HR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })), `Zadnje razdoblje po HEP Plavi: ${eurHr(uk)}`);
  const stOld = ((11800 - 11500) + OLD.doi) * OLD.c_kwh_s * (1 + OLD.pdv_s), ukOld = 12 * 1.68 + stOld + 10.62;
  pass(main.textContent.includes(ukOld.toLocaleString('hr-HR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })), `Staro razdoblje po svojim (starim) cijenama: ${eurHr(ukOld)}`);
  click(d.querySelector('.rz-tab[data-tab="cijene"]')); await waitFor(() => $('rzp_c_opsk'), 'prices');
  pass(['c_opsk', 'c_dist', 'c_prij', 'c_oie', 'c_sol', 'c_solp', 'n_omm', 'n_opsk'].every(k => $('rzp_' + k)) && !$('rzp_c_kwh_s'), 'Cijene: stavke HEP Plavi (bez stare cijene po kWh)');
  pass(d.querySelector('.rz-formula').textContent.includes('OMM'), 'Formula kao u aplikaciji');

  console.log('--- 4. Unos kontrolnog očitanja u ploči ---');
  click(d.querySelector('.rz-tab[data-tab="unos"]')); await waitFor(() => d.querySelector('.rz-kind'), 'entry');
  pass([...d.querySelectorAll('.rz-ko-item')].length === 3 && d.querySelector('.rz-ko-item').textContent.includes('kontrolno'), 'Popis: kontrolna označena');
  click(d.querySelector('.rz-kind button[data-ko="1"]')); await sleep(30);
  pass(!$('rzV') && $('rzSaveReading').textContent.includes('kontrolno'), 'Kontrolno: nema polja za vodu');
  $('rzK').value = '12350'; $('rzK').dispatchEvent(new w.Event('input')); await sleep(30);
  const kwP = 250, dnP = days(MAIN, today), procP = hep(kwP, Math.round(dnP / 30 * 100) / 100, PH);
  pass($('rzPreview').textContent.includes(`${kwP} kWh`) && $('rzPreview').textContent.includes(eurHr(procP)) && !$('rzSaveReading').disabled, `Pregled: ${kwP} kWh od obračuna, procjena ${eurHr(procP)}`);
  click($('rzSaveReading')); await waitFor(() => db.entries.length === 7, 'saved'); await waitFor(idle, 'idle'); await sleep(60);
  let e = db.entries[6];
  pass(e.ko === true && e.v === 0 && e.k === 12350 && e.d === today && JSON.stringify(Object.keys(e)) === '["id","d","v","k","p","ko"]', 'Spremljeno isto kao u aplikaciji: { id, d, v: 0, k, p, ko: true }');
  pass(fbLog.includes('PUT /entries/6'), 'Ciljani upis jednog unosa');
  pass(lastSpoken().startsWith(`Kontrolno očitanje spremljeno. Od obračunskog očitanja ${MAIN} potrošeno je ${kwP} kilovatsati`), 'Glasom: ' + lastSpoken());
  click($('rzClose')); await sleep(30);

  console.log('--- 5. Glasom preko AI modela ---');
  await say('upiši kontrolno očitanje struje 12400');
  card = lastCard('NOVO OČITANJE');
  pass(rows(card).some(r => r.includes('Vrsta') && r.includes('Kontrolno')) && !rows(card).some(r => r.startsWith('Voda')) && !btn(card, 'Spremi').disabled, 'Nacrt: kontrolno, bez vode, spremno za potvrdu');
  await say('potvrdi');
  pass(db.entries.length === 8 && db.entries[7].ko === true && db.entries[7].k === 12400, '"potvrdi" sprema kontrolno očitanje');
  await say('upiši struju 12450');
  card = lastCard('NOVO OČITANJE');
  pass(rows(card).some(r => r.includes('Vrsta') && r.includes('Obračunsko')) && btn(card, 'Spremi').disabled, 'Samo struja bez vrste → obračunsko, čeka vodu');
  const g = geminiCalls;
  await say('to je kontrolno');
  card = lastCard('NOVO OČITANJE');
  pass(geminiCalls === g && rows(card).some(r => r.includes('Kontrolno')) && !btn(card, 'Spremi').disabled, '"to je kontrolno" mijenja vrstu lokalno');
  pass(lastSpoken().startsWith('Upisujem kao kontrolno očitanje struje.'), 'Glasom: ' + lastSpoken());
  await say('potvrdi');
  pass(db.entries.length === 9 && db.entries[8].ko === true && db.entries[8].k === 12450, 'Spremljeno kao kontrolno');
  await say('upiši struju 12000');
  await say('kontrolno');
  card = lastCard('NOVO OČITANJE');
  pass(card.textContent.includes('manja od prethodnog') && btn(card, 'Spremi').disabled, 'Kontrolno manje od zadnjeg stanja → ne može se spremiti');
  await say('odustani');

  console.log('--- 6. Glavno stanje i dalje obračunsko ---');
  await say('glavno stanje struje');
  pass(lastSpoken().includes('12.100 kilovatsati'), 'Nova kontrolna ne mijenjaju glavno stanje');
  await say('koliko sam struje potrošio ovaj mjesec');
  pass(lastCard('STANJE BROJILA').textContent.includes('12.450'), 'AI alat get_meter_status prikazuje zadnje kontrolno');

  console.log('--- 7. Brisanje kontrolnog (uz lozinku) ---');
  click($('rezijeBtn')); await sleep(50); click(d.querySelector('.rz-tab[data-tab="tablica"]')); await waitFor(() => d.querySelector('.rz-ko-table'), 'ko table');
  const id9 = db.entries[8].id;
  click(d.querySelector(`.rz-ko-table .rz-del[data-id="${id9}"]`));
  await password();
  await waitFor(() => db.entries.length === 8, 'deleted');
  pass(db.entries.length === 8 && !db.entries.some(x => x.id === id9), 'Kontrolno očitanje obrisano uz lozinku 1234');
  process.exit(0);
})().catch(e => { console.error('TEST ERROR', e); process.exit(1); });
