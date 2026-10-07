const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/<script src="https:\/\/accounts\.google\.com[^>]*><\/script>/, '');
const res = (o, status = 200) => ({ ok: status < 400, status, json: async () => o, text: async () => JSON.stringify(o), clone() { return this; } });
const pass = (c, m) => console.log((c ? 'PASS' : 'FAIL') + ' — ' + m);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const calls = []; let openaiScript = [];
async function fakeFetch(url, o = {}) {
  url = String(url); const body = o.body ? JSON.parse(o.body) : null;
  if (url.includes('api.anthropic.com')) { calls.push({ p: 'anthropic', body }); return res({ content: [{ type: 'text', text: 'Claude ovdje.' }], stop_reason: 'end_turn', usage: {} }); }
  if (url.includes('generativelanguage')) { calls.push({ p: 'gemini', body }); return res({ candidates: [{ content: { parts: [{ text: 'Gemini ovdje.' }] } }], usageMetadata: {} }); }
  if (url === 'https://api.openai.com/v1/responses') { calls.push({ p: 'openai', body }); const n = openaiScript.shift(); return typeof n === 'function' ? n(body) : res(n || { output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'OpenAI ovdje.' }] }], usage: { input_tokens: 10, output_tokens: 5 } }); }
  throw new Error('Unexpected fetch ' + url);
}
const speech = [], spoken = [];
class FakeSR { start() { setTimeout(() => { this.onstart && this.onstart(); if (speech.length) { const r = [{ transcript: speech.shift() }]; r.isFinal = true; this.onresult && this.onresult({ resultIndex: 0, results: [r] }); } this.onend && this.onend(); }, 5); } stop() {} }
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.github.io/jarvis/',
  beforeParse(w) {
    for (const [k, v] of Object.entries({ jarvis_anthropic_key: 'A-KEY', jarvis_gemini_key: 'G-KEY', jarvis_openai_key: 'O-KEY', jarvis_boot_sequence: 'false', jarvis_lang: 'hr-HR' })) w.localStorage.setItem(k, v);
    w.fetch = fakeFetch; w.webkitSpeechRecognition = FakeSR;
    w.SpeechSynthesisUtterance = function (t) { this.text = t; };
    w.speechSynthesis = { getVoices: () => [], cancel() {}, speak(u) { spoken.push(u.text); setTimeout(() => u.onend && u.onend(), 5); } };
    w.HTMLMediaElement.prototype.play = () => Promise.resolve();
    w.navigator.mediaDevices = { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) };
    w.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {} });
    w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,IMG';
  } });
const w = dom.window, d = w.document, $ = id => d.getElementById(id);
async function waitFor(fn, l, ms = 4000) { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await sleep(20); } console.log('TIMEOUT: ' + l); return false; }
const click = el => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const idle = () => $('stateLabel').textContent === 'STANDBY';
const say = async t => { await waitFor(idle, 'idle'); speech.push(t); click($('micBtn')); await sleep(70); await waitFor(idle, 'after ' + t); await sleep(50); };
const enabled = () => JSON.parse(w.localStorage.getItem('jarvis_provider_enabled') || '{}');
const lastSpoken = () => spoken[spoken.length - 1] || '';
const callsSince = n => calls.slice(n).map(c => c.p);

(async () => {
  await sleep(300);
  console.log('--- 1. Uključivanje / isključivanje u postavkama ---');
  click($('settingsBtn')); await sleep(40);
  pass(d.querySelectorAll('.provider-enabled').length === 4 && [...d.querySelectorAll('.provider-enabled')].every(cb => cb.checked), 'Sva 4 providera imaju prekidač, zadano uključen (Groq uklonjen)');
  pass(!!d.querySelector('.provider-tab[data-provider="openai"]') && $('openaiModel').value === 'gpt-6-luna', 'Novi tab OpenAI, zadani model GPT-6 Luna');
  d.querySelector('.provider-enabled[data-provider="gemini"]').checked = false;
  d.querySelector('.provider-enabled[data-provider="gemini"]').dispatchEvent(new w.Event('change'));
  pass(d.querySelector('.provider-tab[data-provider="gemini"]').classList.contains('is-off'), 'Isključen provider prekrižen u tabovima');
  click($('saveSettings')); await sleep(40);
  pass(enabled().gemini === false && w.localStorage.getItem('jarvis_gemini_key') === 'G-KEY', 'Gemini isključen, ključ ostao spremljen');
  let n = calls.length;
  await say('kakvo je vrijeme danas vani'); // default route would be Gemini
  console.log('    (odabran redoslijed: ' + callsSince(n).join(' → ') + ')');
  pass(!callsSince(n).includes('gemini') && callsSince(n)[0] === 'openai', 'Isključeni Gemini se preskače; kratko pitanje ide sljedećem po pravilu (Gemini → OpenAI)');

  console.log('--- 2. Glasom ---');
  n = calls.length;
  await say('isključi Claude');
  pass(enabled().anthropic === false && w.localStorage.getItem('jarvis_anthropic_key') === 'A-KEY' && lastSpoken().includes('aktivnih modela: 1'), '"isključi Claude" — ključ ostaje, ostao 1 aktivni model');
  pass(calls.length === n, 'Naredba obrađena lokalno, bez AI modela');

  console.log('--- 3. OpenAI (Responses API) ---');
  n = calls.length;
  await say('kakvo je vrijeme danas vani');
  const oc = calls[calls.length - 1];
  pass(oc.p === 'openai' && callsSince(n).length === 1, 'Upit ide OpenAI-ju (jedini uključen)');
  pass(oc.body.model === 'gpt-6-luna' && oc.body.store === false && oc.body.reasoning?.effort === 'low' && typeof oc.body.instructions === 'string' && oc.body.instructions.includes('J.A.R.V.I.S.'), 'Responses API: model, upute, brzo razmišljanje, bez spremanja kod OpenAI-ja');
  pass(oc.body.tools.length > 20 && oc.body.tools.every(t => t.type === 'function' && t.strict === false && t.name && t.parameters), 'Svi Jarvisovi alati poslani kao funkcije (strict: false)');
  pass(!('temperature' in oc.body) && !('max_tokens' in oc.body) && oc.body.max_output_tokens >= 4096, 'Bez parametara koje GPT-6 odbija');
  pass(lastSpoken() === 'OpenAI ovdje.', 'Odgovor izgovoren');

  openaiScript = [
    { output: [{ type: 'reasoning', id: 'rs_1', summary: [] }, { type: 'function_call', id: 'fc_1', call_id: 'call_ABC', name: 'shopping_list', arguments: '{"action":"add","items":["kava"]}' }], usage: {} },
    { output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Dodao sam kavu.' }] }], usage: {} },
  ];
  n = calls.length;
  await say('možeš li mi zapamtiti da trebam nešto za jutro, kavu');
  const [t1, t2] = calls.slice(n).map(c => c.body);
  const fcall = t2.input.find(i => i.type === 'function_call'), fout = t2.input.find(i => i.type === 'function_call_output');
  pass(JSON.parse(w.localStorage.getItem('jarvis_shopping') || '[]').some(i => i.text === 'kava'), 'OpenAI pozvao Jarvisov alat (kava na popisu)');
  pass(fcall && fcall.call_id === 'call_ABC' && fout && fout.call_id === 'call_ABC' && /Added: kava/.test(fout.output), 'Rezultat alata vraćen s istim call_id');
  pass(!t2.input.some(i => i.type === 'reasoning') && t2.instructions === t1.instructions, 'Bez reasoning stavki (store: false), iste upute u petlji');
  pass(lastSpoken() === 'Dodao sam kavu.', 'Završni odgovor izgovoren');

  console.log('--- 4. Sigurnosne mreže ---');
  click($('settingsBtn')); await sleep(30); $('openaiModel').value = 'chat-latest'; click($('saveSettings')); await sleep(30);
  openaiScript = [() => res({ error: { message: "Unsupported parameter: 'reasoning.effort' is not supported with this model." } }, 400),
                  () => res({ error: { message: 'Function tools are not supported with this model.' } }, 400)];
  n = calls.length;
  await say('ispričaj mi vic');
  const tries = calls.slice(n).map(c => c.body);
  pass(tries.length === 3 && !('reasoning' in tries[2]) && !('tools' in tries[2]) && lastSpoken() === 'OpenAI ovdje.', 'chat-latest: automatski bez razmišljanja i bez alata — razgovor i dalje radi');
  click($('settingsBtn')); await sleep(30); $('openaiModel').value = 'gpt-6-luna'; click($('saveSettings')); await sleep(30);

  console.log('--- 5. Kamera preko OpenAI-ja ---');
  n = calls.length;
  await waitFor(idle, 'idle'); speech.push('opiši ovo'); click($('micBtn'));
  await waitFor(() => d.querySelector('.camera-btn-capture'), 'camera'); await sleep(30); click(d.querySelector('.camera-btn-capture'));
  await sleep(150); await waitFor(idle, 'after photo');
  const vb = calls.slice(n).find(c => c.p === 'openai');
  const img = vb && vb.body.input[0].content.find(c => c.type === 'input_image');
  pass(img && img.image_url === 'data:image/jpeg;base64,IMG' && !callsSince(n).includes('anthropic') && !callsSince(n).includes('gemini'), 'Slika poslana OpenAI-ju; isključeni Claude i Gemini se ne koriste ni za kameru');

  console.log('--- 6. Svi isključeni, ponovno uključivanje ---');
  await say('isključi OpenAI');
  pass(lastSpoken().includes('svi AI modeli isključeni') && $('sysStatus').textContent === 'AI OFF', 'Svi isključeni: Jarvis to kaže, status "AI OFF"');
  n = calls.length;
  await say('kakvo je vrijeme danas vani');
  pass(calls.length === n && [...d.querySelectorAll('.msg-error .msg-text')].pop().textContent.includes('Svi AI modeli su isključeni'), 'Pitanje bez aktivnog modela: jasna poruka, bez slanja ključeva igdje');
  await say('dodaj kruh na popis');
  pass(JSON.parse(w.localStorage.getItem('jarvis_shopping')).some(i => i.text === 'kruh'), 'Lokalne naredbe rade i kad su svi modeli isključeni');
  await say('uključi Gemini');
  pass(enabled().gemini === true && lastSpoken() === 'Gemini je uključen.', '"uključi Gemini"');
  await say('koristi samo ChatGPT');
  pass(w.localStorage.getItem('jarvis_forced_provider') === 'openai' && enabled().openai === true && w.localStorage.getItem('jarvis_auto_routing') === 'false', '"koristi samo ChatGPT" → OpenAI uključen i forsiran');
  pass(['A-KEY', 'G-KEY', 'O-KEY'].every((k, i) => w.localStorage.getItem(['jarvis_anthropic_key', 'jarvis_gemini_key', 'jarvis_openai_key'][i]) === k), 'Nijedan ključ nije izgubljen');
  click($('settingsBtn')); await sleep(30);
  pass($('versionLabel').textContent === 'Verzija 8.9', 'Verzija 8.9');
  process.exit(0);
})().catch(e => { console.error('TEST ERROR', e); process.exit(1); });
