// v10.7: načini rada (sarkastični butler, detektiv, dvorski engleski) i kviz protiv Jarvisa.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/<script src="https:\/\/accounts\.google\.com[^>]*><\/script>/, '');
const res = (o) => ({ ok: true, status: 200, json: async () => o, text: async () => JSON.stringify(o), clone() { return this; } });
const QUIZ = [
  { q: 'Koje je godine Hrvatska postala članica EU?', a: ['2013.', '2004.', '2009.', '2016.'], c: 0, e: 'Hrvatska je ušla u EU 1. srpnja 2013.' },
  { q: 'Koji je najveći hrvatski otok?', a: ['Cres', 'Brač', 'Krk', 'Hvar'], c: 2, e: 'Krk i Cres su gotovo jednaki, Krk je malo veći.' },
  { q: 'Koji je glavni grad Austrije?', a: ['Graz', 'Beč', 'Salzburg', 'Linz'], c: 1, e: 'Glavni grad Austrije je Beč.' },
];
const calls = []; // { system, user }
let quizReply = '```json\n' + JSON.stringify(QUIZ) + '\n```';
async function fakeFetch(url, opts) {
  if (!String(url).includes('generativelanguage')) throw new Error('Unexpected fetch ' + url);
  const body = JSON.parse(opts.body);
  const system = body.systemInstruction ? body.systemInstruction.parts.map(p => p.text).join('') : '';
  const contents = body.contents || [];
  const lastUser = [...contents].reverse().find(c => c.role === 'user');
  const user = lastUser ? lastUser.parts.map(p => p.text || '').join('') : '';
  calls.push({ system, user });
  const text = t => res({ candidates: [{ content: { parts: [{ text: t }] } }] });
  if (system.includes('pub-quiz')) return text(quizReply);
  if (system.includes('royal court')) return text('Your Majesty, I humbly take my leave to procure the royal bread.');
  if (user.includes('zabavimo') && !contents.some(c => (c.parts || []).some(p => p.functionResponse)))
    return res({ candidates: [{ content: { parts: [{ functionCall: { name: 'start_quiz', args: { topic: 'zemljopis', count: 3 } } }] } }] });
  return text('U redu.');
}
const events = []; const speechQueue = [];
class FakeSR { start() { setTimeout(() => { this.onstart && this.onstart();
  if (speechQueue.length) { const r = [{ transcript: speechQueue.shift() }]; r.isFinal = true; this.onresult && this.onresult({ resultIndex: 0, results: [r] }); }
  this.onend && this.onend(); }, 5); } stop() {} abort() {} }
const today = new Date(); today.setHours(18, 30, 0, 0);
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.github.io/jarvis/',
  beforeParse(w) {
    const ls = { jarvis_gemini_key: 'g', jarvis_boot_sequence: 'false', jarvis_lang: 'hr-HR',
      jarvis_reminders: JSON.stringify([{ id: 'r1', message: 'Nazvati vodoinstalatera', fireAt: today.getTime() }]),
      jarvis_shopping: JSON.stringify([{ id: 's1', text: 'mlijeko', done: false, addedAt: Date.now() }]),
      jarvis_expenses: JSON.stringify([{ id: 'e1', amount: 42, currency: '€', category: 'hrana', note: 'ručak', timestamp: Date.now() }]) };
    for (const k in ls) w.localStorage.setItem(k, ls[k]);
    w.fetch = fakeFetch; w.webkitSpeechRecognition = FakeSR;
    w.SpeechSynthesisUtterance = function (t) { this.text = t; };
    w.speechSynthesis = { getVoices: () => [], cancel() {}, speak(u) { events.push({ text: u.text, lang: u.lang }); setTimeout(() => u.onend && u.onend(), 5); } };
  } });
const w = dom.window, d = w.document, $ = id => d.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, l, ms = 4000) { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await sleep(20); } console.log('TIMEOUT: ' + l); return false; }
const click = el => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const idle = () => $('stateLabel').textContent === 'STANDBY';
const say = async (...u) => { await waitFor(idle, 'idle'); speechQueue.push(...u); click($('micBtn')); await sleep(80); await waitFor(() => idle() && !speechQueue.length, 'after ' + u[0]); await sleep(150); await waitFor(idle, 'idle2'); };
const lastSpeak = () => (events[events.length - 1] || {}).text || '';
const pass = (c, m) => console.log((c ? 'PASS' : 'FAIL') + ' — ' + m);
const mode = () => w.localStorage.getItem('jarvis_mode') || 'normal';
const badge = () => $('modeBadge');
const lastUserBubble = () => { const m = [...d.querySelectorAll('.msg-user .msg-text')]; return m.length ? m[m.length - 1].textContent : ''; };

(async () => {
  await sleep(300);
  pass(badge() && badge().style.display === 'none', 'Bez načina rada: oznaka u zaglavlju skrivena');

  console.log('--- 1. Sarkastični butler ---');
  let n = calls.length;
  await say('Jarvis, budi sarkastični butler');
  pass(mode() === 'butler' && calls.length === n, '"budi sarkastični butler" uključuje način (bez AI poziva)');
  pass(w.localStorage.getItem('jarvis_personality') === null, 'Ton (Personality) ostaje nepromijenjen — butler nije isto što i "budi sarkastičan"');
  pass(badge().style.display !== 'none' && badge().textContent.includes('BUTLER'), 'Oznaka 🎩 BUTLER u zaglavlju');
  pass(lastSpeak().includes('butler uključen'), 'Jarvis potvrđuje glasom');
  await say('odlučio sam jesti pizzu treći dan zaredom');
  let c = calls[calls.length - 1];
  pass(c && c.system.includes('sarcastic butler') && c.system.includes('EVERY decision'), 'Upit modelu nosi upute butlera (komentar na svaku odluku)');
  pass(c && c.system.includes('never crude') && c.system.includes('health'), 'Granice: bez grubosti, bez sprdnje sa zdravljem/brigama');

  console.log('--- 2. Normalni način i lažni pogoci ---');
  await say('normalni način');
  pass(mode() === 'normal' && badge().style.display === 'none', '"normalni način" gasi način rada i oznaku');
  n = calls.length;
  await say('na koji način se kuha riža');
  c = calls[calls.length - 1];
  pass(mode() === 'normal' && calls.length === n + 1 && !c.system.includes('MODE —'), '"na koji način…" je obično pitanje, ne naredba za način rada');
  await say('budi sarkastičan');
  pass(w.localStorage.getItem('jarvis_personality') === '2' && mode() === 'normal', '"budi sarkastičan" i dalje mijenja samo ton');

  console.log('--- 3. Detektiv ---');
  await say('uključi način detektiv');
  pass(mode() === 'detektiv' && badge().textContent.includes('DETEKTIV'), 'Način detektiv uključen, oznaka 🕵 DETEKTIV');
  n = calls.length;
  await say('analiziraj moj dan');
  c = calls[n];
  pass(!!c && c.system.includes('detective') && c.user.includes('Slučaj, Tragovi, Osumnjičeni, Zaključak'), 'Model dobiva zadatak: izvještaj kao slučaj');
  pass(!!c && c.user.includes('Nazvati vodoinstalatera') && c.user.includes('18:30'), 'Činjenice: današnji podsjetnik s vremenom');
  pass(!!c && c.user.includes('mlijeko') && c.user.includes('42') && c.user.includes('hrana'), 'Činjenice: popis za kupovinu i današnji trošak');
  pass(!!c && c.system.includes('Never invent facts'), 'Upute: ne izmišljati činjenice');
  pass(lastUserBubble() === 'analiziraj moj dan', 'U razgovoru se vidi samo izgovorena rečenica, ne popis činjenica');
  await say('normalni način');
  n = calls.length;
  await say('kako mi je prošao dan');
  c = calls[n];
  pass(!!c && c.user.includes('topao pregled') && !c.user.includes('Osumnjičeni'), 'Bez načina detektiv: običan kratak pregled dana');

  console.log('--- 4. Dvorski engleski ---');
  await say('prevedi na dvorski: idem u dućan po kruh');
  c = calls[calls.length - 1];
  pass(c.system.includes('royal court') && c.user === 'idem u dućan po kruh', 'Jednokratni prijevod: modelu ide samo rečenica');
  pass(lastSpeak().startsWith('Your Majesty') && events[events.length - 1].lang === 'en-GB', 'Prijevod izgovoren britanskim engleskim');
  pass(mode() === 'normal', 'Jednokratni prijevod ne uključuje način');
  await say('dvorski način');
  pass(mode() === 'dvor' && badge().textContent.includes('DVOR'), '"dvorski način" uključen, oznaka 👑 DVOR');
  n = calls.length;
  await say('gladan sam i idem spavati');
  c = calls[n];
  pass(!!c && c.system.includes('royal court') && c.user === 'gladan sam i idem spavati', 'U dvorskom načinu svaka rečenica se prevodi');
  pass(lastSpeak().startsWith('Your Majesty'), '… i izgovara na engleskom');
  await say('isključi dvorski način');
  pass(mode() === 'normal', '"isključi dvorski način" vraća normalno');

  console.log('--- 5. Kviz ---');
  n = calls.length;
  await say('igrajmo kviz o povijesti od 3 pitanja', 'a', 'ne znam', 'Beč');
  c = calls[n];
  pass(!!c && c.system.includes('pub-quiz') && c.user.includes('3 pitanja') && c.user.includes('povijesti'), 'Pitanja traži od modela: tema i broj pitanja');
  await waitFor(() => [...d.querySelectorAll('.card-quiz')].some(x => x.textContent.includes('REZULTAT')), 'quiz end', 6000);
  await waitFor(idle, 'idle');
  const card = d.querySelector('.card-quiz');
  pass(!!card && card.textContent.includes('REZULTAT 2/3'), 'Kartica kviza: rezultat 2/3');
  pass(events.some(e => e.text.includes('Pitanje 1 od 3') && e.text.includes('A: 2013.')), 'Pitanje i ponuđeni odgovori izgovoreni');
  pass(events.some(e => e.text.startsWith('Točno! Hrvatska je ušla')), '"a" — točno, s objašnjenjem');
  pass(events.some(e => e.text.startsWith('Preskočeno. Točan odgovor je C: Krk')), '"ne znam" — preskočeno, rečen točan odgovor');
  pass(lastSpeak().includes('Kraj kviza! Rezultat: 2 od 3'), 'Odgovor riječima ("Beč") prepoznat; kraj s rezultatom');
  pass(w.localStorage.getItem('jarvis_quiz_best') === '2', 'Najbolji rezultat spremljen');
  pass(JSON.parse(w.localStorage.getItem('jarvis_quiz_seen')).length === 3, 'Postavljena pitanja zapamćena (da se ne ponavljaju)');

  console.log('--- 6. Kviz tipkama i prekid ---');
  n = calls.length;
  await say('pokreni kviz');
  c = calls[n];
  pass(!!c && c.user.includes('5 pitanja') && c.user.includes('opće kulture') && c.user.includes('Ne ponavljaj'), 'Bez teme: 5 pitanja opće kulture, uz popis već postavljenih');
  await waitFor(idle, 'idle');
  let qc = [...d.querySelectorAll('.card-quiz')].pop();
  click([...qc.querySelectorAll('.util-actions button')].find(b => b.textContent === 'A'));
  await sleep(120); await waitFor(idle, 'idle');
  qc = [...d.querySelectorAll('.card-quiz')].pop();
  pass(qc.querySelector('.card-header').textContent.includes('2/3') && qc.textContent.includes('1 bod'), 'Tipka A: točno, kartica prelazi na pitanje 2 (1 bod)');
  await sleep(500); await waitFor(idle, 'idle'); // auto-mic (empty) passes
  await say('kraj kviza');
  pass(lastSpeak().includes('Kraj kviza! Rezultat: 1 od 1'), '"kraj kviza" završava igru s dosadašnjim rezultatom');
  n = calls.length;
  await say('a');
  pass(calls.length === n + 1 && !calls[n].system.includes('pub-quiz'), 'Nakon kraja "a" više nije odgovor na kviz');

  console.log('--- 7. Kviz preko AI modela (alat start_quiz) ---');
  n = calls.length;
  await say('hajde da se malo zabavimo');
  await waitFor(() => calls.slice(n).some(x => x.system.includes('pub-quiz')), 'quiz via tool', 5000);
  const qcall = calls.slice(n).find(x => x.system.includes('pub-quiz'));
  pass(!!qcall && qcall.user.includes('zemljopis') && qcall.user.includes('3 pitanja'), 'Model pokreće kviz alatom start_quiz (tema i broj pitanja)');
  await waitFor(idle, 'idle'); await sleep(300); await waitFor(idle, 'idle');
  await say('kraj');

  console.log('--- 8. Neispravan odgovor modela ---');
  quizReply = 'Nažalost ne mogu.';
  await say('novi kviz');
  pass(lastSpeak().includes('Nisam uspio sastaviti pitanja'), 'Kad model ne vrati pitanja — jasna poruka, bez rušenja');

  console.log('--- 9. Postavke ---');
  click($('settingsBtn')); await sleep(40);
  pass($('versionLabel').textContent === 'Verzija 10.7', 'Verzija 10.7');
  pass($('modeSelect').value === 'normal' && $('modeSelect').options.length === 4, 'Postavke: izbornik "Način rada" s 4 opcije');
  $('modeSelect').value = 'detektiv'; click($('saveSettings')); await sleep(60);
  pass(mode() === 'detektiv' && badge().textContent.includes('DETEKTIV'), 'Odabir u postavkama uključuje način i oznaku');
  process.exit(0);
})().catch(e => { console.error('TEST ERROR', e); process.exit(1); });
