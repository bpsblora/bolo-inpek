/**
 * BOLO INPEK — audit konsistensi Tindak Lanjut (read-only).
 *
 * Tempel sebagai file .gs TAMBAHAN di Apps Script aktif, setelah Healthcheck.
 * Jalankan `boloTlAuditIntegritas_` dari editor Apps Script.
 *
 * Semua fungsi diakhiri "_" agar tidak dapat dipanggil google.script.run
 * dari web app. Jangan buat wrapper publik tanpa autentikasi.
 * Memakai fungsi backend lama: db_(), read_() dan kolom spreadsheet lama.
 * Tidak mencetak nomor HP, alamat email, catatan, atau ID assignment.
 * Tidak memodifikasi data, arsip, atau status survei.
 */
function boloTlAuditHitung_(tables) {
  const names=['operator','petugas','survei','kontak','tindak_lanjut',
    'arsip','sumber_assignment','sumber_petugas','sumber_survei'];
  const data=Object.fromEntries(names.map(n=>[n,Array.isArray(tables[n])?tables[n]:[]]));
  const errors={},warnings={};
  const warn=(key,n=1)=>warnings[key]=(warnings[key]||0)+n;
  const fail=(key,n=1)=>errors[key]=(errors[key]||0)+n;
  const norm=v=>String(v==null?'':v).trim();
  const k=row=>JSON.stringify([norm(row.survey_id),norm(row.survey_period_id)]);
  const unique=(name,makeKey)=>{
    const seen=new Set();
    for(const row of data[name]){
      const v=makeKey(row);
      if(!v){fail(name+'_id_kosong');continue;}
      if(seen.has(v))fail(name+'_id_ganda');
      seen.add(v);
    }
  };
  unique('petugas',r=>norm(r.petugas_id));
  unique('survei',r=>norm(r.survey_id)&&norm(r.survey_period_id)?k(r):'');
  unique('kontak',r=>norm(r.kontak_id));
  unique('tindak_lanjut',r=>norm(r.riwayat_id));
  unique('arsip',r=>norm(r.arsip_id));
  unique('sumber_assignment',r=>norm(r.survey_id)&&norm(r.survey_period_id)&&
    norm(r.assignment_id)?JSON.stringify([k(r),norm(r.assignment_id)]):'');
  const surveyKeys=new Set(data.survei.map(k));
  const archiveBySurvey=new Map();
  for(const row of data.arsip){
    const key=k(row);
    if(!archiveBySurvey.has(key))archiveBySurvey.set(key,[]);
    archiveBySurvey.get(key).push(row);
  }
  for(const name of ['tindak_lanjut','arsip','sumber_assignment','sumber_survei']){
    for(const row of data[name]){
      if(!surveyKeys.has(k(row)))warn(name+'_periode_tidak_terdaftar');
    }
  }
  const contactIds=new Set(data.kontak.map(r=>norm(r.kontak_id)));
  const assignmentKeys=new Set(data.sumber_assignment.map(r=>
    JSON.stringify([k(r),norm(r.assignment_id)])));
  const latest=new Map();
  for(let i=0;i<data.tindak_lanjut.length;i++){
    const row=data.tindak_lanjut[i];
    if(norm(row.kontak_id)&&!contactIds.has(norm(row.kontak_id)))
      warn('riwayat_kontak_tidak_ditemukan');
    if(norm(row.assignment_id)&&!assignmentKeys.has(
      JSON.stringify([k(row),norm(row.assignment_id)])))
      warn('riwayat_assignment_tidak_ditemukan_di_sumber');
    const status=norm(row.status_tindak_lanjut).toUpperCase();
    if(!['MENUNGGU_BALASAN','DALAM_PERBAIKAN','SELESAI'].includes(status))
      warn('riwayat_status_tidak_dikenal');
    if(status!=='SELESAI'&&!norm(row.pengingat_pada))
      warn('riwayat_aktif_tanpa_tanggal_pengingat');
    const chain=norm(row.tindak_lanjut_id)||norm(row.riwayat_id);
    if(!chain){fail('riwayat_tanpa_rantai');continue;}
    // Waktu terbaru, lalu indeks baris sebagai penentu saat waktu sama.
    const time=Date.parse(row.waktu_catat)||0;
    const old=latest.get(chain);
    if(!old||time>=old.time)latest.set(chain,{time,row,index:i});
  }
  let open=0,done=0;
  for(const item of latest.values()){
    const state=norm(item.row.status_tindak_lanjut).toUpperCase();
    if(['MENUNGGU_BALASAN','DALAM_PERBAIKAN'].includes(state))open++;
    if(state==='SELESAI')done++;
  }
  for(const row of data.survei){
    const status=norm(row.status_operasional).toUpperCase();
    const archive=archiveBySurvey.get(k(row))||[];
    if(!['AKTIF','PENGARSIPAN','DITUTUP'].includes(status))warn('survei_status_operasional_tidak_dikenal');
    if(status==='DITUTUP'&&!archive.some(a=>['BERSIH','TERVERIFIKASI'].includes(
      norm(a.status_arsip).toUpperCase())))fail('survei_ditutup_tanpa_arsip_terverifikasi');
    if(status==='PENGARSIPAN')warn('survei_masih_dalam_pengarsipan');
  }
  const report={
    versi:'audit-integritas-v1',
    waktu_pemeriksaan:new Date().toISOString(),
    tab:Object.fromEntries(names.map(n=>[n,data[n].length])),
    tindak_lanjut:{rantai_unik:latest.size,perlu_tindak_lanjut:open,selesai:done},
    error:errors,peringatan:warnings,
    siap_untuk_uji:!Object.keys(errors).length
  };
  return report;
}
function boloTlAuditIntegritas_() {
  const book=db_();
  const names=['operator','petugas','survei','kontak','tindak_lanjut',
    'arsip','sumber_assignment','sumber_petugas','sumber_survei'];
  const source=Object.fromEntries(names.map(name=>[name,read_(book,name)]));
  const report=boloTlAuditHitung_(source);
  Logger.log(JSON.stringify(report,null,2));
  return report;
}

/**
 * ENTRYPOINT UNTUK EDITOR APPS SCRIPT (muncul pada daftar fungsi).
 * Fungsi audit asli tetap privat (akhiran "_").
 *
 * Google Apps Script sering tidak menampilkan fungsi berakhiran "_"
 * pada dropdown Jalankan. Endpoint publik dibatasi: hanya sesi dengan
 * active user yang SAMA dengan effective user/pemilik eksekusi.
 * Dalam deployment "Execute as me", pengunjung tidak akan lolos.
 *
 * Tidak melakukan mutasi data. JANGAN gunakan fungsi ini sebagai API web.
 */
function jalankanAuditIntegritasBolo() {
  const aktif = String(Session.getActiveUser().getEmail() || "").trim().toLowerCase();
  const pelaksana = String(Session.getEffectiveUser().getEmail() || "").trim().toLowerCase();
  if (!aktif || !pelaksana || aktif !== pelaksana) {
    throw new Error(
      "Audit hanya boleh dijalankan oleh pemilik dari editor Apps Script. " +
      "Jangan jalankan fungsi ini lewat website."
    );
  }
  return boloTlAuditIntegritas_();
}
