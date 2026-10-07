const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/<script src="https:\/\/accounts\.google\.com[^>]*><\/script>/, '');
const res = (o) => ({ ok: true, status: 200, json: async () => o, text: async () => JSON.stringify(o), clone() { return this; } });
const gemini = []; // captured request bodies
async function fakeFetch(url, opts = {}) {
  if (!String(url).includes('generativelanguage')) throw new Error('Unexpected fetch ' + url);
  const body = JSON.parse(opts.body); gemini.push(body);
  const last = body.contents[body.contents.length - 1];
  const fr = last.parts.find(p => p.functionResponse);
  if (fr) return res({ candidates: [{ content: { parts: [{ text: 'Rezultat: ' + fr.functionResponse.response.content }] } }] });
  const text = last.parts.map(p => p.text || '').join(' ');
  if (/duhovitiji/.test(text)) return res({ candidates: [{ content: { parts: [{ functionCall: { name: 'change_setting', args: { setting: 'tone', value: 'sarkastičan' } } }] } }] });
  if (/comic sans/i.test(text)) return res({ candidates: [{ content: { parts: [{ text: 'To ne mogu sam promijeniti. Želiš li da to zapišem kao novu ideju?' }] } }] });
  if (/^da$/i.test(text.trim())) return res({ candidates: [{ content: { parts: [{ functionCall: { name: 'save_idea', args: { text: 'Font sučelja Comic Sans' } } }] } }] });
  return res({ candidates: [{ content: { parts: [{ text: 'OK.' }] } }] });
}
const events = []; const speechQueue = [];
class FakeSR { start() { setTimeout(() => { this.onstart && this.onstart();
  if (speechQueue.length) { const r = [{ transcript: speechQueue.shift() }]; r.isFinal = true; this.onresult && this.onresult({ resultIndex: 0, results: [r] }); }
  this.onend && this.onend(); }, 5); } stop() {} }  // empty queue = silence
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.github.io/jarvis/',
  beforeParse(w) {
    for (const [k, v] of Object.entries({ jarvis_gemini_key: 'g', jarvis_anthropic_key: 'a', jarvis_boot_sequence: 'true', jarvis_lang: 'hr-HR', jarvis_theme: 'zelena' })) w.localStorage.setItem(k, v);
    w.fetch = fakeFetch; w.webkitSpeechRecognition = FakeSR;
    w.SpeechSynthesisUtterance = function (t) { this.text = t; };
    w.speechSynthesis = { getVoices: () => [], cancel() {}, speak(u) { events.push('SPEAK ' + u.text); setTimeout(() => u.onend && u.onend(), 5); } };
  } });
const w = dom.window, d = w.document, $ = id => d.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, l, ms = 4000) { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await sleep(20); } console.log('TIMEOUT: ' + l); return false; }
const click = el => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const idle = () => $('stateLabel').textContent === 'STANDBY';
const say = async t => { await waitFor(idle, 'idle'); speechQueue.push(t); click($('micBtn')); await sleep(70); await waitFor(idle, 'after ' + t); await sleep(50); };
const ls = k => w.localStorage.getItem(k);
const theme = () => d.documentElement.dataset.theme || 'plava';
const lastSpeak = () => ([...events].reverse().find(e => e.startsWith('SPEAK')) || '').slice(6);
const pass = (c, m) => console.log((c ? 'PASS' : 'FAIL') + ' — ' + m);

(async () => {
  await sleep(2600); // boot animation is on in this test
  console.log('--- 1. Teme ---');
  pass(theme() === 'zelena', 'Spremljena tema (zelena) primijenjena odmah pri pokretanju');
  const css = d.querySelector('style').textContent;
  pass(['zlatna', 'crvena', 'zelena'].every(t => css.includes(`:root[data-theme="${t}"]`)) && !/rgba\(\s*77\s*,\s*214\s*,\s*255/.test(css), 'Sve tri dodatne teme definirane; nijedna plava boja nije zakucana');
  const g0 = gemini.length;
  await say('promijeni temu u crvenu');
  pass(theme() === 'crvena' && ls('jarvis_theme') === 'crvena' && lastSpeak() === 'Tema je sada Crvena (Mark III).', '"promijeni temu u crvenu"');
  await say('Jarvis, zlatna tema');
  pass(theme() === 'zlatna', '"Jarvis, zlatna tema" (kratko, s imenom na početku)');
  await say('tema mark 3');
  pass(theme() === 'crvena', '"tema mark 3" → Crvena (Mark III)');
  await say('vrati plavu boju sučelja');
  pass(theme() === 'plava' && !d.documentElement.hasAttribute('data-theme'), '"vrati plavu boju sučelja" → klasična plava');

  console.log('--- 2. Ostale postavke glasom ---');
  await say('budi sarkastičan');
  pass(ls('jarvis_personality') === '2' && lastSpeak().startsWith('Sarkastični način'), '"budi sarkastičan"');
  await say('koristi Opus');
  pass(ls('jarvis_anthropic_model') === 'claude-opus-5-5', '"koristi Opus" → Claude Opus 5.5');
  await say('razmišljaj temeljito');
  pass(ls('jarvis_anthropic_effort') === 'high', '"razmišljaj temeljito" → effort high');
  await say('koristi samo Gemini');
  pass(ls('jarvis_forced_provider') === 'gemini' && ls('jarvis_auto_routing') === 'false', '"koristi samo Gemini" → forsiran Gemini');
  await say('uključi automatski odabir');
  pass(ls('jarvis_auto_routing') === 'true', '"uključi automatski odabir"');
  await say('isključi animaciju paljenja');
  pass(ls('jarvis_boot_sequence') === 'false', '"isključi animaciju paljenja"');
  // Real continuous conversation: after the reply the mic reopens by itself and hears the next sentence.
  await waitFor(idle, 'idle'); speechQueue.push('uključi kontinuirani razgovor', 'isključi kontinuirani razgovor'); click($('micBtn'));
  await waitFor(() => ls('jarvis_continuous_conv') === 'true', 'continuous on');
  pass(ls('jarvis_continuous_conv') === 'true', '"uključi kontinuirani razgovor"');
  await waitFor(() => ls('jarvis_continuous_conv') === 'false' && !speechQueue.length, 'continuous off'); await waitFor(idle, 'idle'); await sleep(600);
  pass(ls('jarvis_continuous_conv') === 'false', 'Mikrofon se sam otvorio; "isključi kontinuirani razgovor" izgovoren bez dodira');
  pass(!speechQueue.length && idle(), 'Nakon isključivanja mikrofon se više ne otvara sam');
  await say('uključi jutarnji brifing');
  pass(ls('jarvis_morning_briefing') === 'true', '"uključi jutarnji brifing"');
  await say('promijeni glas na Daniel');
  pass(ls('jarvis_eleven_voice') === 'onwK4e9ZLuTAKqWW03F9' && lastSpeak().includes('ElevenLabs'), '"promijeni glas na Daniel" (uz napomenu da treba ElevenLabs ključ)');
  const leaked = gemini.slice(g0).map(b => b.contents[b.contents.length - 1].parts.map(p => p.text || '').join(' '));
  pass(gemini.length === g0, 'Sve gore obrađeno lokalno, bez AI modela' + (leaked.length ? ' — modelu otišlo: ' + JSON.stringify(leaked) : ''));

  console.log('--- 3. Preko AI modela ---');
  await say('jutarnji brifing'); // not a command (no on/off) — must not toggle
  pass(ls('jarvis_morning_briefing') === 'true', 'Rečenica bez "uključi/isključi" ne mijenja postavku');
  await say('budi balansiran');
  await say('možeš li biti malo duhovitiji');
  pass(ls('jarvis_personality') === '2', 'Slobodna rečenica → alat change_setting promijenio ton');
  await say('kakvo je vrijeme');
  const sys = gemini[gemini.length - 1].systemInstruction.parts[0].text;
  pass(/sarcastic/i.test(sys), 'Od sljedećeg pitanja model koristi novi ton');

  console.log('--- 4. Bez "glumljenja" ---');
  await say('promijeni font u Comic Sans');
  const sys2 = gemini[gemini.length - 1].systemInstruction.parts[0].text;
  pass(/cannot change your own code/.test(sys2) && /Never claim a change/.test(sys2), 'Upute modelu: ne može mijenjati kod i ne smije tvrditi da je nešto promijenio');
  pass(lastSpeak().includes('zapišem kao novu ideju'), 'Jarvis kaže da to ne može i nudi zapis ideje');
  await say('da');
  const ideas = JSON.parse(ls('jarvis_ideas') || '[]');
  pass(ideas.length === 1 && ideas[0].text === 'Font sučelja Comic Sans', 'Na "da" ideja je stvarno zapisana (alat save_idea)');

  console.log('--- 5. Postavke dodirom ---');
  click($('settingsBtn')); await sleep(40);
  pass($('versionLabel').textContent === 'Verzija 8.7', 'Verzija 8.7 u postavkama');
  pass($('themeSelect').options.length === 4 && $('themeSelect').value === 'plava', 'Izbornik tema prikazuje trenutnu temu');
  $('themeSelect').value = 'zelena'; click($('saveSettings')); await sleep(40);
  pass(theme() === 'zelena' && ls('jarvis_theme') === 'zelena', 'Odabir teme u postavkama i Save → tema primijenjena');
  pass(!/change_setting[\s\S]{0,400}(api_key|reset|delete|rezije_url)/i.test(html.slice(html.indexOf("name: 'change_setting'"), html.indexOf("name: 'save_idea'"))), 'Glasom se ne mogu mijenjati ključevi, brisanja ni veze s bazom');
  process.exit(0);
})().catch(e => { console.error('TEST ERROR', e); process.exit(1); });
