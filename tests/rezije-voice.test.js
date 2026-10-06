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

(async () => {
  await sleep(300);
  console.log('--- 1. Glasovni upis + glasovna potvrda ---');
  await say('upiši očitanje voda 1275 struja 12250');
  pass(d.querySelector('.card-util') && btn('Spremi') && !btn('Spremi').disabled, 'Kartica s očitanjem, tipka Spremi aktivna');
  pass(db.entries.length === 2, 'Prije potvrde ništa nije upisano u bazu');
  const callsBefore = geminiCalls;
  await say('potvrdi');
  pass(geminiCalls === callsBefore, '"potvrdi" obrađen lokalno, bez poziva AI modela');
  pass(db.entries.length === 3 && db.entries[2].v === 1275 && db.entries[2].k === 12250 && db.entries[2].d.match(/^\d\d\.\d\d\.\d{4}\.$/), 'Novi unos na indeksu 2, ispravan format datuma');
  pass(JSON.stringify(db.entries[2].p) === JSON.stringify(P), 'Uz unos spremljena kopija trenutnih cijena');
  pass(fbLog.includes('PUT /entries/2') && !fbLog.some(l => l === 'PUT /'), 'Ciljani upis (samo jedan unos, nikad cijela baza)');
  const uk1 = expectedUk(db.entries[1], db.entries[2]).toFixed(2).replace('.', ',');
  pass(lastText().includes(uk1), `Izgovoreni iznos odgovara formuli aplikacije za režije (${uk1} €)`);

  console.log('--- 2. Slikanje oba brojila ---');
  visionQueue.push('{"type":"water","value":1290,"confidence":"high","note":""}');
  await waitFor(idle, 'idle'); speechQueue.push('slikaj brojilo vode'); click($('micBtn'));
  await capture(); await sleep(60); await waitFor(idle, 'after water photo');
  pass(lastText().includes('1.290') && lastText().includes('struje'), 'Pročitana voda, Jarvis traži brojilo struje');
  visionQueue.push('```json\n{"type":"unknown","value":"12 400","confidence":"high","note":""}\n```');
  click(btn('Struja')); await capture(); await sleep(60); await waitFor(idle, 'after electricity photo');
  pass(lastText().includes('12.400') && lastText().includes('potvrdi'), 'Nepoznat tip + razmak u broju: ispravno zaključeno da je struja (12400)');
  await say('da');
  pass(db.entries.length === 4 && db.entries[3].v === 1290 && db.entries[3].k === 12400, '"da" spremilo očitanje s fotografija');

  console.log('--- 3. Zaštita od pogrešnog očitanja ---');
  visionQueue.push('{"type":"water","value":1200,"confidence":"high","note":""}');
  await waitFor(idle, 'idle'); speechQueue.push('slikaj brojilo vode'); click($('micBtn'));
  await capture(); await sleep(60); await waitFor(idle, 'after bad photo');
  pass(lastText().includes('manja od prethodnog'), 'Manji broj od prethodnog je odbijen s objašnjenjem');
  visionQueue.push('{"type":"electricity","value":null,"confidence":"low","note":"odsjaj"}');
  click(btn('Struja')); await capture(); await sleep(60); await waitFor(idle, 'after blurry photo');
  pass(lastText().includes('Ne mogu pouzdano') && lastText().includes('odsjaj'), 'Nečitka slika: traži ponovno slikanje, ne pogađa');
  pass(btn('Spremi').disabled, 'Tipka Spremi ostaje onemogućena');
  await say('odustani');
  pass(db.entries.length === 4, '"odustani" — ništa nije upisano');

  console.log('--- 4. Upit o troškovima ---');
  const c0 = geminiCalls;
  await say('koliko su bile režije prošli mjesec');
  pass(geminiCalls - c0 === 2, 'Model je nakon "Trenutak, provjeravam" dobio rezultat i odgovorio (2 poziva)');
  pass(d.querySelector('.util-table') && d.querySelectorAll('.util-table tr').length === 4, 'Tablica s 3 razdoblja prikazana');
  const decl = lastGeminiBody.tools[0].functionDeclarations.find(f => f.name === 'get_utility_prices');
  pass(decl && !('parameters' in decl), 'Alati bez parametara se Geminiju šalju bez praznog schema');

  console.log('--- 5. Promjena cijene uz potvrdu ---');
  await say('promijeni hrt na 11 eura');
  pass(db.params.hrt === 10.62, 'Prije potvrde cijena nepromijenjena');
  await say('potvrdi');
  pass(db.params.hrt === 11 && fbLog.includes('PATCH /params'), 'Nakon potvrde: ciljana izmjena samo te cijene');
  pass(JSON.stringify(db.entries[3].p.hrt) === '10.62', 'Stara očitanja zadržala stare cijene');

  console.log('--- 6. Brisanje zadnjeg očitanja uz lozinku ---');
  await waitFor(idle, 'idle'); speechQueue.push('obriši zadnje očitanje'); click($('micBtn'));
  await waitFor(() => $('pwModal').dataset.open === 'true', 'password modal');
  $('pwInput').value = '0000'; click($('pwConfirm')); await sleep(40);
  pass(db.entries.length === 4, 'Pogrešna lozinka — ništa obrisano');
  $('pwInput').value = '1234'; click($('pwConfirm')); await sleep(80); await waitFor(idle, 'after delete');
  pass(db.entries.length === 3 && fbLog.includes('DELETE /entries/3'), 'Lozinka 1234 — obrisan samo zadnji unos');

  console.log('--- 7. Bez osobnih podataka ---');
  pass(!html.includes('test-rtdb') && !/firebasedatabase\.app\/[a-z]/.test(html), 'U kodu nema adrese baze ni čvora');
  process.exit(0);
})().catch(e => { console.error('TEST ERROR', e); process.exit(1); });
