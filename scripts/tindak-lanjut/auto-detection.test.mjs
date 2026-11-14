import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {Script} from 'node:vm';
const file=readFileSync(join(process.cwd(),'backend/tindak-lanjut/TindakLanjut_DeteksiOtomatis.gs'),'utf8');
new Script(file);
function fixture() {
 const triggers=[],props=new Map(),counts={calls:0,changed:true,candidates:1,fail:false};
 const scriptApp={
  EventType:{CLOCK:'CLOCK'},
  getProjectTriggers:()=>triggers,
  newTrigger:handler=>({
   timeBased:()=>({
    everyMinutes:n=>({create:()=>triggers.push({
      getHandlerFunction:()=>handler,getEventType:()=>scriptApp.EventType.CLOCK,minutes:n
    })})
   })
  }),
  deleteTrigger:obj=>{const i=triggers.indexOf(obj);if(i>=0)triggers.splice(i,1)}
 };
 const patch={getProperty:k=>props.get(k)||'',setProperties:(value)=>{for(const [key,v] of Object.entries(value))props.set(key,String(v))}};
 const fakeConsole={error:()=>{}};
 const api=new Function('ScriptApp','PropertiesService','session_','lock_','tlMonSyncInternal_','console',file+
  ';return {install:tlAutoEnsure_,run:tlAutoScan_,status:tlAutoStatus_,'+
  'get:apiStatusDeteksiOtomatis,activate:apiAktifkanDeteksiOtomatis,disable:apiNonaktifkanDeteksiOtomatis};')(
    scriptApp,{getScriptProperties:()=>patch},
    (token,isAdmin)=>{if(token!=='ADMIN'||!isAdmin)throw Error('Hanya ADMIN');},
    fn=>fn(),
    ()=>{counts.calls++;if(counts.fail)throw Error('Sumber FASIH belum siap');
      return {survei_aktif:5,assignment:150,calon_petugas:counts.candidates,
        waktu_monitoring:'2026-11-15T09:00:00+07:00',berubah:counts.changed};},
    fakeConsole
  );
 return {api,triggers,props,counts};
}
test('detector creates one one-minute time-driven trigger, never duplicates',()=>{
 const f=fixture();
 assert.equal(f.api.activate('ADMIN').aktif,true);
 assert.equal(f.triggers.length,1);
 assert.equal(f.triggers[0].minutes,1);
 assert.equal(f.triggers[0].getHandlerFunction(),'tlAutoScan_');
 assert.equal(f.api.activate('ADMIN').aktif,true);
 assert.equal(f.triggers.length,1);
 assert.throws(()=>f.api.activate('OPERATOR'),/ADMIN/);
 assert.equal(f.triggers.length,1);
});
test('background scan detects any active survey changes without dashboard login',()=>{
 const f=fixture();
 f.api.install();
 assert.equal(f.api.run().success,true);
 assert.equal(f.api.status().ringkasan.petugas_perlu_didaftarkan,1);
 assert.ok(f.api.status().sinkronisasi_terakhir);
 f.counts.candidates=4;
 f.counts.changed=true;
 assert.equal(f.api.run().success,true);
 assert.equal(f.api.status().ringkasan.petugas_perlu_didaftarkan,4);
 assert.equal(f.counts.calls,2);
 const prior=f.api.status().sinkronisasi_terakhir;
 f.counts.changed=false;
 assert.equal(f.api.run().berubah,false);
 assert.equal(f.api.status().sinkronisasi_terakhir,prior);
});
test('failed monitoring update records reason but preserves last good summary',()=>{
 const f=fixture();f.api.install();f.api.run();f.counts.fail=true;
 assert.equal(f.api.run().success,false);
 assert.match(f.api.status().pesan_gagal,/belum siap/);
 assert.equal(f.api.status().pemeriksaan_berhasil,false);
 assert.equal(f.api.status().ringkasan.petugas_perlu_didaftarkan,1);
 f.counts.fail=false;f.counts.candidates=2;
 assert.equal(f.api.run().success,true);
 assert.equal(f.api.status().pemeriksaan_berhasil,true);
 assert.equal(f.api.status().pesan_gagal,'');
});
test('ADMIN may stop and restore periodic detection, ordinary operator may not',()=>{
 const f=fixture();f.api.activate('ADMIN');
 assert.throws(()=>f.api.disable('OPERATOR'),/ADMIN/);
 assert.equal(f.triggers.length,1);
 assert.equal(f.api.disable('ADMIN').aktif,false);
 assert.equal(f.triggers.length,0);
 assert.equal(f.api.activate('ADMIN').aktif,true);
});
