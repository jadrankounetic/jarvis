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
const transcript = () => $('transcript');
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

  const qcard = () => [...d.querySelectorAll('.card-quiz')].pop();
  const opt = k => qcard().querySelector(`.quiz-opt[data-k="${k}"]`);
  const btn = label => [...qcard().querySelectorAll('.util-actions button')].find(b => b.textContent === label);
  const assistantCount = () => d.querySelectorAll('.msg-assistant').length;
  const speaks = () => events.length;

  console.log('--- 5. Tihi kviz (zadano): pitanja na ekranu, odgovori dodirom ---');
  n = calls.length;
  await say('igrajmo kviz o povijesti od 3 pitanja');
  c = calls[n];
  pass(!!c && c.system.includes('pub-quiz') && c.user.includes('3 pitanja') && c.user.includes('povijesti'), 'Pitanja traži od modela: tema i broj pitanja');
  pass(qcard() && qcard().querySelector('.quiz-q').textContent === QUIZ[0].q && d.querySelectorAll('.card-quiz .quiz-opt').length === 4, 'Pitanje 1 i četiri velike tipke odgovora na ekranu');
  pass(qcard().querySelector('.card-header').textContent.includes('1/3') && qcard().querySelector('.card-header').textContent.includes('POVIJESTI'), 'Naslov: KVIZ · 1/3 · tema');
  pass(!events.some(e => e.text.includes('Pitanje 1 od 3')), 'Tiho: Jarvis ne čita pitanje naglas');
  pass(transcript().lastElementChild === qcard(), 'Kartica kviza je zadnja na ekranu');
  let ac = assistantCount(), sp = speaks();
  click(opt(0)); await sleep(60);
  pass(qcard().querySelector('.quiz-q').textContent === QUIZ[1].q && qcard().querySelector('.card-header').textContent.includes('2/3'), 'Dodir A: odmah sljedeće pitanje');
  pass(!d.body.textContent.includes(QUIZ[0].q), 'Odgovoreno pitanje nestalo je s ekrana');
  pass(qcard().querySelector('.quiz-stats').textContent.includes('✓ 1') && qcard().querySelector('.quiz-last').textContent.startsWith('✓ Točno!'), 'Ostaje statistika (✓ 1) i kratak ishod zadnjeg odgovora');
  click(btn('Preskoči')); await sleep(60);
  pass(qcard().querySelector('.quiz-stats').textContent.includes('↷ 1') && qcard().querySelector('.quiz-last').textContent.includes('točno je C: Krk'), 'Preskoči: ↷ 1 i točan odgovor');
  pass(assistantCount() === ac && speaks() === sp, 'Tijekom tihe igre nema poruka u razgovoru ni govora');
  await say('Beč');
  pass(qcard().querySelector('.card-header').textContent.includes('REZULTAT 2/3') && qcard().querySelector('.quiz-final').textContent.length > 5, 'Odgovor i glasom ("Beč") radi u tihom kvizu; kraj: rezultat 2/3');
  pass(!d.body.textContent.includes(QUIZ[1].q) && !d.body.textContent.includes(QUIZ[2].q), 'Na kraju nema odgovorenih pitanja, samo statistika');
  pass(w.localStorage.getItem('jarvis_quiz_best') === '2' && qcard().textContent.includes('Novi rekord'), 'Rekord spremljen i označen');
  pass(JSON.parse(w.localStorage.getItem('jarvis_quiz_seen')).length === 3, 'Postavljena pitanja zapamćena (da se ne ponavljaju)');

  console.log('--- 6. Kartica ostaje na dnu ---');
  click(btn('Nova igra')); await sleep(100); await waitFor(idle, 'idle');
  pass(d.querySelectorAll('.card-quiz').length === 1 && qcard().querySelector('.quiz-q'), '"Nova igra": nova pitanja, stara kartica zamijenjena');
  await say('koliko je sati');
  pass(transcript().lastElementChild === qcard(), 'Pitanje usred kviza: odgovor ide iznad, kviz ostaje zadnji na ekranu');
  click(btn('Kraj')); await sleep(80);
  pass(qcard().querySelector('.card-header').textContent.includes('REZULTAT 0/0'), '"Kraj" završava igru');
  n = calls.length;
  await say('a');
  pass(calls.length === n + 1 && !calls[n].system.includes('pub-quiz'), 'Nakon kraja "a" više nije odgovor na kviz');

  console.log('--- 7. Glasovni kviz ---');
  await say('glasovni kviz', 'a');
  await waitFor(() => events.some(e => e.text.startsWith('Točno! Hrvatska je ušla')), 'voice answer', 4000); await sleep(200); await waitFor(idle, 'idle');
  pass(events.some(e => e.text.includes('Pitanje 1 od 3') && e.text.includes('A: 2013.')), '"glasovni kviz": Jarvis čita pitanje i odgovore');
  pass(events.some(e => e.text.startsWith('Točno! Hrvatska je ušla') && e.text.includes('Pitanje 2 od 3')), 'Sam otvori mikrofon; odgovor "a" — točno, objašnjenje i sljedeće pitanje');
  pass(!d.body.textContent.includes(QUIZ[0].q), 'I u glasovnom kvizu odgovoreno pitanje nestaje s ekrana');
  await sleep(400); await waitFor(idle, 'idle');
  await say('kraj kviza');
  pass(lastSpeak().includes('Kraj kviza! Rezultat: 1 od 1'), '"kraj kviza" — rezultat izgovoren');
  pass(w.localStorage.getItem('jarvis_quiz_voice') === null, '"glasovni kviz" vrijedi za tu igru, ne mijenja zadanu postavku');

  console.log('--- 8. Tipka ◎: izbor teme i broja pitanja, prekidač glasa ---');
  click($('quizBtn')); await sleep(40);
  pass(qcard().textContent.includes('Opća kultura') && qcard().querySelectorAll('.quiz-chip').length === 10, 'Kartica za početak: teme i broj pitanja');
  click([...qcard().querySelectorAll('.quiz-chip')].find(b => b.textContent === 'Sport'));
  click([...qcard().querySelectorAll('.quiz-chip')].find(b => b.textContent === '10'));
  pass(qcard().querySelector('.quiz-chip.on[data-v="sport"]') && qcard().querySelector('.quiz-chip.on[data-v="10"]'), 'Odabrano: Sport, 10 pitanja');
  n = calls.length;
  click(btn('Kreni')); await sleep(100); await waitFor(idle, 'idle');
  c = calls[n];
  pass(!!c && c.user.includes('sport') && c.user.includes('10 pitanja') && c.user.includes('Ne ponavljaj'), 'Model dobiva temu i broj pitanja (i popis već postavljenih)');
  pass(btn('🔇 Tiho') && d.querySelectorAll('.card-quiz').length === 1, 'Kviz počinje tiho; kartica za početak je maknuta');
  sp = speaks();
  click(btn('🔇 Tiho')); await sleep(100);
  pass(btn('🔊 Glas') && w.localStorage.getItem('jarvis_quiz_voice') === 'true', 'Prekidač na kartici: glas uključen i zapamćen');
  await waitFor(() => events.slice(sp).some(e => e.text.startsWith('Pitanje 1 od 3')), 'reads current');
  pass(events.slice(sp).some(e => e.text.startsWith('Pitanje 1 od 3')), 'Nakon uključivanja glasa Jarvis pročita trenutno pitanje');
  await sleep(500); await waitFor(idle, 'idle');
  click(btn('🔊 Glas')); await sleep(60);
  pass(btn('🔇 Tiho') && w.localStorage.getItem('jarvis_quiz_voice') === 'false', 'Ponovni dodir: opet tiho');
  click(btn('Kraj')); await sleep(80);

  console.log('--- 9. Kviz preko AI modela (alat start_quiz) ---');
  n = calls.length;
  await say('hajde da se malo zabavimo');
  await waitFor(() => calls.slice(n).some(x => x.system.includes('pub-quiz')), 'quiz via tool', 5000);
  const qcall = calls.slice(n).find(x => x.system.includes('pub-quiz'));
  pass(!!qcall && qcall.user.includes('zemljopis') && qcall.user.includes('3 pitanja'), 'Model pokreće kviz alatom start_quiz (tema i broj pitanja)');
  await waitFor(idle, 'idle'); await sleep(200);
  click(btn('Kraj')); await sleep(80);

  console.log('--- 10. Neispravan odgovor modela ---');
  quizReply = 'Nažalost ne mogu.';
  await say('novi kviz');
  const lastA = [...d.querySelectorAll('.msg-assistant .msg-text')].pop();
  pass(lastA && lastA.textContent.includes('Nisam uspio sastaviti pitanja'), 'Kad model ne vrati pitanja — jasna poruka, bez rušenja');

  console.log('--- 11. Postavke ---');
  click($('settingsBtn')); await sleep(40);
  pass($('versionLabel').textContent === 'Verzija 10.8', 'Verzija 10.8');
  pass($('modeSelect').value === 'normal' && $('modeSelect').options.length === 4, 'Postavke: izbornik "Način rada" s 4 opcije');
  pass($('quizVoiceToggle').checked === false, 'Postavke: "Kviz s glasom" isključen');
  $('modeSelect').value = 'detektiv'; $('quizVoiceToggle').checked = true; click($('saveSettings')); await sleep(60);
  pass(mode() === 'detektiv' && badge().textContent.includes('DETEKTIV'), 'Odabir u postavkama uključuje način i oznaku');
  pass(w.localStorage.getItem('jarvis_quiz_voice') === 'true', '"Kviz s glasom" spremljen');
  process.exit(0);
})().catch(e => { console.error('TEST ERROR', e); process.exit(1); });
