import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {validateHtml,stageSync,publishToActionsEnv} from './sync-core.mjs';

const root=process.env.GITHUB_WORKSPACE||process.cwd();
const command=process.argv[2]||'check';
if(command==='check'){
  const count=validateHtml(readFileSync(resolve(root,'backend/tindak-lanjut/Index_TindakLanjutV2.html'),'utf8'));
  console.log('✓ HTML Tindak Lanjut valid. Skrip internal diperiksa: '+count);
}else if(command==='stage'){
  const liveDir=process.env.TL_WORK_DIR;
  if(!liveDir)throw Error('TL_WORK_DIR belum ditentukan.');
  const includeBackend=process.env.TL_SYNC_BACKEND==='true';
  const report=stageSync({repoRoot:root,liveDir,includeBackend});
  publishToActionsEnv(report,process.env.GITHUB_ENV);
  console.log('✓ Pull proyek aktif lengkap; hanya HTML Tindak Lanjut disiapkan.');
  console.log('✓ File sumber lain dipertahankan. Total file skrip/HTML: '+report.scriptCount);
  if(includeBackend)console.log('✓ Modul backend terpilih: '+(report.backendChanged.join(', ')||'tidak berubah'));
  console.log(report.changed?'Perubahan siap ditinjau/publikasi.':'Tidak ada perubahan untuk dipublikasikan.');
}else{
  throw Error('Perintah tidak dikenal. Gunakan check atau stage.');
}
