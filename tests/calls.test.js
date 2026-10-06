const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/<script src="https:\/\/accounts\.google\.com[^>]*><\/script>/, '');
const res = (o) => ({ ok: true, status: 200, json: async () => o, text: async () => JSON.stringify(o), clone() { return this; } });
const geminiTexts = [];
async function fakeFetch(url, opts = {}) {
  if (String(url).includes('generativelanguage')) {
    const body = JSON.parse(opts.body), last = body.contents[body.contents.length - 1];
    if (last.parts.some(p => p.functionResponse)) return res({ candidates: [{ content: { parts: [{ text: 'Gotovo.' }] } }] });
    const text = last.parts.map(p => p.text || '').join(' '); geminiTexts.push(text);
    if (/nazvati ivanu/.test(text)) return res({ candidates: [{ content: { parts: [{ text: 'Zovem Ivanu.' }, { functionCall: { name: 'make_phone_call', args: { contact_name: 'Ivanu' } } }] } }] });
    return res({ candidates: [{ content: { parts: [{ text: 'Danas imate sastanak u 10.' }] } }] });
  }
  throw new Error('Unexpected fetch ' + url);
}
const speechQueue = []; const dialed = [];
class FakeSR { start() { setTimeout(() => { this.onstart && this.onstart(); const r = [{ transcript: speechQueue.shift() }]; r.isFinal = true;
  this.onresult && this.onresult({ resultIndex: 0, results: [r] }); this.onend && this.onend(); }, 5); } stop() {} }
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.github.io/jarvis/',
  beforeParse(w) {
    for (const [k, v] of Object.entries({ jarvis_gemini_key: 'g', jarvis_boot_sequence: 'false', jarvis_lang: 'hr-HR' })) w.localStorage.setItem(k, v);
    w.fetch = fakeFetch; w.webkitSpeechRecognition = FakeSR;
    w.HTMLAnchorElement.prototype.click = function () { if (this.getAttribute('href').startsWith('tel:')) dialed.push(this.getAttribute('href')); };
  } });
const w = dom.window, d = w.document, $ = id => d.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, l, ms = 3000) { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await sleep(20); } console.log('TIMEOUT: ' + l); return false; }
const click = el => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const idle = () => $('stateLabel').textContent === 'STANDBY';
const say = async t => { await waitFor(idle, 'idle'); speechQueue.push(t); click($('micBtn')); await sleep(60); await waitFor(idle, 'after ' + t); await sleep(40); };
const lastCard = () => { const c = d.querySelectorAll('.card-call'); return c[c.length - 1]; };
const cardInfo = () => { const c = lastCard(); return c ? { href: c.querySelector('.call-btn').getAttribute('href'), name: c.querySelector('.call-name').textContent } : {}; };
const pass = (c, m) => console.log((c ? 'PASS' : 'FAIL') + ' — ' + m);
const input = (id, v) => { $(id).value = v; };

(async () => {
  await sleep(300);
  console.log('--- 1. Postavke: protokol s brojem, kontakti ---');
  click($('settingsBtn')); await sleep(30);
  input('protocolNameInput', 'Hitno'); input('protocolPhoneInput', 'abc'); click($('addProtocolBtn'));
  pass($('protocolStatus').textContent.includes('znamenke') && JSON.parse(w.localStorage.getItem('jarvis_protocols') || '[]').length === 0, 'Neispravan broj se ne sprema, uz objašnjenje');
  input('protocolPhoneInput', '+385 91 234 5678'); click($('addProtocolBtn'));
  input('protocolNameInput', 'Jutro'); input('protocolPromptInput', 'Reci mi kalendar za danas.'); input('protocolPhoneInput', '091 444 4444'); click($('addProtocolBtn'));
  pass(d.querySelector('#protocolsList').textContent.includes('📞 +385 91 234 5678'), 'Protokol samo s brojem (bez prompta) dodan i prikazan');
  for (const [n, p] of [['Marko', '+385911111111'], ['Ivana', '092 222 2222'], ['Mama', '091 333 3333']]) { input('contactNameInput', n); input('contactPhoneInput', p); click($('addContactBtn')); }
  click($('closeSettings'));

  console.log('--- 2. Protokol s brojem ---');
  let g0 = geminiTexts.length;
  await say('pokreni protokol hitno');
  pass(cardInfo().href === 'tel:+385912345678', 'Kartica poziva s ispravnim brojem');
  pass(dialed[dialed.length - 1] === 'tel:+385912345678', 'Aplikacija za pozive otvorena odmah s tim brojem');
  pass(geminiTexts.length === g0, 'Protokol s brojem ne troši AI poziv');

  console.log('--- 3. Protokol s promptom i brojem ---');
  g0 = geminiTexts.length; const d0 = dialed.length;
  await say('pokreni protokol jutro'); await waitFor(() => dialed.length > d0, 'dial after prompt');
  pass(geminiTexts[g0] === 'Reci mi kalendar za danas.', 'Prvo se izvrši prompt protokola');
  pass(dialed[dialed.length - 1] === 'tel:0914444444' && cardInfo().name === 'Nazovi Jutro', 'Zatim poziv na broj iz protokola');

  console.log('--- 4. "nazovi <ime>" (padeži) ---');
  g0 = geminiTexts.length;
  await say('nazovi Marka');
  pass(cardInfo().name === 'Nazovi Marko' && cardInfo().href === 'tel:+385911111111', '"nazovi Marka" → kontakt Marko');
  await say('nazovi mamu');
  pass(cardInfo().name === 'Nazovi Mama' && cardInfo().href === 'tel:0913333333', '"nazovi mamu" → kontakt Mama');
  await say('nazovi 091 555 6666');
  pass(cardInfo().href === 'tel:0915556666', 'Izgovoreni broj');
  pass(geminiTexts.length === g0, 'Sve tri naredbe obrađene lokalno, bez AI modela');

  console.log('--- 5. Preko AI modela ---');
  const d1 = dialed.length;
  await say('možeš li nazvati ivanu');
  pass(cardInfo().name === 'Nazovi Ivana' && cardInfo().href === 'tel:0922222222', 'Alat make_phone_call pronašao kontakt Ivana');
  pass(dialed.length === d1 + 1 && dialed[dialed.length - 1] === 'tel:0922222222', 'Aplikacija za pozive otvorena tek nakon odgovora');
  g0 = geminiTexts.length;
  await say('nazovi Petra');
  pass(geminiTexts.length === g0 + 1, 'Nepoznato ime proslijeđeno AI modelu (može pitati za broj)');
  process.exit(0);
})().catch(e => { console.error('TEST ERROR', e); process.exit(1); });
