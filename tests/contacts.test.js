const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/<script src="https:\/\/accounts\.google\.com[^>]*><\/script>/, '');
const res = (o) => ({ ok: true, status: 200, json: async () => o, text: async () => JSON.stringify(o), clone() { return this; } });
const geminiTexts = [];
async function fakeFetch(url, opts = {}) {
  if (String(url).includes('generativelanguage')) {
    const body = JSON.parse(opts.body), last = body.contents[body.contents.length - 1];
    if (last.parts.some(p => p.functionResponse)) return res({ candidates: [{ content: { parts: [{ text: 'Stipe, nula devet jedan sedam sedam sedam osam osam osam osam. Potvrđuješ?' }] } }] });
    const text = last.parts.map(p => p.text || '').join(' '); geminiTexts.push(text);
    if (/susjed/.test(text)) return res({ candidates: [{ content: { parts: [{ functionCall: { name: 'save_contact', args: { name: 'Stipe', phone: '091 777 8888' } } }] } }] });
    return res({ candidates: [{ content: { parts: [{ text: 'Vani je 14 stupnjeva.' }] } }] });
  }
  throw new Error('Unexpected fetch ' + url);
}
const events = []; const speechQueue = []; let picked = null;
class FakeSR { start() { setTimeout(() => { this.onstart && this.onstart(); const r = [{ transcript: speechQueue.shift() }]; r.isFinal = true;
  this.onresult && this.onresult({ resultIndex: 0, results: [r] }); this.onend && this.onend(); }, 5); } stop() {} }
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.github.io/jarvis/',
  beforeParse(w) {
    for (const [k, v] of Object.entries({ jarvis_gemini_key: 'g', jarvis_boot_sequence: 'false', jarvis_lang: 'hr-HR' })) w.localStorage.setItem(k, v);
    w.fetch = fakeFetch; w.webkitSpeechRecognition = FakeSR;
    w.HTMLAnchorElement.prototype.click = function () { if (this.getAttribute('href').startsWith('tel:')) events.push('DIAL ' + this.getAttribute('href')); };
    w.SpeechSynthesisUtterance = function (t) { this.text = t; };
    w.speechSynthesis = { getVoices: () => [], cancel() {}, speak(u) { events.push('SPEAK ' + u.text); setTimeout(() => u.onend && u.onend(), 5); } };
    w.navigator.contacts = { select: async () => picked };
  } });
const w = dom.window, d = w.document, $ = id => d.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, l, ms = 3000) { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await sleep(20); } console.log('TIMEOUT: ' + l); return false; }
const click = el => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const idle = () => $('stateLabel').textContent === 'STANDBY';
const say = async t => { await waitFor(idle, 'idle'); speechQueue.push(t); click($('micBtn')); await sleep(60); await waitFor(idle, 'after ' + t); await sleep(40); };
const contacts = () => JSON.parse(w.localStorage.getItem('jarvis_contacts') || '[]');
const find = n => contacts().find(c => c.name === n);
const lastSpeak = () => [...events].reverse().find(e => e.startsWith('SPEAK')) || '';
const lastUtilCard = () => { const c = d.querySelectorAll('.card-util'); return c[c.length - 1]; };
const pass = (c, m) => console.log((c ? 'PASS' : 'FAIL') + ' — ' + m);

(async () => {
  await sleep(300);
  console.log('--- 1. Spremanje kontakta glasom ---');
  let g0 = geminiTexts.length;
  await say('spremi kontakt Martina 091 234 5678');
  pass(lastUtilCard() && lastUtilCard().textContent.includes('NOVI KONTAKT'), 'Kartica "Novi kontakt" s imenom i brojem');
  pass(lastSpeak().includes('0 9 1 2 3 4 5 6 7 8'), 'Jarvis ponavlja broj znamenku po znamenku');
  pass(!find('Martina') && geminiTexts.length === g0, 'Ništa spremljeno prije potvrde; bez AI modela');
  await say('da li je vani hladno');
  pass(geminiTexts.length === g0 + 1 && !find('Martina'), '"da li je vani hladno" NIJE shvaćeno kao potvrda');
  await say('potvrdi');
  pass(find('Martina') && find('Martina').phone === '0912345678', '"potvrdi" → Martina, 0912345678');

  console.log('--- 2. Broj izgovoren riječima ---');
  await say('dodaj kontakt Ivan broj nula devet osam jedan dva tri četiri pet šest sedam');
  await say('da');
  pass(find('Ivan') && find('Ivan').phone === '0981234567', '"nula devet osam…" → 0981234567');

  console.log('--- 3. Zamjena broja postojećeg kontakta ---');
  await say('spremi kontakt Martina plus 385 91 999 8888');
  pass(lastUtilCard().textContent.includes('već postoji'), 'Upozorenje da kontakt već postoji');
  await say('odustani');
  pass(find('Martina').phone === '0912345678', '"odustani" — broj nepromijenjen');
  await say('spremi kontakt Martina plus 385 91 999 8888'); await say('potvrdi');
  pass(find('Martina').phone === '+385919998888' && contacts().filter(c => c.name === 'Martina').length === 1, 'Broj zamijenjen, bez duplikata');
  g0 = geminiTexts.length;
  await say('spremi kontakt Martina');
  pass(geminiTexts.length === g0 + 1, 'Bez izgovorenog broja: rečenica ide AI modelu (može pitati za broj)');

  console.log('--- 4. "Nazovi Martinu" odmah ---');
  events.length = 0; g0 = geminiTexts.length;
  await say('nazovi Martinu');
  pass(events[0] === 'DIAL tel:+385919998888', 'Aplikacija za pozive otvorena odmah, s brojem Martine');
  pass(!events.some(e => e.startsWith('SPEAK')), 'Bez govora prije ili nakon otvaranja');
  pass(idle(), 'Reaktor se vratio u stanje Standby');
  const cc = d.querySelectorAll('.card-call'); const lastCall = cc[cc.length - 1];
  pass(geminiTexts.length === g0 && lastCall && lastCall.querySelector('.call-btn').getAttribute('href') === 'tel:+385919998888' && lastCall.textContent.includes('Nazovi Martina'), 'Bez AI modela; kartica "Nazovi Martina" ostaje kao rezerva');

  console.log('--- 5. Uvoz iz imenika ---');
  picked = [{ name: ['Pero Perić'], tel: ['+385 (98) 111-2222'] }, { name: ['Martina'], tel: ['+385 91 999 8888'] },
            { name: ['Ivan'], tel: ['091 000 0000'] }, { name: [''], tel: ['123'] }];
  click($('settingsBtn')); await sleep(30); click($('importContactsBtn')); await sleep(80);
  pass($('contactsStatus').textContent === 'Uvoz iz imenika: dodano 1, ažurirano 1, preskočeno 2.', `Tipka u postavkama: "${$('contactsStatus').textContent}"`);
  pass(find('Pero Perić').phone === '+385981112222' && find('Ivan').phone === '0910000000', 'Pero dodan, Ivanu ažuriran broj');
  click($('closeSettings'));
  picked = [{ name: ['Ana'], tel: ['095 123 4567'] }];
  await say('uvezi kontakte iz imenika');
  const btn = [...d.querySelectorAll('.util-actions button')].find(b => b.textContent.includes('Otvori imenik'));
  pass(!!btn, 'Glasom: kartica s tipkom "Otvori imenik"');
  click(btn); await sleep(100); await waitFor(idle, 'after import');
  pass(find('Ana') && lastSpeak().includes('dodano 1'), 'Nakon dodira: Ana uvezena, Jarvis javlja rezultat');
  delete w.navigator.contacts;
  click($('settingsBtn')); await sleep(30); click($('importContactsBtn')); await sleep(50);
  pass($('contactsStatus').textContent.includes('Chromeu na Androidu'), 'Bez podrške za imenik: jasna poruka');
  click($('closeSettings'));

  console.log('--- 6. Preko AI modela ---');
  await say('zapamti mi broj od susjeda');
  pass(!find('Stipe') && lastUtilCard().textContent.includes('Stipe'), 'Alat save_contact: kartica, još ne sprema');
  await say('potvrdi');
  pass(find('Stipe') && find('Stipe').phone === '0917778888', 'Nakon potvrde: Stipe spremljen');
  pass(!JSON.parse(w.localStorage.getItem('jarvis_history')).some(m => m.role === 'user' && m.content === ''), 'U povijesti nema praznih poruka');
  process.exit(0);
})().catch(e => { console.error('TEST ERROR', e); process.exit(1); });
