/**
 * BOLO INPEK — Identifikasi otomatis petugas baru pada SEMUA survei aktif.
 *
 * Mesin pembaruan tetap dikerjakan manual oleh Updater Windows (Chrome+VPN).
 * Setelah Updater menyimpan konfigurasi/assignment ke Monitoring utama,
 * pemicu Apps Script ini mendeteksi perubahan dalam interval ~1 menit.
 *
 * Jangan pakai onEdit/onChange pada Sheets: penulisan lewat Google Sheets API
 * TIDAK memicu edit trigger Apps Script.
 *
 * Pemicu dijalankan sebagai akun Google pemilik Apps Script (tidak butuh PC).
 * Fungsi handler berakhiran '_' agar tidak tersedia lewat google.script.run.
 */
const TL_AUTO=Object.freeze({
  handler:'tlAutoScan_',
  minutes:1,
  pLast:'TL_AUTO_SCAN_AT_V1',
  pOk:'TL_AUTO_SCAN_OK_V1',
  pChanged:'TL_AUTO_CHANGE_AT_V1',
  pError:'TL_AUTO_SCAN_ERROR_V1',
  pCount:'TL_AUTO_COUNTS_V1'
});
function tlAutoClock_(){
  return ScriptApp.getProjectTriggers().filter(function(trigger){
    return trigger.getHandlerFunction()===TL_AUTO.handler &&
      trigger.getEventType()===ScriptApp.EventType.CLOCK;
  });
}
/** Idempotent: jangan membuat trigger baru setiap kali Admin masuk. */
function tlAutoEnsure_(){
  const existing=tlAutoClock_();
  if(existing.length){
    return {aktif:true,interval_menit:TL_AUTO.minutes,
      pesan:'Pemeriksaan survei aktif otomatis telah terpasang.'};
  }
  ScriptApp.newTrigger(TL_AUTO.handler).timeBased()
    .everyMinutes(TL_AUTO.minutes).create();
  return {aktif:true,interval_menit:TL_AUTO.minutes,
    baru_dipasang:true,pesan:'Pemeriksaan otomatis telah diaktifkan.'};
}
/** Dapat berjalan tanpa login UI; TIDAK bisa dipanggil langsung lewat google.script.run. */
function tlAutoScan_(){
  const props=PropertiesService.getScriptProperties();
  const when=new Date().toISOString();
  try{
    const result=lock_(function(){return tlMonSyncInternal_();});
    const patch={};
    patch[TL_AUTO.pLast]=when;
    patch[TL_AUTO.pOk]='TRUE';
    patch[TL_AUTO.pError]='';
    patch[TL_AUTO.pCount]=JSON.stringify({
      survei_aktif:result.survei_aktif,assignment:result.assignment,
      petugas_perlu_didaftarkan:result.calon_petugas,
      waktu_monitoring:result.waktu_monitoring
    });
    if(result.berubah)patch[TL_AUTO.pChanged]=when;
    props.setProperties(patch,false);
    return {success:true,berubah:result.berubah,
      survei_aktif:result.survei_aktif,calon_petugas:result.calon_petugas};
  }catch(error){
    const patch={};
    patch[TL_AUTO.pLast]=when;
    patch[TL_AUTO.pOk]='FALSE';
    patch[TL_AUTO.pError]=String(error&&error.message||error).slice(0,350);
    props.setProperties(patch,false);
    console.error('Gagal memeriksa pembaruan survei BOLO INPEK: '+patch[TL_AUTO.pError]);
    return {success:false,pesan:'Pemeriksaan akan dicoba lagi pada interval berikutnya.'};
  }
}
function tlAutoStatus_(){
  const props=PropertiesService.getScriptProperties();
  const get=key=>props.getProperty(key)||'';
  let installed=false,reason='';
  try{installed=tlAutoClock_().length>0;}
  catch(e){reason=String(e&&e.message||e);}
  let counts={};
  try{counts=JSON.parse(get(TL_AUTO.pCount)||'{}');}
  catch(_){counts={};}
  return {aktif:installed,interval_menit:TL_AUTO.minutes,
    pemeriksaan_terakhir:get(TL_AUTO.pLast),
    sinkronisasi_terakhir:get(TL_AUTO.pChanged),
    pemeriksaan_berhasil:get(TL_AUTO.pOk)==='TRUE',
    pesan_gagal:get(TL_AUTO.pError)||reason,
    ringkasan:counts};
}
/** Kontrol eksplisit ADMIN, tetap memakai sesi backend lama. */
function apiStatusDeteksiOtomatis(token){
  session_(token,true);
  return tlAutoStatus_();
}
function apiAktifkanDeteksiOtomatis(token){
  session_(token,true);
  const installed=tlAutoEnsure_();
  return {...installed,...tlAutoStatus_()};
}
/** Pemilik dapat menghentikan tugas otomatis dari menu bila dibutuhkan. */
function apiNonaktifkanDeteksiOtomatis(token){
  session_(token,true);
  const triggers=tlAutoClock_();
  for(const trigger of triggers)ScriptApp.deleteTrigger(trigger);
  return {...tlAutoStatus_(),jumlah_dihapus:triggers.length};
}
