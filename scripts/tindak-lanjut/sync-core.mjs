/**
 * BOLO INPEK — sinkronisasi aman satu file HTML ke proyek Apps Script aktif.
 *
 * Jangan jalankan clasp push pada checkout GitHub: backend utama tidak berada
 * dalam repo publik. Pull proyek lengkap ke direktori temporer lebih dulu.
 */
import {readFileSync,writeFileSync,existsSync,readdirSync,appendFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {Script} from 'node:vm';

const HTML_PATH='backend/tindak-lanjut/Index_TindakLanjutV2.html';
const APPS_FILE='Index_TindakLanjutV2.html';

export function validateHtml(source) {
  const scripts=[...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
  if (!scripts.length) throw Error('HTML Tindak Lanjut tidak memiliki skrip aplikasi.');
  for(const [,code] of scripts) new Script(code,{filename:APPS_FILE});
  for(const marker of ['id="tlConfirmDialog"','function tlConfirm(','apiBukaKembali','apiTutup',
                       '<?= modeAwal ?>','<?= surveiAwal ?>','<?= periodeAwal ?>']) {
    if(!source.includes(marker)) throw Error('Komponen penting HTML tidak ditemukan: '+marker);
  }
  if (/\b(?:window\.)?(?:confirm|prompt|alert)\s*\(/.test(source)) {
    throw Error('Dialog browser native terdeteksi; gunakan dialog BOLO INPEK.');
  }
  return scripts.length;
}
export function deploymentIdFromIndex(indexHtml) {
  const matches=[...indexHtml.matchAll(/const\s+TINDAK_LANJUT_URL\s*=\s*["']https:\/\/script\.google\.com\/macros\/s\/([A-Za-z0-9_-]+)\/exec["']/g)];
  if(matches.length!==1)throw Error('URL Tindak Lanjut pada index.html tidak ditemukan atau ganda.');
  const value=matches[0][1];
  if(value.length<25)throw Error('Deployment ID tidak valid.');
  return value;
}
export function stageSync({repoRoot,liveDir}) {
  if(!liveDir||!repoRoot)throw Error('Direktori kerja tidak lengkap.');
  const source=readFileSync(resolve(repoRoot,HTML_PATH),'utf8');
  validateHtml(source);
  const index=readFileSync(resolve(repoRoot,'index.html'),'utf8');
  const deploymentId=deploymentIdFromIndex(index);
  const required=[APPS_FILE,'appsscript.json'];
  for(const name of required){
    if(!existsSync(join(liveDir,name)))throw Error('File proyek aktif tidak ditemukan: '+name+
      '. BATAL: jangan membuat file baru dan jangan menjalankan push.');
  }
  const all=readdirSync(liveDir);
  const backend=all.find(x=>/^KodeV2\.(?:gs|js)$/.test(x));
  if(!backend)throw Error('KodeV2 tidak ditemukan dalam hasil pull. BATAL: proyek salah/tidak lengkap.');
  const script=readFileSync(join(liveDir,backend),'utf8');
  if(!script.includes("Index_TindakLanjutV2"))throw Error('Backend aktif bukan Tindak Lanjut versi yang diharapkan.');
  JSON.parse(readFileSync(join(liveDir,'appsscript.json'),'utf8'));

  const before=readFileSync(join(liveDir,APPS_FILE),'utf8');
  const changed=before!==source;
  if(changed)writeFileSync(join(liveDir,APPS_FILE),source,'utf8');

  // Hanya satu HTML diganti. Source .gs, manifest, dan file lainnya tetap hasil pull.
  const after=readdirSync(liveDir);
  if(JSON.stringify(all.sort())!==JSON.stringify(after.sort()))
    throw Error('Jumlah/daftar file proyek berubah; batalkan push.');
  return {changed,scriptCount:after.filter(x=>/\.(gs|js|html)$/.test(x)).length,deploymentId};
}
export function publishToActionsEnv(report,envFile){
  if(!envFile)return;
  appendFileSync(envFile,'TL_SYNC_CHANGED='+String(report.changed)+'\n');
  appendFileSync(envFile,'TL_DEPLOYMENT_ID='+report.deploymentId+'\n');
}
