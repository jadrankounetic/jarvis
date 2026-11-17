// Oblak (v10): privatna baza s prijavom (Firebase Auth + Realtime Database preko REST-a),
// sinkronizacija između dva uređaja, spajanje pri prvom povezivanju, istek prijave, odjava, reset.
// Firebase je lažan (u memoriji), s pravilom: korisnik smije samo u /users/<svoj uid>/.
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/<script src="https:\/\/accounts\.google\.com[^>]*><\/script>/, '');
const pass = (c, m) => console.log((c ? 'PASS' : 'FAIL') + ' — ' + m);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DB = 'https://jarvis-test-default-rtdb.example-region.firebasedatabase.app';
const API_KEY = 'TEST_WEB_API_KEY';
const PASSWORD = 'tajna-lozinka-123';

// ---------- lažni Firebase ----------
const fb = { users: {}, ids: {}, refresh: {}, tree: {}, log: [], n: 0 };
const reply = (status, obj) => ({ ok: status < 400, status, json: async () => JSON.parse(JSON.stringify(obj ?? null)), text: async () => JSON.stringify(obj ?? null) });
const getAt = (segs) => segs.reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), fb.tree);
function setAt(segs, val) {
  let o = fb.tree;
  for (const k of segs.slice(0, -1)) { if (!o[k] || typeof o[k] !== 'object') o[k] = {}; o = o[k]; }
  const last = segs[segs.length - 1];
  if (val === null || val === undefined) delete o[last]; else o[last] = JSON.parse(JSON.stringify(val));
}
function newTokens(uid) { const id = 'id' + (++fb.n), rt = 'rt' + fb.n; fb.ids[id] = uid; fb.refresh[rt] = uid; return { id, rt }; }
async function firebase(url, opts = {}) {
  const u = new URL(url);
  if (u.host === 'identitytoolkit.googleapis.com') {
    if (u.searchParams.get('key') !== API_KEY) return reply(400, { error: { message: 'API key not valid. Please pass a valid API key.' } });
    const b = JSON.parse(opts.body);
    if (u.pathname.endsWith('accounts:signUp')) {
      if (fb.users[b.email]) return reply(400, { error: { message: 'EMAIL_EXISTS' } });
      if (!b.password || b.password.length < 6) return reply(400, { error: { message: 'WEAK_PASSWORD : Password should be at least 6 characters' } });
      fb.users[b.email] = { password: b.password, uid: 'uid_' + Object.keys(fb.users).length + 'x' };
    } else if (!fb.users[b.email] || fb.users[b.email].password !== b.password) return reply(400, { error: { message: 'INVALID_LOGIN_CREDENTIALS' } });
    const uid = fb.users[b.email].uid, t = newTokens(uid);
    return reply(200, { localId: uid, email: b.email, idToken: t.id, refreshToken: t.rt, expiresIn: '3600' });
  }
  if (u.host === 'securetoken.googleapis.com') {
    const rt = new URLSearchParams(opts.body).get('refresh_token');
    if (!fb.refresh[rt]) return reply(400, { error: { message: 'INVALID_REFRESH_TOKEN' } });
    const t = newTokens(fb.refresh[rt]);
    return reply(200, { id_token: t.id, refresh_token: t.rt, expires_in: '3600' });
  }
  if (url.startsWith(DB)) {
    const segs = u.pathname.replace(/\.json$/, '').split('/').filter(Boolean).map(decodeURIComponent);
    const uid = fb.ids[u.searchParams.get('auth')];
    const method = opts.method || 'GET';
    fb.log.push(method + ' /' + segs.join('/'));
    if (!uid) return reply(401, { error: 'Auth token is expired' });
    if (segs[0] !== 'users' || segs[1] !== uid) return reply(401, { error: 'Permission denied' }); // pravila baze
    if (method === 'GET') return reply(200, getAt(segs) ?? null);
    if (method === 'PUT') { setAt(segs, JSON.parse(opts.body)); return reply(200, JSON.parse(opts.body)); }
    if (method === 'PATCH') { const cur = getAt(segs) || {}; setAt(segs, Object.assign(cur, JSON.parse(opts.body))); return reply(200, JSON.parse(opts.body)); }
    if (method === 'DELETE') { setAt(segs, null); return reply(200, null); }
  }
  if (url.includes('generativelanguage')) return reply(200, { candidates: [{ content: { parts: [{ text: 'OK.' }] } }] });
  throw new Error('Unexpected fetch ' + url);
}

// ---------- dva uređaja ----------
function device(name, ls) {
  const speech = [], spoken = [];
  class FakeSR { start() { setTimeout(() => { this.onstart && this.onstart(); const r = [{ transcript: speech.shift() }]; r.isFinal = true; this.onresult && this.onresult({ resultIndex: 0, results: [r] }); this.onend && this.onend(); }, 5); } stop() {} }
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => { if (!/navigation/.test(e.message)) console.error(e.message); }); // location.reload() nakon reseta
  vc.on('error', (...a) => console.error(...a));
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: `https://${name}.example/jarvis/`, virtualConsole: vc,
    beforeParse(w) {
      for (const k in ls) w.localStorage.setItem(k, ls[k]);
      w.fetch = firebase; w.webkitSpeechRecognition = FakeSR;
      w.SpeechSynthesisUtterance = function (t) { this.text = t; };
      w.speechSynthesis = { getVoices: () => [], cancel() {}, speak(u) { spoken.push(u.text); setTimeout(() => u.onend && u.onend(), 5); } };
    } });
  const w = dom.window, d = w.document, $ = id => d.getElementById(id);
  const click = el => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const idle = () => $('stateLabel').textContent === 'STANDBY';
  const waitFor = async (fn, label, ms = 4000) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await sleep(20); } console.log(`TIMEOUT [${name}]: ${label}`); return false; };
  return {
    w, d, $, click, spoken, waitFor,
    ls: k => w.localStorage.getItem(k),
    list: k => JSON.parse(w.localStorage.getItem(k) || '[]'),
    say: async t => { await waitFor(idle, 'idle'); speech.push(t); click($('micBtn')); await sleep(70); await waitFor(idle, 'after ' + t); await sleep(60); },
    status: () => $('cloudStatus').textContent,
    login: async (kind, email, password = PASSWORD) => {
      click($('settingsBtn')); await sleep(20);
      $('cloudApiKeyInput').value = API_KEY; $('cloudDbUrlInput').value = DB; $('cloudEmailInput').value = email; $('cloudPasswordInput').value = password;
      const before = fb.log.length;
      click($(kind === 'signUp' ? 'cloudSignupBtn' : 'cloudLoginBtn'));
      await waitFor(() => /sinkronizirano|greška|Pogrešan|već registriran|nije|znakova/i.test($('cloudStatus').textContent) && fb.log.length >= before, 'login');
      await sleep(50);
    },
  };
}
const server = k => { const r = getAt(['users', fb.users['ja@example.com'].uid, 'data', k]); return r && !r.del ? r.v : null; };

(async () => {
  const A = device('a', { jarvis_gemini_key: 'gA', jarvis_boot_sequence: 'false', jarvis_lang: 'hr-HR', jarvis_theme: 'zelena',
    jarvis_contacts: JSON.stringify([{ id: 'c1', name: 'Ana', phone: '0911111111' }]),
    jarvis_history: JSON.stringify([{ role: 'user', content: 'privatni razgovor' }]) });
  await sleep(300);

  console.log('--- 1. Uređaj A: registracija i prvo slanje ---');
  pass(A.$('cloudStatus').textContent.includes('Nije postavljeno') && A.$('cloudDot').hidden, 'Prije prijave: oblak nije postavljen');
  await A.login('signUp', 'ja@example.com', '123');
  pass(A.status().includes('najmanje 6') || A.status().includes('6 znakova'), 'Prekratka lozinka: jasna poruka');
  await A.login('signUp', 'ja@example.com');
  pass(A.status().startsWith('Prijavljen: ja@example.com · sinkronizirano'), 'Registriran i sinkroniziran: ' + A.status());
  const uidA = fb.users['ja@example.com'].uid;
  pass(JSON.parse(server('jarvis_contacts'))[0].name === 'Ana' && server('jarvis_theme') === 'zelena', 'Kontakti i postavke su u oblaku');
  pass(server('jarvis_gemini_key') === null && server('jarvis_history') === null, 'API ključ i razgovor NISU u oblaku');
  pass(fb.log.every(l => l.startsWith(`GET /users/${uidA}`) || l.startsWith(`PUT /users/${uidA}/data/`) || l.startsWith(`PATCH /users/${uidA}/info`)), 'Sve ide samo pod /users/<moj uid>/');
  const allLocal = Object.keys(A.w.localStorage).map(k => A.w.localStorage.getItem(k)).join('\n');
  pass(!allLocal.includes(PASSWORD), 'Lozinka nije spremljena nigdje na uređaju');
  pass(!A.$('cloudDot').hidden && A.$('cloudDot').dataset.state === 'ok', '☁ u gornjoj traci');
  pass(A.$('cloudLoginBtn').hidden && !A.$('cloudLogoutBtn').hidden && A.$('cloudPasswordField').hidden, 'Nakon prijave: Odjava i Sinkroniziraj, bez polja za lozinku');
  A.click(A.$('closeSettings') || A.$('saveSettings')); await sleep(30);

  console.log('--- 2. Promjena na A sama ide u oblak ---');
  await A.say('dodaj mlijeko i kruh na popis');
  await A.waitFor(() => (server('jarvis_shopping') || '').includes('kruh'), 'push shopping', 5000);
  pass((server('jarvis_shopping') || '').includes('mlijeko') && server('jarvis_shopping').includes('kruh'), 'Popis za kupovinu u oblaku ~1,5 s nakon promjene');

  console.log('--- 3. Uređaj B: prijava, spajanje s njegovim podacima ---');
  const B = device('b', { jarvis_gemini_key: 'gB', jarvis_boot_sequence: 'false', jarvis_lang: 'hr-HR',
    jarvis_contacts: JSON.stringify([{ id: 'c2', name: 'Marko', phone: '0922222222' }]) });
  await sleep(300);
  await B.login('signIn', 'ja@example.com', 'kriva');
  pass(B.status() === 'Pogrešan email ili lozinka.', 'Kriva lozinka: ' + B.status());
  await B.login('signIn', 'ja@example.com');
  pass(B.status().startsWith('Prijavljen: ja@example.com · sinkronizirano'), 'B prijavljen: ' + B.status());
  pass(B.list('jarvis_contacts').map(c => c.name).join(',') === 'Ana,Marko', 'Kontakti spojeni (Ana iz oblaka + Marko s B)');
  pass(B.list('jarvis_shopping').map(i => i.text).sort().join(',') === 'kruh,mlijeko', 'B dobio popis za kupovinu');
  pass(B.d.documentElement.dataset.theme === 'zelena', 'B odmah preuzeo temu (bez ponovnog pokretanja)');
  pass(B.ls('jarvis_gemini_key') === 'gB', 'B zadržao svoj API ključ');
  pass(JSON.parse(server('jarvis_contacts')).length === 2, 'Spojeni kontakti vraćeni u oblak');
  pass(!!B.ls('jarvis_cloud_prelink') && JSON.parse(B.ls('jarvis_cloud_prelink')).data.jarvis_contacts.includes('Marko'), 'Kopija podataka s B prije spajanja sačuvana');
  B.click(B.$('closeSettings') || B.$('saveSettings')); await sleep(30);
  B.click(B.$('contactsList') ? B.$('settingsBtn') : B.$('settingsBtn')); await sleep(20);
  pass(B.$('contactsList').textContent.includes('Marko') && B.$('contactsList').textContent.includes('Ana'), 'Postavke na B prikazuju oba kontakta');
  B.click(B.$('closeSettings') || B.$('saveSettings')); await sleep(30);

  console.log('--- 4. Promjene s B stižu na A ---');
  await B.say('makni mlijeko s popisa');
  await B.waitFor(() => !(server('jarvis_shopping') || '').includes('mlijeko'), 'push removal', 5000);
  await A.say('sinkroniziraj');
  pass(A.list('jarvis_contacts').length === 2 && !A.list('jarvis_shopping').some(i => i.text === 'mlijeko'), 'A dobio Marka i popis bez mlijeka');
  pass(/^Sinkronizirano: \d+ promjen/.test(A.spoken[A.spoken.length - 1]), 'Glasom: ' + A.spoken[A.spoken.length - 1]);
  A.w.document.dispatchEvent(new A.w.Event('visibilitychange')); await sleep(400);
  await B.say('nova ideja: pametna rasvjeta u garaži');
  await B.waitFor(() => (server('jarvis_ideas') || '').includes('garaži'), 'push idea', 5000);
  A.w.dispatchEvent(new A.w.Event('focus'));
  await A.waitFor(() => (A.ls('jarvis_ideas') || '').includes('garaži'), 'idea on A', 3000);
  pass((A.ls('jarvis_ideas') || '').includes('garaži'), 'Kad se Jarvis otvori (focus), A odmah povuče novu ideju s B');

  console.log('--- 4b. Izbor modela vrijedi samo za uređaj ---');
  await A.say('isključi Gemini');
  await sleep(1800);
  pass(JSON.parse(A.ls('jarvis_provider_enabled') || '{}').gemini === false, 'A: Gemini isključen');
  pass(server('jarvis_provider_enabled') === null && server('jarvis_auto_routing') === null, 'Izbor modela ne ide u oblak');
  await B.say('sinkroniziraj');
  pass(JSON.parse(B.ls('jarvis_provider_enabled') || '{}').gemini !== false, 'B i dalje ima Gemini');

  console.log('--- 5. Istek prijave ---');
  fb.ids = {}; // svi ID tokeni istekli
  await A.say('dodaj jaja na popis');
  await A.waitFor(() => (server('jarvis_shopping') || '').includes('jaja'), 'push after expiry', 5000);
  pass((server('jarvis_shopping') || '').includes('jaja'), 'Token obnovljen automatski, promjena spremljena');

  console.log('--- 6. API ključevi u oblak (prekidač) ---');
  A.click(A.$('settingsBtn')); await sleep(20);
  A.$('cloudWithKeysToggle').checked = true; A.$('cloudWithKeysToggle').dispatchEvent(new A.w.Event('change'));
  await A.waitFor(() => server('jarvis_gemini_key') === 'gA', 'keys up');
  pass(server('jarvis_gemini_key') === 'gA', 'Uključeno: ključ A u oblaku');
  A.$('cloudWithKeysToggle').checked = false; A.$('cloudWithKeysToggle').dispatchEvent(new A.w.Event('change'));
  await A.waitFor(() => server('jarvis_gemini_key') === null, 'keys removed');
  pass(server('jarvis_gemini_key') === null && A.ls('jarvis_gemini_key') === 'gA', 'Isključeno: ključ maknut iz oblaka, ostao na uređaju');
  A.click(A.$('closeSettings') || A.$('saveSettings')); await sleep(30);

  console.log('--- 7. "Reset All Data" na B ne briše oblak; nova prijava vraća sve ---');
  const before = server('jarvis_contacts');
  B.click(B.$('settingsBtn')); await sleep(20);
  B.click(B.$('resetAll'));
  await B.waitFor(() => B.$('pwModal').dataset.open === 'true', 'pw');
  B.$('pwInput').value = '1234'; B.click(B.$('pwConfirm')); await sleep(2500);
  pass(B.ls('jarvis_contacts') === null && B.ls('jarvis_cloud') === null, 'B obrisan lokalno, odjavljen');
  pass(server('jarvis_contacts') === before && server('jarvis_shopping') !== null, 'Oblak netaknut');
  const C = device('c', { jarvis_gemini_key: 'gC', jarvis_boot_sequence: 'false', jarvis_lang: 'hr-HR' }); // npr. obrisani preglednik (ključ ponovno upisan)
  await sleep(300);
  await C.login('signIn', 'ja@example.com');
  pass(C.list('jarvis_contacts').length === 2 && C.list('jarvis_shopping').some(i => i.text === 'jaja') && (C.ls('jarvis_ideas') || '').includes('garaži'), 'Nakon brisanja preglednika: prijava vraća kontakte, popis i ideje');

  console.log('--- 8. Odjava ---');
  C.click(C.$('cloudLogoutBtn')); await sleep(30);
  const n = fb.log.length;
  C.w.localStorage.setItem('jarvis_shopping', '[]'); await sleep(1800);
  pass(C.status().startsWith('Odjavljen') && fb.log.length === n && (server('jarvis_shopping') || '').includes('jaja'), 'Nakon odjave ništa se ne šalje u oblak');
  await C.say('stanje oblaka');
  pass(C.spoken[C.spoken.length - 1].startsWith('Oblak nije povezan.'), '"stanje oblaka" bez prijave');
  await A.say('stanje oblaka');
  pass(A.spoken[A.spoken.length - 1].startsWith('Prijavljen si kao ja@example.com.'), '"stanje oblaka": ' + A.spoken[A.spoken.length - 1]);
  console.log('--- 9. Prazna polja s novog uređaja ne brišu postavke drugog ---');
  const L = device('l', { jarvis_gemini_key: 'gL', jarvis_boot_sequence: 'false', jarvis_lang: 'hr-HR' });
  await sleep(300);
  L.click(L.$('settingsBtn')); await sleep(20); L.click(L.$('saveSettings')); await sleep(30); // prazna polja režija spremljena kao ''
  pass(L.ls('jarvis_rezije_url') === '', 'Novi uređaj ima prazno polje režija');
  await L.login('signUp', 'drugi@example.com');
  const srv2 = k => { const r = getAt(['users', fb.users['drugi@example.com'].uid, 'data', k]); return r && !r.del ? r.v : null; };
  pass(srv2('jarvis_rezije_url') === '', 'Prazno polje je u oblaku');
  const P = device('p', { jarvis_gemini_key: 'gP', jarvis_boot_sequence: 'false', jarvis_lang: 'hr-HR',
    jarvis_rezije_url: 'https://kuca-default-rtdb.example.firebasedatabase.app', jarvis_rezije_node: 'kuca', jarvis_rezije_title: 'Kuća' });
  await sleep(300);
  await P.login('signIn', 'drugi@example.com');
  pass(P.ls('jarvis_rezije_url') === 'https://kuca-default-rtdb.example.firebasedatabase.app' && P.ls('jarvis_rezije_node') === 'kuca', 'Mobitel zadržao vezu na režije');
  pass(srv2('jarvis_rezije_url') === 'https://kuca-default-rtdb.example.firebasedatabase.app', 'Veza na režije poslana u oblak');
  L.w.dispatchEvent(new L.w.Event('focus'));
  await L.waitFor(() => L.ls('jarvis_rezije_node') === 'kuca', 'laptop gets rezije');
  pass(L.ls('jarvis_rezije_node') === 'kuca' && L.ls('jarvis_rezije_title') === 'Kuća', 'Laptop dobio vezu na režije');

  console.log('--- 10. Popravak uređaja kojem je prvo povezivanje ispraznilo postavke ---');
  const uid2 = fb.users['drugi@example.com'].uid; fb.refresh['rtR'] = uid2;
  setAt(['users', uid2, 'data', 'jarvis_rezije_url'], { v: '', t: Date.now() + 1000, dev: 'x' }); // kao da je prazno stiglo iz oblaka
  const R = device('r', { jarvis_gemini_key: 'gR', jarvis_boot_sequence: 'false', jarvis_lang: 'hr-HR',
    jarvis_rezije_url: '', jarvis_rezije_node: '', jarvis_theme: 'crvena',
    jarvis_cloud: JSON.stringify({ apiKey: API_KEY, dbUrl: DB, uid: uid2, email: 'drugi@example.com', refreshToken: 'rtR', dev: 'dR' }),
    jarvis_cloud_meta: JSON.stringify({ jarvis_rezije_url: { t: Date.now() + 1000, h: '-' } }),
    jarvis_cloud_prelink: JSON.stringify({ at: 1, data: { jarvis_rezije_url: 'https://stara-default-rtdb.example.firebasedatabase.app', jarvis_rezije_node: 'stari', jarvis_theme: 'zelena' } }) });
  await sleep(400);
  pass(R.ls('jarvis_rezije_url') === 'https://stara-default-rtdb.example.firebasedatabase.app' && R.ls('jarvis_rezije_node') === 'stari', 'Ispražnjena veza na režije vraćena iz kopije prije povezivanja');
  pass(R.ls('jarvis_theme') === 'crvena', 'Postavke koje nisu prazne ostaju kakve jesu');
  pass([...R.d.querySelectorAll('.msg-text')].some(m => m.textContent.includes('Vratio sam 2 postavke') && m.textContent.includes('veza na režije')), 'Jarvis javlja što je vratio');
  await R.waitFor(() => srv2('jarvis_rezije_url') === 'https://stara-default-rtdb.example.firebasedatabase.app', 'repair pushed', 5000);
  pass(srv2('jarvis_rezije_url') === 'https://stara-default-rtdb.example.firebasedatabase.app', 'Vraćena vrijednost otišla u oblak (stiže i na druge uređaje)');
  pass(JSON.parse(R.ls('jarvis_cloud')).prelinkRepaired === true, 'Popravak se radi samo jednom');
  process.exit(0);
})().catch(e => { console.error('TEST ERROR', e); process.exit(1); });
