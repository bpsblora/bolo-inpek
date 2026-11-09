import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

test('Firestore rules have one complete closing block and no duplicate match rules', () => {
  const names = ['surveys', 'scraper_configs', 'employees', 'system_config', 'operators', 'admins'];
  for (const name of names) {
    assert.equal((rules.match(new RegExp('match /' + name + '/\\{', 'g')) || []).length, 1,
      'expected one match rule for ' + name);
  }
  assert.equal((rules.match(/match \/\{document=\*\*\}/g) || []).length, 1);

  const stripped = rules.replace(/\/\/[^\n]*/g, '');
  for (const [open, close] of [['{', '}'], ['(', ')'], ['[', ']']]) {
    assert.equal([...stripped].filter(c => c === open).length,
      [...stripped].filter(c => c === close).length,
      'unbalanced ' + open + close);
  }
  assert.match(stripped.trimEnd(), /\n  \}\n\}$/);
});

test('Spreadsheet destination ID validations are complete and private', () => {
  for (const field of ['monitoring_id', 'tindak_lanjut_id']) {
    assert.ok(rules.includes(
      "request.resource.data." + field +
      ".matches('^[A-Za-z0-9_-]{20,150}$')"
    ), 'complete and anchored validation missing for ' + field);
  }
  assert.match(rules, /match \/system_config\/\{configId\}/);
  assert.match(rules, /allow get: if configId == 'sheets' && canUpdateFasih\(\);/);
  assert.match(rules, /allow create, update: if configId == 'sheets'\s*&& isAdmin\(\) && validSheetTargets\(\);/);
  assert.match(rules, /allow list: if false;/);
  assert.match(rules, /allow delete: if false;/);
});
