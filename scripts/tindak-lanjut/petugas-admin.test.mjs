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
    sumber_assignment:[{ppl_id:'id-fasih-000000001',pml_id:'id-fasih-000000002'}],
    tindak_lanjut:[{petugas_id:'id-fasih-000000001',catatan:'Tetap tersimpan'}],
    kontak:[{petugas_id:'id-fasih-000000001',isi_pesan:'Tetap tersimpan'}]
  };
  const api=new Function('db_','read_','append_','patch_','lock_','session_','text_','uid_',gs+
    ';return {list:apiDaftarPetugasAdmin,save:apiSimpanPetugasAdmin,phone:tlPetugasNormalisasiNomor_};')(
    ()=>tab,(db,name)=>db[name].map(r=>({...r})),
    (db,name,rows)=>rows.forEach(r=>db[name].push({...r,_row:db[name].length+2})),
    (db,name,row,values)=>Object.assign(db[name].find(x=>x._row===row),values),
    fn=>fn(),
    (token,admin)=>{if(token!=='admin'||!admin)throw Error('not authorized');return {nama:'Admin'};},
    s=>String(s??'').trim(),()=>('generated-uuid-'+Date.now())
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
