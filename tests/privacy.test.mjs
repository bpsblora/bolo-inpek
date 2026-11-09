import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const privacy = readFileSync(new URL('../kebijakan-privasi.html', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('public privacy page is readable in Indonesian without login', () => {
  assert.match(privacy, /<html lang="id">/);
  assert.match(privacy, /<title>Kebijakan Privasi — BOLO INPEK/);
  assert.match(privacy, /<h1>Kebijakan Privasi BOLO INPEK<\/h1>/);
  assert.match(privacy, /<meta name="viewport"/);
  assert.match(privacy, /<a class="crumb" href="\.\/">/);
  assert.doesNotMatch(privacy, /<script/i);
});

test('privacy policy discloses OAuth, stored data and contact', () => {
  for (const term of [
    'Google Sign-In', 'Google Sheets', 'Firebase Authentication',
    'Cloud Firestore', 'FASIH', 'GitHub Pages', 'Hak akses',
    'Penyimpanan', 'Permintaan', 'bpsblora@gmail.com',
    'https://www.googleapis.com/auth/spreadsheets'
  ]) assert.ok(privacy.toLowerCase().includes(term.toLowerCase()), 'Missing ' + term);
  assert.ok(!privacy.includes('AIzaSy'), 'No Firebase keys in policy');
  assert.ok(!privacy.includes('apps.googleusercontent.com'), 'No OAuth client details in policy');
});

test('dashboard links to policy with a relative GitHub Pages path', () => {
  assert.match(index, /href="\.\/kebijakan-privasi\.html">Kebijakan Privasi<\/a>/);
});
