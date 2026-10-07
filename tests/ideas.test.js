const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/<script src="https:\/\/accounts\.google\.com[^>]*><\/script>/, '');
const res = (o) => ({ ok: true, status: 200, json: async () => o, text: async () => JSON.stringify(o), clone() { return this; } });
let geminiCalls = 0;
async function fakeFetch(url) {
  if (String(url).includes('generativelanguage')) { geminiCalls++; return res({ candidates: [{ content: { parts: [{ text: 'OK.' }] } }] }); }
  throw new Error('Unexpected fetch ' + url);
}
const events = []; const speechQueue = []; let clip = null;
class FakeSR { start() { setTimeout(() => { this.onstart && this.onstart(); const r = [{ transcript: speechQueue.shift() }]; r.isFinal = true;
  this.onresult && this.onresult({ resultIndex: 0, results: [r] }); this.onend && this.onend(); }, 5); } stop() {} }
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.github.io/jarvis/',
  beforeParse(w) {
    const ls = { jarvis_gemini_key: 'g', jarvis_boot_sequence: 'false', jarvis_lang: 'hr-HR',
      jarvis_contacts: JSON.stringify([{ id: 'c1', name: 'Martina', phone: '0912345678' }]) };
    for (const k in ls) w.localStorage.setItem(k, ls[k]);
    w.fetch = fakeFetch; w.webkitSpeechRecognition = FakeSR;
    w.HTMLAnchorElement.prototype.click = function () { if (this.getAttribute('href').startsWith('tel:')) events.push('DIAL ' + this.getAttribute('href')); };
    w.SpeechSynthesisUtterance = function (t) { this.text = t; };
    w.speechSynthesis = { getVoices: () => [], cancel() {}, speak(u) { events.push('SPEAK ' + u.text); setTimeout(() => u.onend && u.onend(), 5); } };
    Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async t => { clip = t; } }, configurable: true });
  } });
const w = dom.window, d = w.document, $ = id => d.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, l, ms = 3000) { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await sleep(20); } console.log('TIMEOUT: ' + l); return false; }
const click = el => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const idle = () => $('stateLabel').textContent === 'STANDBY';
const say = async (...utterances) => { await waitFor(idle, 'idle'); speechQueue.push(...utterances); click($('micBtn')); await sleep(80); await waitFor(() => idle() && !speechQueue.length, 'after ' + utterances[0]); await sleep(60); };
const ideas = () => JSON.parse(w.localStorage.getItem('jarvis_ideas') || '[]');
const lastSpeak = () => [...events].reverse().find(e => e.startsWith('SPEAK')) || '';
const pass = (c, m) => console.log((c ? 'PASS' : 'FAIL') + ' — ' + m);

(async () => {
  await sleep(300);
  console.log('--- 1. "Jarvis, nova ideja: …" ---');
  await say('Jarvis, nova ideja: dodaj kontrolu rasvjete u dnevnoj sobi');
  pass(ideas().length === 1 && ideas()[0].text === 'Dodaj kontrolu rasvjete u dnevnoj sobi', 'Ideja spremljena bez "Jarvis, nova ideja", s velikim početnim slovom');
  pass(/^\d\d\.\d\d\.\d{4}\.$/.test(new Date(ideas()[0].timestamp).toLocaleDateString('hr-HR').replace(/\s/g, '')) || ideas()[0].timestamp > 0, 'Ideja ima datum');
  pass([...d.querySelectorAll('.card-util')].some(c => c.textContent.includes('NOVA IDEJA')), 'Kartica "Nova ideja" u razgovoru');
  pass(lastSpeak().includes('Zapisao sam ideju') && lastSpeak().includes('1'), 'Jarvis potvrđuje glasom');
  pass(geminiCalls === 0, 'Bez AI modela (ideja se samo zapisuje)');

  console.log('--- 2. "nova ideja" pa stanka ---');
  await say('Jarvise nova ideja', 'napravi tamni način za ploču režija');
  pass(events.some(e => e === 'SPEAK Slušam, izgovori ideju.'), 'Jarvis kaže "Slušam, izgovori ideju." i sam otvara mikrofon');
  pass(ideas().length === 2 && ideas()[1].text === 'Napravi tamni način za ploču režija', 'Sljedeća rečenica spremljena kao ideja');
  await say('nova ideja', 'odustani');
  pass(ideas().length === 2 && lastSpeak().includes('ništa nisam zapisao'), '"odustani" — ništa zapisano');
  pass(geminiCalls === 0, 'I dalje bez AI modela');

  console.log('--- 3. Čitanje ideja ---');
  await say('pročitaj moje ideje');
  pass(lastSpeak().startsWith('SPEAK Imaš 2 ideje.') && lastSpeak().includes('1. Dodaj kontrolu rasvjete') && lastSpeak().includes('2. Napravi tamni način'), 'Izgovara broj (ispravna gramatika: "2 ideje") i sve ideje');

  console.log('--- 4. "Jarvis," ispred drugih naredbi ---');
  events.length = 0;
  await say('Jarvis, nazovi Martinu');
  pass(events[0] === 'DIAL tel:0912345678' && geminiCalls === 0, '"Jarvis, nazovi Martinu" — brzi poziv radi i s imenom na početku');

  console.log('--- 5. Postavke ---');
  click($('settingsBtn')); await sleep(40);
  pass($('versionLabel').textContent === 'Verzija 8.8', 'Broj verzije prikazan u postavkama');
  pass(d.querySelectorAll('#ideasList .reminder-item').length === 2, 'Obje ideje na popisu');
  click($('copyIdeasBtn')); await sleep(40);
  pass(clip && clip.startsWith('Ideje za nadogradnju Jarvisa (2):') && clip.includes('1. [') && clip.includes('Napravi tamni način'), 'Kopiraj sve: popis spreman za lijepljenje');
  click(d.querySelector('#ideasList .reminder-delete')); await waitFor(() => $('pwModal').dataset.open === 'true', 'pw');
  $('pwInput').value = '0000'; click($('pwConfirm')); await sleep(40);
  pass(ideas().length === 2, 'Brisanje ideje s pogrešnom lozinkom — ništa obrisano');
  $('pwInput').value = '1234'; click($('pwConfirm')); await sleep(60);
  pass(ideas().length === 1 && ideas()[0].text.startsWith('Napravi tamni'), 'Lozinka 1234 — obrisana samo ta ideja');
  click($('clearIdeasBtn')); await waitFor(() => $('pwModal').dataset.open === 'true', 'pw2');
  $('pwInput').value = '1234'; click($('pwConfirm')); await sleep(60);
  pass(ideas().length === 0 && d.querySelector('#ideasList').textContent.includes('Još nema ideja'), '"Obriši sve" uz lozinku');
  process.exit(0);
})().catch(e => { console.error('TEST ERROR', e); process.exit(1); });
