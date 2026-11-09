import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../.github/workflows/build-updater.yml', import.meta.url), 'utf8');
const guide = readFileSync(new URL('../updater/PANDUAN_UPDATER.html', import.meta.url), 'utf8');
const example = readFileSync(new URL('../updater/CONTOH_ENV.txt', import.meta.url), 'utf8');

test('dashboard updater button opens accessible dialog and stable ZIP URL', () => {
  assert.match(index, /id="bolo-updater-trigger"/);
  assert.match(index, /id="bolo-updater-dialog" aria-labelledby="bolo-updater-title"/);
  assert.match(index, /dialog\.showModal\(\)/);
  assert.match(index, /dialog\.close\(\)/);
  assert.match(index, /releases\/download\/updater-v2-preview\/BOLO-INPEK-Updater-Windows\.zip/);
  assert.match(index, /VPN FortiClient/);
  assert.match(index, /Sinkronisasi produksi belum diaktifkan/);
});

test('public package includes EXE, guide, placeholder only; no internal script or real creds', () => {
  assert.match(workflow, /Assemble one safe ZIP for website download/);
  assert.match(workflow, /Copy-Item "dist\/BOLO-INPEK-Updater\.exe"/);
  assert.match(workflow, /Copy-Item "updater\/PANDUAN_UPDATER\.html"/);
  assert.match(workflow, /Copy-Item "updater\/CONTOH_ENV\.txt"/);
  assert.doesNotMatch(workflow, /Copy-Item .*ambil_data_monitoring_inpek_v2\.py/);
  assert.doesNotMatch(workflow, /Copy-Item .*credentials\.json/);
  assert.doesNotMatch(workflow, /Copy-Item .*\.env"/);
  assert.match(workflow, /tag_name: updater-v2-preview/);
  assert.match(guide, /Uji Login Google/);
  assert.match(guide, /Kebijakan|Keamanan|Keamanan berkas/);
  assert.match(example, /FASIH_USERNAME=/);
  assert.match(example, /FASIH_PASSWORD=/);
  assert.doesNotMatch(example, /FASIH_PASSWORD=\S+/);
});