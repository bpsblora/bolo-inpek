import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {Script} from 'node:vm';
const root=process.cwd();
const gs=readFileSync(join(root,'backend/tindak-lanjut/TindakLanjut_KelolaPetugas.gs'),'utf8');
const html=readFileSync(join(root,'backend/tindak-lanjut/Index_TindakLanjutV2.html'),'utf8');
const page=readFileSync(join(root,'index.html'),'utf8');
new Script(gs);
function fixture(){
  const tab={
    petugas:[{_row:2,petugas_id:'id-fasih-000000001',nama:'Andi',email:'andi@bps.go.id',nomor_whatsapp:'6281234567890',aktif:'TRUE'}],
    sumber_petugas:[{petugas_id:'id-fasih-000000001',nama:'Andi FASIH',email:'andi@bps.go.id'},
      {petugas_id:'id-fasih-000000002',nama:'Budi',email:'budi@bps.go.id'}],
    survei:[
      {survey_period_id:'periode-UTAMA',status_operasional:'AKTIF'},
      {survey_period_id:'periode-SKTH',status_operasional:'AKTIF'},
      {survey_period_id:'periode-STPIM',status_operasional:'AKTIF'},
      {survey_period_id:'periode-IMK',status_operasional:'AKTIF'},
      {survey_period_id:'periode-ARSIP',status_operasional:'DITUTUP'}
    ],
    sumber_assignment:[{ppl_id:'id-fasih-000000001',pml_id:'id-fasih-000000002',
      survey_period_id:'periode-UTAMA',survei:'STPIM'}],
    tindak_lanjut:[{petugas_id:'id-fasih-000000001',catatan:'Tetap tersimpan'}],
    kontak:[{petugas_id:'id-fasih-000000001',isi_pesan:'Tetap tersimpan'}]
  };
  const api=new Function('db_','read_','append_','patch_','lock_','session_','text_','uid_','tlMonAlias_','SpreadsheetApp',gs+
    ';return {list:apiDaftarPetugasAdmin,save:apiSimpanPetugasAdmin,link:apiTautkanPetugasAdmin,phone:tlPetugasNormalisasiNomor_};')(
    ()=>tab,(db,name)=>db[name].map(r=>({...r})),
    (db,name,rows)=>rows.forEach(r=>db[name].push({...r,_row:db[name].length+2})),
    (db,name,row,values)=>Object.assign(db[name].find(x=>x._row===row),values),
    fn=>fn(),
    (token,admin)=>{if(token!=='admin'||!admin)throw Error('not authorized');return {nama:'Admin'};},
    s=>String(s??'').trim(),()=>('generated-uuid-'+Date.now()),
    name=>'monitor:'+'a'.repeat(32),{flush(){}}
  );
  return {tab,api};
}
test('existing staff editable without changing assignments, history or contacts',()=>{
 const f=fixture(),before=f.api.list('admin');
 assert.equal(before.total,1);assert.equal(before.kandidat_fasih.length,1);
 assert.equal(before.kandidat_fasih[0].jumlah_assignment,1);
 const p=before.petugas[0];
 const result=f.api.save('admin',{mode:'edit',petugas_id:p.petugas_id,
   nama:'Andi Terbaru',email:p.email,nomor_whatsapp:'081299988877',aktif:true,expected:p});
 assert.equal(result.success,true);
 assert.equal(f.tab.petugas[0].petugas_id,p.petugas_id);
 assert.equal(f.tab.petugas[0].nomor_whatsapp,'6281299988877');
 assert.equal(f.tab.tindak_lanjut[0].catatan,'Tetap tersimpan');
 assert.equal(f.tab.kontak[0].isi_pesan,'Tetap tersimpan');
 assert.throws(()=>f.api.save('admin',{mode:'edit',petugas_id:p.petugas_id,
   nama:'Andi Lama',email:p.email,nomor_whatsapp:p.nomor_whatsapp,aktif:true,expected:p}),/sesi lain/);
});
test('new staff reuse FASIH identity; active status can be toggled',()=>{
 const f=fixture(),result=f.api.save('admin',{mode:'tambah',petugas_id:'id-fasih-000000002',
   nama:'Budi',email:'budi@bps.go.id',nomor_whatsapp:'+62 812-3333-4444',
   aktif:true,dari_fasih:true});
 assert.equal(result.success,true);
 assert.equal(f.api.list('admin').kandidat_fasih.length,0);
 const p=f.api.list('admin').petugas.find(v=>v.petugas_id===result.petugas_id);
 assert.equal(p.jumlah_assignment,1);
 assert.equal(f.api.save('admin',{mode:'edit',petugas_id:p.petugas_id,nama:p.nama,
   email:p.email,nomor_whatsapp:p.nomor_whatsapp,aktif:false,expected:p}).aktif,false);
 assert.equal(f.api.list('admin').nonaktif,1);
 const old=f.api.list('admin').petugas.find(v=>v.petugas_id===p.petugas_id);
 f.api.save('admin',{mode:'edit',petugas_id:old.petugas_id,nama:old.nama,
   email:old.email,nomor_whatsapp:old.nomor_whatsapp,aktif:true,expected:old});
 assert.equal(f.api.list('admin').aktif,2);
});
test('ADMIN enforced and invalid WhatsApp/duplicates blocked',()=>{
 const f=fixture();
 assert.throws(()=>f.api.list('operator'),/authorized/);
 assert.throws(()=>f.api.save('operator',{mode:'tambah'}),/authorized/);
 assert.throws(()=>f.api.save('admin',{mode:'tambah',nama:'Cici',
   email:'cici@bps.go.id',aktif:true,nomor_whatsapp:'abc'}),/WhatsApp/);
 assert.throws(()=>f.api.save('admin',{mode:'tambah',nama:'Cici',
   email:'cici@bps.go.id',aktif:true,nomor_whatsapp:'081234567890'}),/sudah dipakai/);
});
test('HTML management and routed admin shortcut present',()=>{
 for(const id of ['staffPanel','staffRows','staffForm'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/apiDaftarPetugasAdmin/);assert.match(html,/apiSimpanPetugasAdmin/);
 assert.match(html,/BOLO_INPEK_ADMIN_SHOW_PETUGAS/);
 assert.match(page,/id="adminStaffMenu"/);assert.match(page,/verifiedTLWindow\.postMessage/);
 new Script(html.split('<script>')[1].split('</script>')[0]);
});

test('detects new personnel directly from assignment PPL/PML even without sumber_petugas',()=>{
 const f=fixture();
 // Petugas inactive is still registered and MUST NOT be flagged as new.
 f.tab.petugas[0].aktif='FALSE';
 const id='id-fasih-000000003';
 f.tab.sumber_assignment.push(
  {ppl_id:id,ppl:'Citra Baru',pml_id:'id-fasih-000000001',
   survei:'SKTH',survey_period_id:'periode-SKTH'},
  {ppl_id:'',ppl:'Tanpa ID',pml_id:id,pml:'Citra Baru',
   survei:'STPIM',survey_period_id:'periode-STPIM'}
 );
 const v=f.api.list('admin');
 assert.equal(v.nonaktif,1);
 assert.equal(v.kandidat_fasih.length,2);
 const c=v.kandidat_fasih.find(x=>x.petugas_id===id);
 assert.equal(c.nama,'Citra Baru');
 assert.equal(c.asal,'assignment');
 assert.equal(c.jumlah_assignment,2);
 assert.equal(c.daftar_survei.length,2);
 assert.equal(c.peran.length,2);
 assert.equal(v.kandidat_assignment,2);
 assert.equal(v.id_petugas_kosong.length,1);
 assert.equal(v.id_petugas_kosong[0].nama,'Tanpa ID');
 assert.equal(v.kandidat_fasih.some(x=>x.petugas_id==='id-fasih-000000001'),false);

 const added=f.api.save('admin',{
  mode:'tambah',petugas_id:id,nama:'Citra Baru',email:'',
  nomor_whatsapp:'081311112222',aktif:true,dari_fasih:true
 });
 assert.equal(added.petugas_id,id);
 assert.equal(f.api.list('admin').kandidat_fasih.length,1);
 assert.equal(f.tab.tindak_lanjut.length,1);
 assert.equal(f.tab.kontak.length,1);
});
test('cannot invent an FASIH candidate when ID is not in assignment or source',()=>{
 const f=fixture();
 assert.throws(()=>f.api.save('admin',{
  mode:'tambah',petugas_id:'id-fasih-000000999',nama:'Tidak Terdaftar',
  email:'',nomor_whatsapp:'081355559999',aktif:true,dari_fasih:true
 }),/ID kandidat/);
});
test('row status toggle and candidate registration are visible in staff UI',()=>{
 assert.match(html,/function staffToggle\(p\)/);
 assert.match(html,/function staffCandidatesPaint\(\)/);
 assert.match(html,/staffPrefillCandidate\(p\)/);
 assert.match(html,/id="staffDiscovery"/);
 assert.match(html,/id="staffMissingIdAlert"/);
 assert.match(html,/Nonaktifkan Petugas/);
 assert.match(html,/Aktifkan Petugas/);
 assert.match(html,/BOLO_INPEK_PETUGAS_PENDING/);
 assert.match(page,/id="adminStaffPending"/);
});

test('unverified monitoring alias cannot be registered for WhatsApp',()=>{
 const f=fixture(),alias='monitor:'+'a'.repeat(32);
 f.tab.sumber_assignment.push({ppl_id:alias,ppl:'Calon IMK',pml_id:'',
  survei:'VIMK_TH26',survey_period_id:'periode-IMK'});
 const request={mode:'tambah',petugas_id:alias,nama:'Calon IMK',email:'',
  nomor_whatsapp:'081355553333',aktif:true,dari_fasih:true};
 assert.throws(()=>f.api.save('admin',request),/Konfirmasi identitas/);
 assert.equal(f.tab.petugas.length,1);
 const result=f.api.save('admin',{...request,verifikasi_alias:true});
 assert.equal(result.success,true);
 assert.equal(f.tab.petugas.length,2);
});

test('ignores personnel only in archived and inactive survey assignments',()=>{
 const f=fixture();
 f.tab.survei.push({survey_period_id:'periode-NONAKTIF',status_operasional:'NONAKTIF'});
 f.tab.sumber_petugas.push({petugas_id:'id-never-assigned-999',nama:'Belum Ditugaskan',email:''});
 f.tab.sumber_assignment.push(
  {ppl_id:'id-arsip-1234567',ppl:'Petugas Arsip',pml_id:'',
   survei:'SURVEI-ARSIP',survey_period_id:'periode-ARSIP'},
  {ppl_id:'id-inactive-56789',ppl:'Petugas Nonaktif',pml_id:'',
   survei:'SURVEI-NONAKTIF',survey_period_id:'periode-NONAKTIF'}
 );
 const candidates=f.api.list('admin').kandidat_fasih;
 assert.equal(candidates.length,1);
 assert.equal(candidates[0].nama,'Budi');
 assert.equal(candidates[0].jumlah_assignment,1);
 assert.equal(candidates.some(x=>x.nama==='Petugas Arsip'),false);
 assert.equal(candidates.some(x=>x.nama==='Petugas Nonaktif'),false);
 assert.equal(candidates.some(x=>x.nama==='Belum Ditugaskan'),false);
});

test('link confirmed same-name monitoring alias to one existing petugas and preserve history',()=>{
 const f=fixture(),alias='monitor:'+'a'.repeat(32);
 const original=f.tab.petugas[0];
 f.tab.sumber_assignment.push({ppl_id:alias,ppl:'Andi',pml_id:'',
    survei:'VIMK_TH26',survey_period_id:'periode-IMK'});
 f.tab.petugas.push({...original,_row:3,petugas_id:'id-fasih-000000099',
    nomor_whatsapp:'6281200011111'});
 const before=f.api.list('admin');
 const candidate=before.kandidat_fasih.find(x=>x.petugas_id===alias);
 assert.ok(candidate);
 assert.equal(candidate.kemungkinan_sama.length,2);
 assert.throws(()=>f.api.link('operator',{alias_monitoring:alias,petugas_id:original.petugas_id,
    verifikasi_identitas:true}),/authorized/);
 assert.throws(()=>f.api.link('admin',{alias_monitoring:alias,petugas_id:original.petugas_id,
    verifikasi_identitas:false}),/mengonfirmasi/);
 f.tab.getSheetByName=(name)=>name==='padanan_petugas' && f.tab.padanan_petugas?{
    getDataRange:()=>({getDisplayValues:()=>f.tab.padanan_petugas}),
    appendRow:(row)=>f.tab.padanan_petugas.push(row)
 }:null;
 f.tab.insertSheet=(name)=>{
   assert.equal(name,'padanan_petugas');
   f.tab.padanan_petugas=[];
   return {
     getRange:()=>({setValues:(vals)=>f.tab.padanan_petugas.push(...vals)}),
     setFrozenRows:()=>{},
     getDataRange:()=>({getDisplayValues:()=>f.tab.padanan_petugas}),
     appendRow:(row)=>f.tab.padanan_petugas.push(row)
   };
 };
 const result=f.api.link('admin',{alias_monitoring:alias,petugas_id:original.petugas_id,
    verifikasi_identitas:true});
 assert.equal(result.success,true);
 assert.equal(result.assignment_dikaitkan,1);
 assert.equal(f.tab.padanan_petugas.length,2);
 assert.equal(f.api.link('admin',{alias_monitoring:alias,petugas_id:original.petugas_id,
    verifikasi_identitas:true}).sudah_ada,true);
 assert.throws(()=>f.api.link('admin',{alias_monitoring:alias,petugas_id:'id-fasih-000000099',
    verifikasi_identitas:true}),/sudah ditautkan/);
 assert.equal(f.tab.petugas.length,2,'Tautkan tidak menambah biodata');
 assert.equal(f.tab.tindak_lanjut[0].catatan,'Tetap tersimpan');
 assert.equal(f.tab.kontak[0].isi_pesan,'Tetap tersimpan');
});
test('linking only permits exactly matching verified names on active assignments',()=>{
 const f=fixture(),alias='monitor:'+'a'.repeat(32);
 f.tab.sumber_assignment.push({ppl_id:alias,ppl:'Cici Baru',pml_id:'',
  survei:'VIMK_TH26',survey_period_id:'periode-IMK'});
 assert.throws(()=>f.api.link('admin',{
  alias_monitoring:alias,petugas_id:'id-fasih-000000001',verifikasi_identitas:true
 }),/Nama monitoring tidak sama/);
 f.tab.sumber_assignment[f.tab.sumber_assignment.length-1].survey_period_id='periode-ARSIP';
 assert.throws(()=>f.api.link('admin',{
  alias_monitoring:alias,petugas_id:'id-fasih-000000001',verifikasi_identitas:true
 }),/tidak ada pada assignment survei aktif/);
});
