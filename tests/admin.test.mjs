import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const admin = readFileSync(new URL('../admin.js', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
if (!script) throw new Error('Dashboard inline script not found');

function extractFunction(src, name) {
  const from = src.indexOf('function ' + name + '(');
  if (from < 0) throw new Error(name + ' not found');
  const firstBrace = src.indexOf('{', from);
  let depth = 0;
  for (let i = firstBrace; i < src.length; i++) {
    if (src[i] === '{') depth++;
    if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(from, i + 1);
    }
  }
  throw new Error(name + ' has unbalanced braces');
}

test('scripts preserve valid JavaScript syntax', () => {
  assert.doesNotThrow(() => new Function(admin));
  assert.doesNotThrow(() => new Function(script));
  assert.match(html, /src="\.\/admin\.js"/);
  assert.match(html, /href="\.\/admin\.css"/);
});

test('new survey names are allowed, invalid status and count are not', () => {
  const validate = new Function('STATUS',
    extractFunction(script, 'validatePayload') + ';return validatePayload;')(
    ['OPEN', 'SUBMIT', 'REJECT', 'APPROVE', 'COMPLETE'].map(code => ({code}))
  );
  const row = {
    survei: 'IMK TRIWULAN IV 2026', nama_assignment: 'Assignment baru',
    status: 'OPEN', ppl: 'Petugas', pml: 'Pengawas'
  };
  const payload = {success: true, total_assignment: 1, data: [row]};
  assert.equal(validate(payload)[0].survei, row.survei);
  assert.throws(() => validate({...payload, data: [{...row, status:'BOGUS'}]}));
  assert.throws(() => validate({...payload, total_assignment: 2}));
});

test('active survey registry merges FASIH data with admin choices', () => {
  const fn = new Function('RAW_DATA', 'PERIODE_SURVEI', 'adminRegistry', 'SURVEYS',
    extractFunction(script, 'hitungDaftarSurvei') +
    ';hitungDaftarSurvei();return SURVEYS;');
  const list = fn([{survei:'STPIM'}], [{survei:'SKTH'}], [
    {name:'STPIM', active:false}, {name:'IMK 2027', active:true}
  ], ['FALLBACK']);
  assert.deepEqual(list, ['SKTH', 'IMK 2027']);
});

test('admin preview persists surveys and employees without a cloud backend', async () => {
  const records = new Map();
  const localStorage = {
    getItem(k) { return records.get(k) || null; },
    setItem(k, v) { records.set(k, v); }
  };
  const fired = [];
  const window = {
    BOLO_FIREBASE_CONFIG:null,
    addEventListener() {},
    dispatchEvent(e) { fired.push(e.detail); }
  };
  const document = {
    readyState:'loading',
    addEventListener() {},
    querySelector() { return null; }
  };
  const CustomEvent = class {
    constructor(name, opts) { this.type = name; this.detail = opts.detail; }
  };
  const inject = admin.replace('  function start() {',
    '  window.__test = {state, allSurveys, persist, importUpdaterConfig};\n  function start() {');
  assert.notEqual(inject, admin, 'Preview test hook not installed');
  new Function('window','document','localStorage','CustomEvent', inject)(
    window, document, localStorage, CustomEvent
  );
  window.BoloAdmin.setMonitoringData({
    surveys:[{name:'IMK 2027', startDate:'2027-01-01', endDate:'2027-03-31'}],
    employees:[]
  });
  assert.ok(window.__test.allSurveys().some(s => s.name === 'IMK 2027'));
  await window.__test.persist('surveys', {
    id:'survey-imk-2027', name:'IMK 2027', startDate:'2027-01-01',
    endDate:'2027-03-31', active:false
  });
  assert.equal(fired.at(-1).surveys.find(s => s.name === 'IMK 2027').active, false);
  await window.__test.persist('employees', {
    id:'staff-01', name:'Petugas Uji', email:'', phone:'', role:'PPL', active:true
  });
  await window.__test.persist('scraper_configs', {
    id:'survey-imk-2027', name:'IMK 2027', code:'IMK',
    survey_id:'internal-survey-id', survey_period_id:'internal-period-id',
    role_pencacah_id:'ppl-id', role_pengawas_id:'pml-id',
    nama_assignment_field:'data3'
  });
  const registry = fired.at(-1).surveys.find(s => s.name === 'IMK 2027');
  assert.equal(registry.survey_id, undefined, 'Internal FASIH IDs must not be broadcast');
  const saved = JSON.parse(records.get('bolo-inpek-admin-preview-v2'));
  assert.equal(saved.scraperConfigs[0].survey_period_id, 'internal-period-id');
  await window.__test.importUpdaterConfig({
    size: 1200,
    text: async () => JSON.stringify({surveys: [{
      code:'TEST', name:'TEST NEW SURVEY', survey_id:'q123', survey_period_id:'period',
      role_pencacah_id:'r1', role_pengawas_id:'r2', nama_assignment_field:'data3'
    }]})
  });
  const reloaded = JSON.parse(records.get('bolo-inpek-admin-preview-v2'));
  assert.equal(reloaded.scraperConfigs.find(c => c.name === 'TEST NEW SURVEY').survey_id, 'q123');
  assert.equal(reloaded.surveys.find(c => c.name === 'TEST NEW SURVEY').survey_id, undefined);
  assert.equal(saved.surveys.length, 1);
  assert.equal(saved.employees[0].name, 'Petugas Uji');
});
