const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/<script src="https:\/\/accounts\.google\.com[^>]*><\/script>/, '');
const res = (o) => ({ ok: true, status: 200, json: async () => o, text: async () => JSON.stringify(o), clone() { return this; } });
const pass = (c, m) => console.log((c ? 'PASS' : 'FAIL') + ' — ' + m);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const events = [], speech = [];
async function fakeFetch(url, o = {}) {
  if (!String(url).includes('generativelanguage')) throw new Error('Unexpected fetch ' + url);
  const body = JSON.parse(o.body), last = body.contents[body.contents.length - 1];
  if (last.parts.some(p => p.functionResponse)) return res({ candidates: [{ content: { parts: [{ text: 'Gotovo.' }] } }] });
  const text = last.parts.map(p => p.text || '').join(' ');
  if (/javi ivanu/.test(text)) return res({ candidates: [{ content: { parts: [{ text: 'Šaljem Ivanu.' }, { functionCall: { name: 'send_message', args: { contact_name: 'Ivan', message: 'Kasnim 10 minuta', channel: 'whatsapp' } } }] } }] });
  if (/javi ani/.test(text)) return res({ candidates: [{ content: { parts: [{ text: 'Pišem Ani.' }, { functionCall: { name: 'send_message', args: { contact_name: 'Ana', message: 'Stižem', channel: 'whatsapp' } } }] } }] });
  if (/sms anu/.test(text)) return res({ candidates: [{ content: { parts: [{ text: 'SMS za Anu.' }, { functionCall: { name: 'send_message', args: { contact_name: 'Ana', message: 'Zovi me', channel: 'sms' } } }] } }] });
  return res({ candidates: [{ content: { parts: [{ text: 'OK.' }] } }] });
}
class FakeSR { start() { setTimeout(() => { this.onstart && this.onstart(); if (speech.length) { const r = [{ transcript: speech.shift() }]; r.isFinal = true; this.onresult && this.onresult({ resultIndex: 0, results: [r] }); } this.onend && this.onend(); }, 5); } stop() {} }
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.github.io/jarvis/',
  beforeParse(w) {
    Object.defineProperty(w.navigator, 'userAgent', { value: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/141.0 Mobile Safari/537.36' });
    const ls = { jarvis_gemini_key: 'g', jarvis_boot_sequence: 'false', jarvis_lang: 'hr-HR',
      jarvis_contacts: JSON.stringify([{ id: 'c1', name: 'Martina', phone: '091 234 5678' }, { id: 'c2', name: 'Ivan', phone: '+43 664 1234567' }, { id: 'c3', name: 'Ana', phone: '00385 98 111 222' }]) };
    for (const k in ls) w.localStorage.setItem(k, ls[k]);
    w.fetch = fakeFetch; w.webkitSpeechRecognition = FakeSR;
    w.SpeechSynthesisUtterance = function (t) { this.text = t; };
    w.speechSynthesis = { getVoices: () => [], cancel() {}, speak(u) { events.push('SPEAK ' + u.text); setTimeout(() => u.onend && u.onend(), 5); } };
    w.HTMLAnchorElement.prototype.click = function () { events.push('OPEN ' + this.getAttribute('href')); };
  } });
const w = dom.window, d = w.document, $ = id => d.getElementById(id);
async function waitFor(fn, l, ms = 4000) { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await sleep(20); } console.log('TIMEOUT: ' + l); return false; }
const click = el => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const idle = () => $('stateLabel').textContent === 'STANDBY';
const say = async t => { await waitFor(idle, 'idle'); speech.push(t); click($('micBtn')); await sleep(70); await waitFor(idle, 'after ' + t); await sleep(60); };
const opens = () => events.filter(e => e.startsWith('OPEN ')).map(e => e.slice(5));
const lastCard = () => [...d.querySelectorAll('.card-link')].pop();

(async () => {
  await sleep(300);
  console.log('--- 1. Popis za kupovinu na WhatsApp (lokalno) ---');
  await say('dodaj kruh i mlijeko na popis');
  events.length = 0;
  await say('pošalji popis Martini');
  const u = opens()[0] || '';
  pass(events[0] && events[0].startsWith('OPEN intent://send?phone=385912345678&text='), 'WhatsApp otvoren odmah, s brojem 091… pretvorenim u 385912345678');
  pass(u.includes('scheme=whatsapp') && u.includes('S.browser_fallback_url=' + encodeURIComponent('https://wa.me/385912345678?text=')), 'Izravno u aplikaciju; ako WhatsApp nije instaliran, rezerva je wa.me');
  pass(decodeURIComponent(u.split('&text=')[1]).includes('• kruh'), 'Poruka sadrži popis');
  pass(!events.some(e => e.startsWith('SPEAK')), 'Bez govora preko WhatsAppa');
  pass(lastCard().getAttribute('href') === u && !lastCard().hasAttribute('target'), 'Kartica ostaje kao rezerva, s istom poveznicom (bez otvaranja nove kartice preglednika)');
  pass(idle(), 'Reaktor se vratio u Standby');

  console.log('--- 2. Poruka preko AI modela ---');
  events.length = 0;
  await say('javi ivanu da kasnim deset minuta'); await waitFor(() => opens().length, 'open after reply');
  const iSpeak = events.findIndex(e => e === 'SPEAK Šaljem Ivanu.'), iOpen = events.findIndex(e => e.startsWith('OPEN '));
  pass(iSpeak >= 0 && iOpen > iSpeak, 'Jarvis prvo kaže "Šaljem Ivanu.", zatim se sam otvori WhatsApp');
  pass(opens()[0].startsWith('intent://send?phone=436641234567&text=Kasnim%2010%20minuta'), '+43 664… → 436641234567 (strani broj ispravno)');
  events.length = 0;
  await say('javi ani da stižem'); await waitFor(() => opens().length, 'open ana');
  pass(opens()[0].startsWith('intent://send?phone=38598111222&'), '00385 98… → 38598111222');
  events.length = 0;
  await say('pošalji sms anu da me zove'); await waitFor(() => opens().length, 'open sms');
  pass(opens()[0] === 'sms:0038598111222?body=Zovi%20me', 'SMS: otvara aplikaciju za poruke s tekstom');

  console.log('--- 3. Druga država ---');
  ph = null;
  ph = $('settingsBtn'); click(ph); await sleep(30);
  pass($('waCountryInput').value === '385', 'Zadani pozivni broj 385');
  $('waCountryInput').value = '+43'; click($('saveSettings')); await sleep(30);
  events.length = 0;
  await say('pošalji popis Martini');
  pass((opens()[0] || '').startsWith('intent://send?phone=43912345678&'), 'Pozivni broj 43: 091… → 43912345678');
  process.exit(0);
})().catch(e => { console.error('TEST ERROR', e); process.exit(1); });
var ph;
