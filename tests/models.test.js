const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/<script src="https:\/\/accounts\.google\.com[^>]*><\/script>/, '');
const P = { c_m3_v: 1.68, fix_v: 0, c_kwh_s: 0.142714, mjer: 1.73, pdv_s: 0.13, doi: 0.982, smece: 0, kom: 0, amis: 0, hrt: 10.62, ost: 0 };
const db = { params: { ...P }, entries: [{ id: 1, d: '01.07.2026.', v: 1250, k: 12000, p: P }, { id: 2, d: '01.08.2026.', v: 1262, k: 12150, p: P }] };
const res = (obj, status = 200) => ({ ok: status < 400, status, json: async () => JSON.parse(JSON.stringify(obj ?? null)), text: async () => JSON.stringify(obj ?? null), clone() { return this; } });
const A = [], G = [], Q = [];
let anthropicScript = [], groqScript = [];
async function fakeFetch(url, opts = {}) {
  url = String(url); const body = opts.body ? JSON.parse(opts.body) : null;
  if (url.includes('api.anthropic.com')) { A.push(body); const next = anthropicScript.shift(); return typeof next === 'function' ? next(body) : res(next); }
  if (url.includes('generativelanguage')) {
    G.push(body);
    if (body.contents[0].parts.some(p => p.inlineData)) return res({ candidates: [{ content: { parts: [{ text: '{}' }] } }] });
    return res({ candidates: [{ content: { parts: [{ text: 'Gemini odgovor.' }] } }], usageMetadata: {} });
  }
  if (url.includes('api.groq.com')) { Q.push(body); return res(groqScript.shift()); }
  if (url.startsWith('https://test-rtdb.example.app/')) return res(db);
  throw new Error('Unexpected fetch ' + url);
}
const speechQueue = [];
class FakeSR { start() { setTimeout(() => { this.onstart && this.onstart(); const r = [{ transcript: speechQueue.shift() }]; r.isFinal = true;
  this.onresult && this.onresult({ resultIndex: 0, results: [r] }); this.onend && this.onend(); }, 5); } stop() {} }
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.github.io/jarvis/',
  beforeParse(w) {
    const ls = { jarvis_anthropic_key: 'a', jarvis_gemini_key: 'g', jarvis_groq_key: 'q', jarvis_boot_sequence: 'false', jarvis_lang: 'hr-HR',
      jarvis_anthropic_model: 'claude-sonnet-4-6', jarvis_groq_model: 'groq/compound', jarvis_auto_routing: 'false', jarvis_forced_provider: 'anthropic',
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
async function waitFor(fn, label, ms = 3000) { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await sleep(20); } console.log('TIMEOUT: ' + label); return false; }
const click = el => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const idle = () => $('stateLabel').textContent === 'STANDBY';
const say = async t => { await waitFor(idle, 'idle'); speechQueue.push(t); click($('micBtn')); await sleep(60); await waitFor(idle, 'after ' + t); await sleep(30); };
const lastText = () => { const m = d.querySelectorAll('.msg-assistant .msg-text, .msg-error .msg-text'); return m.length ? m[m.length - 1].textContent : ''; };
const pass = (c, m) => console.log((c ? 'PASS' : 'FAIL') + ' — ' + m);
const setModel = async (provider, model) => {
  click($('settingsBtn')); await sleep(30);
  $('forcedProviderSelect').value = provider; if (model) $(provider + 'Model').value = model;
  click($('saveSettings')); await sleep(30);
};
const hasThinkingBefore = (msgs) => { let last = -1; msgs.forEach((m, i) => { if (m.role === 'user' && typeof m.content === 'string') last = i; });
  return msgs.slice(0, last).some(m => Array.isArray(m.content) && m.content.some(b => b.type === 'thinking')); };

(async () => {
  await sleep(300);
  console.log('--- 1. Zamjena zastarjelih modela ---');
  click($('settingsBtn')); await sleep(30);
  pass($('anthropicModel').value === 'claude-sonnet-5', 'Sonnet 4.6 → Sonnet 5');
  pass(!$('groqModel') && !d.querySelector('.provider-tab[data-provider="groq"]') && ![...$('forcedProviderSelect').options].some(o => o.value === 'groq'), 'Groq uklonjen iz postavki');
  pass(w.localStorage.getItem('jarvis_groq_key') === null && w.localStorage.getItem('jarvis_groq_model') === null, 'Stari Groq ključ i model obrisani iz preglednika');
  pass($('anthropicEffort').value === 'low', 'Brzina razmišljanja: zadano "Brzo"');
  click($('closeSettings'));
  await setModel('anthropic', 'claude-opus-5-5');

  console.log('--- 2. Opus 5.5: zahtjev koji API prihvaća ---');
  anthropicScript = [
    { content: [{ type: 'thinking', thinking: '', signature: 'SIG-1' }, { type: 'tool_use', id: 'tu1', name: 'get_utility_summary', input: { periods: 2 } }], stop_reason: 'tool_use', usage: {} },
    { content: [{ type: 'thinking', thinking: '', signature: 'SIG-2' }, { type: 'text', text: 'Režije su bile 48 eura.' }], stop_reason: 'end_turn', usage: {} },
  ];
  await say('koliko su bile režije');
  const [r1, r2] = A;
  pass(r1.model === 'claude-opus-5-5' && r1.output_config?.effort === 'low', 'Model claude-opus-5-5 s effort "low"');
  pass(!('thinking' in r1) && !('temperature' in r1) && !('tool_choice' in r1), 'Bez polja koja Opus 5.5 odbija (thinking, temperature, tool_choice)');
  pass(r1.max_tokens >= 4096, `max_tokens ${r1.max_tokens} ostavlja mjesta za razmišljanje`);
  pass(r2.system === r1.system, 'Sustavske upute iste tijekom cijele petlje alata');
  const echoed = r2.messages[r2.messages.length - 2];
  pass(echoed.role === 'assistant' && JSON.stringify(echoed.content) === JSON.stringify([{ type: 'thinking', thinking: '', signature: 'SIG-1' }, { type: 'tool_use', id: 'tu1', name: 'get_utility_summary', input: { periods: 2 } }]), 'Blok razmišljanja vraćen nepromijenjen uz rezultat alata');
  pass(JSON.stringify(r2.messages.slice(0, r1.messages.length)) === JSON.stringify(r1.messages), 'Kontekst se u petlji samo nadopunjuje');
  pass(lastText() === 'Režije su bile 48 eura.', 'Izgovoren samo tekst (razmišljanje se ne čita naglas)');

  console.log('--- 3. Sljedeći upit ---');
  anthropicScript = [{ content: [{ type: 'thinking', thinking: '', signature: 'S' }, { type: 'text', text: 'Dobro sam.' }], stop_reason: 'end_turn', usage: {} }];
  await say('kako si');
  pass(!hasThinkingBefore(A[A.length - 1].messages), 'Razmišljanje iz prethodnih, završenih odgovora se ne šalje ponovno');

  console.log('--- 4. Sigurnosne mreže ---');
  anthropicScript = [() => res({ type: 'error', error: { type: 'invalid_request_error', message: 'output_config.effort: not supported for this model' } }, 400),
    { content: [{ type: 'text', text: 'Radi i bez effort.' }], stop_reason: 'end_turn', usage: {} }];
  await say('test effort');
  pass(A[A.length - 1].output_config === undefined && lastText() === 'Radi i bez effort.', 'Ako model odbije effort — ponovni pokušaj bez njega');
  anthropicScript = [{ content: [{ type: 'thinking', thinking: '', signature: 'R' }], stop_reason: 'refusal', usage: {} }];
  await say('nešto zabranjeno');
  pass(lastText() === 'Na to ne mogu odgovoriti.', 'Odbijanje modela: Jarvis to kaže umjesto da šuti');

  console.log('--- 5. Haiku 4.5 ---');
  await setModel('anthropic', 'claude-haiku-4-5-20251001');
  anthropicScript = [{ content: [{ type: 'text', text: 'Haiku.' }], stop_reason: 'end_turn', usage: {} }];
  await say('pozdrav');
  pass(!('output_config' in A[A.length - 1]) && A[A.length - 1].max_tokens === 1500, 'Haiku: bez effort parametra');

  console.log('--- 7. Gemini 3.8 Flash ---');
  await setModel('gemini', 'gemini-3.8-flash');
  await say('što ima novo');
  const gb = G[G.length - 1];
  pass(gb && gb.contents.every(c => c.parts.length > 0), 'Gemini: nijedna prazna poruka');
  pass(d.querySelector('.msg-label .provider-tag') && lastText() === 'Gemini odgovor.', 'Gemini 3.8 Flash odgovara');
  process.exit(0);
})().catch(e => { console.error('TEST ERROR', e); process.exit(1); });
