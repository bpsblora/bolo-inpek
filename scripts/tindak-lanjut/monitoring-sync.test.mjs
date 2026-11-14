import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {Script} from 'node:vm';
const gs=readFileSync(join(process.cwd(),'backend/tindak-lanjut/TindakLanjut_SinkronMonitoring.gs'),'utf8');
new Script(gs);
const A=['survey_id','survey_period_id','assignment_id','survei','nama_assignment','status',
 'status_asli','ppl_id','ppl','pml_id','pml','waktu_data_monitoring'];
const S=['survey_id','survey_period_id','kode_survei','nama_survei','nama_periode',
 'tanggal_mulai','tanggal_selesai','waktu_data_monitoring'];
const T=['survey_id','survey_period_id','kode_survei','nama_survei','nama_periode',
 'tanggal_mulai','tanggal_selesai','status_operasional','waktu_ditutup','ditutup_oleh','catatan_penutupan'];
const uid='abc00000-0000-4000-8000-000000000001';
const pid='abc00000-0000-4000-8000-000000000002';
const id2='abc00000-0000-4000-8000-000000000003';
const period2='abc00000-0000-4000-8000-000000000004';
const uuid=(n)=>'abc00000-0000-4000-8000-'+String(n).padStart(12,'0');
function fixture(){
 const source={
   konfigurasi_survei:[['code','name','survey_id','survey_period_id','aktif'],
    ['STPIM','STPIM',uid,pid,'TRUE'],
    ['IMKTH','VIMK_TH26',id2,period2,'TRUE']],
   periode_survei:[['survei','survey_period_id','nama_periode'],
    ['STPIM',pid,'Periode 1'],['VIMK_TH26',period2,'PENDATAAN']],
   monitoring:[['survei','nama_assignment','status','ppl','pml','status_asli'],
    ['STPIM','Lama','APPROVED BY PENGAWAS','Sari','Budi','APPROVED BY Pengawas'],
    ['VIMK_TH26','Sampel 1','OPEN','Baru','Budi','OPEN']],
   assignment_identitas:[['survei','survey_period_id','assignment_id','nama_assignment','monitoring_row'],
    ['STPIM',pid,'id:'+uuid(1),'Lama','2'],
    ['VIMK_TH26',period2,'id:'+uuid(2),'Sampel 1','3']],
   info_update:[['parameter','nilai'],['data_terakhir_diambil','2026-11-14T17:56:21+07:00']]
 };
 const data={
   survei:[T,[uid,pid,'STPIM','STPIM','Periode 1','','','AKTIF']],
   sumber_survei:[S,[uid,pid,'STPIM','STPIM','Periode 1','','','','']],
   sumber_assignment:[A,[uid,pid,uuid(1),'STPIM','Lama','OPEN','OPEN','fasih-sari','Sari','fasih-budi','Budi','old']],
   petugas:[['petugas_id','nama','email','nomor_whatsapp','aktif'],
    ['fasih-sari','Sari','','6281234567890','TRUE'],
    ['fasih-budi','Budi','','6281234567891','TRUE']],
   sumber_petugas:[['petugas_id','nama','email','waktu_data_monitoring'],
    ['fasih-sari','Sari','',''],['fasih-budi','Budi','','']],
   kontak:[['kontak_id','isi_pesan'],['old-contact','Jangan diubah']],
   tindak_lanjut:[['riwayat_id','catatan_konfirmasi'],['old-note','Jangan diubah']],
   arsip:[['arsip_id'],['old-archive']]
 };
 const copies=[],props=new Map();
 const src={getSheetByName:name=>source[name]?{getDataRange:()=>({getDisplayValues:()=>source[name]})}:null};
 function sheet(name){
  if(!data[name])return null;
  const arr=data[name];
  return {
   getDataRange:()=>({getDisplayValues:()=>arr}),
   getLastRow:()=>arr.length,
   getMaxRows:()=>1000,
   getRange:(row,col,n=1,width=1)=>({
     getDisplayValues:()=>Array.from({length:n},(_,i)=>Array.from({length:width},(_,j)=>arr[row-1+i]?.[col-1+j]??'')),
     clearContent:()=>{for(let i=row-1;i<Math.min(row-1+n,arr.length);i++)
       for(let j=col-1;j<col-1+width;j++)arr[i][j]='';},
     setNumberFormat(){return this;},
     setValues:(rows)=>{rows.forEach((v,i)=>{arr[row-1+i]=[...v]})}
   }),
   copyTo:()=>({setName:name=>copies.push(name),hideSheet(){}}),
   insertRowsAfter:()=>{}
  }
 }
 const db={getSheetByName:sheet};
 const mockUtils={
  DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'UTF_8'},
  computeDigest:(_,input)=>{
   let hash=2166136261>>>0;
   for(const c of input)hash=Math.imul(hash^c.charCodeAt(0),16777619)>>>0;
   return Array.from({length:32},(_,i)=>(hash>>>((i%4)*8))&255);
  },
  formatDate:()=> '20261115-000000',
  getUuid:()=> 'abcdef000000'
 };
 const read=(book,name)=>{const h=data[name][0];return data[name].slice(1)
  .filter(r=>r.some(Boolean)).map((r,i)=>Object.assign({_row:i+2},
    Object.fromEntries(h.map((key,j)=>[key,r[j]??'']))));};
 const append=(book,name,objs)=>{for(const obj of objs)data[name].push(data[name][0].map(key=>obj[key]??''))};
 const patch=(book,name,row,updates)=>{for(const [key,val] of Object.entries(updates)){
  const col=data[name][0].indexOf(key);if(col<0)throw Error('No field '+key);data[name][row-1][col]=val;
 }};
 const api=new Function('SpreadsheetApp','Utilities','PropertiesService','db_','read_','session_','lock_','safe_','append_','patch_',gs+
  ';return {preview:apiPratinjauSinkronMonitoring,run:apiSinkronMonitoring,build:tlMonBuild_};')(
  {openById:id=>{if(id!=='1bgCF8RSkltsd3jpL-naTEgWEIMw5y2rw8EzYRagCGNo')throw Error('Untrusted spreadsheet');return src},flush(){}},
  mockUtils,{getScriptProperties:()=>({getProperty:key=>props.get(key),setProperty:(key,val)=>props.set(key,val)})},
  ()=>db,read,(token,admin)=>{if(token!=='admin'||!admin)throw Error('Non-Admin rejected');return {peran:'ADMIN'}},
  fn=>fn(),v=>String(v??''),append,patch
 );
 return {api,data,source,copies,props};
}
test('IMK Tahunan appears and unknown PPL candidate is flagged without fake FASIH ID',()=>{
 const f=fixture(),before=f.api.preview('admin');
 assert.equal(before.survei_aktif,2);
 assert.deepEqual(before.survei_baru,['VIMK_TH26']);
 assert.equal(before.assignment,2);
 assert.equal(before.calon_petugas,1);
 const report=f.api.run('admin');
 assert.equal(report.success,true);assert.equal(report.berubah,true);
 assert.equal(f.data.survei.length,3);
 assert.equal(f.data.sumber_assignment.length,3);
 assert.equal(f.data.sumber_assignment[2][3],'VIMK_TH26');
 assert.match(f.data.sumber_assignment[2][7],/^monitor:[0-9a-f]{32}$/);
 assert.equal(f.data.sumber_assignment[2][9],'fasih-budi');
 assert.equal(f.data.sumber_assignment[1][7],'fasih-sari','Verified matching ID is reused for existing staff');
 assert.equal(f.data.petugas.length,3);
 assert.equal(f.data.kontak[1][1],'Jangan diubah');
 assert.equal(f.data.tindak_lanjut[1][1],'Jangan diubah');
 assert.equal(f.data.arsip[1][0],'old-archive');
 assert.equal(f.copies.length,2);
 const again=f.api.run('admin');
 assert.equal(again.berubah,false);
 assert.equal(f.data.sumber_assignment.length,3);
 assert.equal(f.copies.length,2,'No redundant backups on unchanged data');
});
test('inconsistent monitoring identity blocks all writes and keeps histories',()=>{
 const f=fixture();f.source.assignment_identitas[2][3]='Wrong';
 assert.throws(()=>f.api.run('admin'),/tidak cocok/);
 assert.equal(f.copies.length,0);
 assert.equal(f.data.survei.length,2);
 assert.equal(f.data.tindak_lanjut[1][1],'Jangan diubah');
});
test('existing closed survey cannot be reopened by synchronization',()=>{
 const f=fixture();
 f.data.survei[1][7]='DITUTUP';
 const res=f.api.run('admin');
 assert.equal(res.success,true);
 assert.equal(f.data.survei[1][7],'DITUTUP');
});
test('only Admin can synchronize and malformed source data are rejected',()=>{
 const f=fixture();
 assert.throws(()=>f.api.run('operator'),/Non-Admin/);
 f.source.assignment_identitas.push([...f.source.assignment_identitas[2]]);
 assert.throws(()=>f.api.run('admin'),/tidak valid\/ganda/);
});

test('same name but conflicting FASIH ID requires confirmation, not auto-link',()=>{
 const f=fixture();
 f.data.sumber_petugas.push(['external-wrong-sari','Sari','','']);
 const res=f.api.run('admin');
 assert.equal(res.success,true);
 const alias=f.data.sumber_assignment[1][7];
 assert.match(alias,/^monitor:[a-f0-9]{32}$/);
 assert.equal(res.calon_petugas,2,'Conflicted Sari and new Baru require verification');
 // Admin-confirmed mapping survives the next survey refresh.
 f.data.padanan_petugas=[
   ['alias_monitoring','petugas_id','nama_monitoring','waktu_taut','ditautkan_oleh'],
   [alias,'fasih-sari','Sari','2026-11-15T00:00:00Z','admin@bps.go.id']
 ];
 assert.equal(f.api.run('admin').success,true);
 assert.equal(f.data.sumber_assignment[1][7],'fasih-sari');
});
test('same-name collision among registered profiles is not automatically merged',()=>{
 const f=fixture();
 f.data.petugas.push(['fasih-sari-2','Sari','','628111112223','TRUE']);
 const res=f.api.run('admin');
 assert.equal(res.success,true);
 const alias=f.data.sumber_assignment[1][7];
 assert.match(alias,/^monitor:[a-f0-9]{32}$/);
 assert.equal(res.calon_petugas,2,'Both Sari and Baru are unverified aliases');
 // Admin mapping explicitly chooses one of two registered Sari identities.
 f.data.padanan_petugas=[
  ['alias_monitoring','petugas_id','nama_monitoring','waktu_taut','ditautkan_oleh'],
  [alias,'fasih-sari','Sari','2026-11-15T00:00:00Z','admin@bps.go.id']
 ];
 const next=f.api.run('admin');
 assert.equal(next.success,true);
 assert.equal(next.berubah,true);
 assert.equal(f.data.sumber_assignment[1][7],'fasih-sari');
 assert.equal(next.calon_petugas,1,'Manually linked Sari no longer appears as a new person');
 assert.equal(f.data.kontak[1][1],'Jangan diubah');
 assert.equal(f.data.tindak_lanjut[1][1],'Jangan diubah');
});
