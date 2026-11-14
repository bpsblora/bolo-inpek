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
const BACKEND_FILES=[
  {source:'backend/tindak-lanjut/TindakLanjut_KelolaPetugas.gs',
   base:'TindakLanjut_KelolaPetugas',functions:['apiDaftarPetugasAdmin','apiSimpanPetugasAdmin']},
  {source:'backend/tindak-lanjut/TindakLanjut_SinkronMonitoring.gs',
   base:'TindakLanjut_SinkronMonitoring',functions:['apiSinkronMonitoring','apiPratinjauSinkronMonitoring']}
];

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
  // Loader Apps Script menjalankan HTML sebagai HtmlOutput, BUKAN template
  // remote. Placeholder hanya boleh 3 variabel ini agar UI selalu kompatibel.
  const allowed=['<?= modeAwal ?>','<?= surveiAwal ?>','<?= periodeAwal ?>'];
  const opening=(source.match(/<\?/g)||[]).length;
  const closing=(source.match(/\?>/g)||[]).length;
  const tokens=source.match(/<\?[\s\S]*?\?>/g)||[];
  if(opening!==3 || closing!==3 || tokens.length!==3 ||
     tokens.some(token=>!allowed.includes(token)) ||
     allowed.some(token=>source.split(token).length!==2)){
    throw Error('Template HTML tidak sesuai dengan GitHub Loader (hanya 3 placeholder aman).');
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
function stageBackend({repoRoot,liveDir}) {
  const changedFiles=[],createdFiles=[];
  for(const item of BACKEND_FILES){
    const source=readFileSync(resolve(repoRoot,item.source),'utf8');
    if(source.length<1000||source.length>200000)
      throw Error('Ukuran source backend tidak wajar: '+item.base);
    new Script(source,{filename:item.source});
    for(const fn of item.functions){
      if(!new RegExp('\\bfunction\\s+'+fn+'\\s*\\(').test(source))
        throw Error('Fungsi wajib backend hilang: '+fn);
    }
    const js=join(liveDir,item.base+'.js');
    const gs=join(liveDir,item.base+'.gs');
    if(existsSync(js)&&existsSync(gs))
      throw Error('Backend duplikat .js/.gs: '+item.base+'. Batalkan sinkronisasi.');
    const target=existsSync(js)?js:(existsSync(gs)?gs:js);
    const prior=existsSync(target)?readFileSync(target,'utf8'):null;
    if(prior===null)createdFiles.push(target);
    if(prior!==source){
      writeFileSync(target,source,'utf8');
      changedFiles.push(item.base);
    }
  }
  return {changedFiles,createdFiles};
}
export function stageSync({repoRoot,liveDir,includeBackend=false}) {
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
  const htmlChanged=before!==source;
  if(htmlChanged)writeFileSync(join(liveDir,APPS_FILE),source,'utf8');

  // Backend hanya diperbarui saat pilihan MANUAL pada workflow_dispatch.
  // Push otomatis, bila diaktifkan kelak, selalu HTML-only.
  const extra=includeBackend?stageBackend({repoRoot,liveDir}):
    {changedFiles:[],createdFiles:[]};
  const after=readdirSync(liveDir);
  const added=new Set(extra.createdFiles.map(x=>x.split(/[\\/]/).at(-1)));
  const expected=new Set([...all,...added]);
  if(JSON.stringify([...expected].sort())!==JSON.stringify(after.sort()))
    throw Error('Ada perubahan file yang tidak tercakup dalam daftar izin.');
  return {
    changed:htmlChanged||extra.changedFiles.length>0,
    htmlChanged,backendChanged:extra.changedFiles,
    filesCreated:added.size,
    scriptCount:after.filter(x=>/\.(gs|js|html)$/.test(x)).length,
    deploymentId
  };
}
export function publishToActionsEnv(report,envFile){
  if(!envFile)return;
  appendFileSync(envFile,'TL_SYNC_CHANGED='+String(report.changed)+'\n');
  appendFileSync(envFile,'TL_DEPLOYMENT_ID='+report.deploymentId+'\n');
}
