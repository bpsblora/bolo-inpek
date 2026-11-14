import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateHtml,deploymentIdFromIndex,stageSync} from './sync-core.mjs';
const valid='<div id="tlConfirmDialog"></div><div><?= modeAwal ?> <?= surveiAwal ?> <?= periodeAwal ?></div>'+
  '<script>function tlConfirm(){return true};const a="apiBukaKembali apiTutup";</script>';
const index='const TINDAK_LANJUT_URL = "https://script.google.com/macros/s/'+
  'A'.repeat(40)+'/exec";';
function fixture({backend=true,html=true,manifest=true}={}){
  const d=mkdtempSync(join(tmpdir(),'bolo-tl-test-'));
  const repoRoot=join(d,'repo'),liveDir=join(d,'live');
  mkdirSync(join(repoRoot,'backend','tindak-lanjut'),{recursive:true});
  mkdirSync(liveDir);
  writeFileSync(join(repoRoot,'index.html'),index);
  writeFileSync(join(repoRoot,'backend','tindak-lanjut','Index_TindakLanjutV2.html'),valid);
  if(backend)writeFileSync(join(liveDir,'KodeV2.js'),'const tpl="Index_TindakLanjutV2";\nconst privateKey="retained";');
  if(html)writeFileSync(join(liveDir,'Index_TindakLanjutV2.html'),'<p>Old</p>');
  if(manifest)writeFileSync(join(liveDir,'appsscript.json'),'{"timeZone":"Asia/Jakarta"}');
  writeFileSync(join(liveDir,'TindakLanjut_AuditIntegritas.js'),'function stay(){}');
  return {repoRoot,liveDir,done:()=>rmSync(d,{recursive:true,force:true})};
}
test('safe replacement preserves all remote backend files and manifest',()=>{
  const f=fixture();try{
    const listBefore=readdirSync(f.liveDir).sort(),code=readFileSync(join(f.liveDir,'KodeV2.js'),'utf8');
    const result=stageSync(f);
    assert.equal(result.changed,true);
    assert.equal(readFileSync(join(f.liveDir,'Index_TindakLanjutV2.html'),'utf8'),valid);
    assert.equal(readFileSync(join(f.liveDir,'KodeV2.js'),'utf8'),code);
    assert.deepEqual(readdirSync(f.liveDir).sort(),listBefore);
    assert.match(result.deploymentId,/^A{40}$/);
    assert.equal(stageSync(f).changed,false);
  }finally{f.done()}
});
test('refuses wrong or incomplete remote Apps Script project',()=>{
 for(const options of [{backend:false},{html:false},{manifest:false}]){
  const f=fixture(options);try{assert.throws(()=>stageSync(f),/tidak ditemukan/)}finally{f.done()}
 }
});
test('rejects native dialogs and invalid script',()=>{
 assert.equal(validateHtml(valid),1);
 assert.throws(()=>validateHtml(valid+'<script>window.confirm("x")</script>'),/dialog browser/i);
 assert.throws(()=>validateHtml(valid+'<script>function {</script>'),SyntaxError);
 assert.throws(
   ()=>validateHtml(valid.replace('<?= modeAwal ?>','<? SpreadsheetApp.openById("x") ?>')),
   /Template HTML|Komponen penting/
 );
});
test('requires exactly one deployed existing web app URL',()=>{
 assert.throws(()=>deploymentIdFromIndex('const x=1'),/tidak ditemukan/);
 assert.throws(()=>deploymentIdFromIndex(index+index),/ganda/);
});
