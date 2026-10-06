const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/<script src="https:\/\/accounts\.google\.com[^>]*><\/script>/, '');
const day = 86400000;
const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.github.io/jarvis/',
  beforeParse(w) {
    w.localStorage.setItem('jarvis_gemini_key', 'test');
    w.localStorage.setItem('jarvis_boot_sequence', 'false');
    w.localStorage.setItem('jarvis_memories', JSON.stringify([{ id: 'm1', fact: 'Voli kavu', timestamp: Date.now() - day }]));
    w.localStorage.setItem('jarvis_history', JSON.stringify([{ role: 'user', content: 'bok' }, { role: 'assistant', content: 'Pozdrav.' }]));
    w.HTMLMediaElement.prototype.play = () => Promise.resolve();
  },
});
const w = dom.window, d = w.document, $ = id => d.getElementById(id);
const tick = (ms = 80) => new Promise(r => setTimeout(r, ms));
const click = el => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const mem = () => JSON.parse(w.localStorage.getItem('jarvis_memories') || '[]').length;
const hist = () => JSON.parse(w.localStorage.getItem('jarvis_history') || '[]').length;
const open = () => $('pwModal').dataset.open === 'true';

(async () => {
  await tick(300);
  const pass = (c, m) => console.log((c ? 'PASS' : 'FAIL') + ' — ' + m);
  click($('settingsBtn')); await tick();
  click($('resetMemoriesBtn')); await tick();
  pass(open(), 'Reset Memory otvara prozor za lozinku');
  pass($('pwInput').type === 'password', 'Polje skriva upisane znakove');
  $('pwInput').value = '0000'; click($('pwConfirm')); await tick();
  pass(open() && $('pwError').textContent.includes('Pogrešna'), 'Pogrešna lozinka: prozor ostaje otvoren uz poruku');
  pass(mem() === 1, 'Pogrešna lozinka: pamćenje NIJE obrisano');
  click($('pwCancel')); await tick();
  pass(!open() && mem() === 1, 'Odustani: prozor zatvoren, pamćenje NIJE obrisano');
  click($('resetMemoriesBtn')); await tick();
  $('pwInput').value = '1234'; click($('pwConfirm')); await tick();
  pass(!open() && mem() === 0, 'Lozinka 1234: pamćenje obrisano');
  click($('closeSettings')); await tick();
  click($('clearBtn')); await tick();
  pass(open(), '⟲ traži lozinku');
  pass(hist() === 2, '⟲ prije potvrde: razgovor još postoji');
  $('pwInput').value = '1234';
  $('pwInput').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await tick();
  pass(!open() && hist() === 0, '⟲ + Enter s lozinkom: razgovor obrisan');
  pass($('clearBtn').classList.contains('icon-btn-small'), '⟲ je manja tipka');
  pass(['resetAll', 'resetMemoriesBtn', 'clearExpensesBtn', 'resetUsageBtn', 'importBackupBtn'].every(id => $(id).classList.contains('btn-small-danger')), 'Svih 5 velikih tipki je sada malo');
  process.exit(0);
})().catch(e => { console.error('TEST ERROR', e); process.exit(1); });
