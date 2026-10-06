// Pokreće sve *.test.js datoteke i zbraja rezultate. Izlazni kod 1 ako išta padne.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).sort();
let pass = 0, fail = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8', cwd: __dirname, timeout: 180000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const p = (out.match(/^PASS/gm) || []).length;
  const bad = out.split('\n').filter(l => /^(FAIL|TIMEOUT|TEST ERROR)/.test(l));
  const crashed = r.status !== 0 && !bad.length;
  pass += p; fail += bad.length + (crashed ? 1 : 0);
  console.log(`${bad.length || crashed ? '✗' : '✓'} ${f}: ${p} prošlo${bad.length ? `, ${bad.length} palo` : ''}${crashed ? ' (test se srušio)' : ''}`);
  bad.forEach(l => console.log('    ' + l));
}
console.log(`\nUKUPNO: ${pass} prošlo, ${fail} palo`);
process.exit(fail ? 1 : 0);
