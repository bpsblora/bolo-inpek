/** Penutupan periode, pemulihan, dan tautan rekap untuk Kelola Survei. */
function apiKelolaSiklusSurvei(token) {
  session_(token,true);
  const db=db_();
  const archives=read_(db,'arsip').filter(a=>a.arsip_url&&['TERVERIFIKASI','BERSIH'].includes(a.status_arsip))
    .sort((a,b)=>Number(b.versi)-Number(a.versi));
  const latest=new Map();
  for(const archive of archives) {
    const k=key_(archive);
    if(!latest.has(k))latest.set(k,archive);
  }
  return read_(db,'survei').map(s=>{
    const archive=latest.get(key_(s));
    return {
      survey_id:s.survey_id,survey_period_id:s.survey_period_id,
      name:s.nama_survei,code:s.kode_survei,tanggal_mulai:s.tanggal_mulai,
      tanggal_selesai:s.tanggal_selesai,status:s.status_operasional,
      cleanup_pending:s.status_operasional==='DITUTUP'&&archive?.status_arsip==='TERVERIFIKASI',
      arsip_url:archive?.arsip_url||''
    };
  }).filter(s=>s.survey_id&&s.survey_period_id);
}

// Tab riwayat ditambah berdasarkan ID. Retry setelah penulisan sebagian
// melengkapi baris yang belum tersimpan dan mempertahankan catatan lama.
function tlSurveyAppendArchive_(book,name,headers,rows){
  if(!book.getSheetByName(name))archiveTable_(book,name,[headers]);
  const sheet=book.getSheetByName(name);
  const values=sheet.getDataRange().getDisplayValues();
  if(JSON.stringify(values[0])!==JSON.stringify(headers))
    throw Error('Header arsip tidak sesuai pada '+name+'.');
  const stored=new Set(values.slice(1).map(row=>row[0]).filter(Boolean));
  const additions=rows.filter(row=>row[0]&&!stored.has(row[0]));
  if(additions.length){
    const start=sheet.getLastRow()+1;
    const end=start+additions.length-1;
    if(end>sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),end-sheet.getMaxRows());
    const range=sheet.getRange(start,1,additions.length,headers.length);
    range.setNumberFormat('@').setValues(additions.map(row=>row.map(safe_)));
    SpreadsheetApp.flush();
    if(JSON.stringify(range.getDisplayValues())!==JSON.stringify(additions))
      throw Error('Verifikasi arsip gagal pada '+name+'.');
  }
  return sheet.getDataRange().getDisplayValues().slice(1).filter(row=>row[0]);
}

// Registry Monitoring juga dibaca langsung oleh paket Updater lama.
function tlSurveySetRegistryActive_(survey,active){
  const book=SpreadsheetApp.openById(TL_MON.id);
  const config=book.getSheetByName('konfigurasi_survei');
  const periods=book.getSheetByName('periode_survei');
  const registry=config.getDataRange().getDisplayValues();
  const dates=periods.getDataRange().getDisplayValues();
  const index=(rows,fields)=>{
    const columns=fields.map(field=>rows[0].indexOf(field));
    if(columns.includes(-1))throw Error('Kolom registry survei belum tersedia.');
    return columns;
  };
  const [surveyCol,periodCol,activeCol]=index(registry,['survey_id','survey_period_id','aktif']);
  const i=registry.findIndex((r,n)=>n>0&&r[surveyCol]===survey.survey_id&&r[periodCol]===survey.survey_period_id);
  // Periode historis mungkin sudah digantikan oleh periode lain dengan kode yang sama.
  if(i<0){
    if(active)throw Error('Periode ini sudah diganti di konfigurasi. Daftarkan kembali periode sebelum memulihkan.');
    return;
  }
  const [datePeriodCol,dateActiveCol]=index(dates,['survey_period_id','aktif']);
  const j=dates.findIndex((r,n)=>n>0&&r[datePeriodCol]===survey.survey_period_id);
  if(j<0)throw Error('Periode survei belum ditemukan di Monitoring.');
  if(active){
    periods.getRange(j+1,dateActiveCol+1).setValue(true);
    config.getRange(i+1,activeCol+1).setValue(true);
  }else{
    config.getRange(i+1,activeCol+1).setValue(false);
    periods.getRange(j+1,dateActiveCol+1).setValue(false);
  }
  SpreadsheetApp.flush();
}

function tlSurveyRestore_(token,choice,confirmed){
  return lock_(()=>{
    session_(token,true);
    if(confirmed!==true||!choice||!text_(choice.survey_id)||!text_(choice.survey_period_id))
      throw Error('Pilih periode yang valid dan konfirmasikan pemulihan.');
    const db=db_(),k=key_(choice),s=survey_(db,k);
    if(s.status_operasional==='AKTIF')return {success:true,nama_survei:s.nama_survei};
    if(s.status_operasional!=='DITUTUP')throw Error('Survei belum selesai atau masih diarsipkan.');
    const archive=read_(db,'arsip').filter(a=>key_(a)===k)
      .sort((a,b)=>Number(b.versi)-Number(a.versi))[0];
    if(archive?.status_arsip!=='BERSIH')throw Error('Selesaikan pengarsipan sebelum memulihkan survei.');
    tlSurveySetRegistryActive_(s,true);
    patch_(db,'survei',s._row,{status_operasional:'AKTIF',waktu_ditutup:'',ditutup_oleh:'',catatan_penutupan:''});
    return {success:true,nama_survei:s.nama_survei};
  });
}

function tlSurveyClose_(token,k,note,confirmed){
  return lock_(()=>{
    const op=session_(token,true),db=db_(),s=survey_(db,k);
    const closingNote=text_(note);
    if(confirmed!==true||!closingNote||closingNote.length>20000)
      throw Error('Isi catatan penutupan hingga 20.000 karakter dan konfirmasi tindakan.');
    let archive=read_(db,'arsip').filter(a=>key_(a)===k)
      .sort((a,b)=>Number(b.versi)-Number(a.versi))[0];
    if(s.status_operasional==='DITUTUP'&&archive&&['TERVERIFIKASI','BERSIH'].includes(archive.status_arsip)){
      tlSurveySetRegistryActive_(s,false);
      if(archive.status_arsip!=='BERSIH')cleanup_(db,k,archive);
      return {url:archive.arsip_url};
    }
    if(!['AKTIF','NONAKTIF','PENGARSIPAN'].includes(s.status_operasional))
      throw Error('Status survei tidak dapat ditandai selesai.');

    const snapshot=snapshot_(db,k);
    if(!snapshot.assignment.length)throw Error('Rekap assignment kosong. Perbarui kondisi Dashboard dahulu.');
    if(snapshot.assignment.some(a=>!a.waktu_data_monitoring))throw Error('Waktu sumber assignment belum lengkap.');
    if(s.status_operasional!=='PENGARSIPAN')
      patch_(db,'survei',s._row,{status_operasional:'PENGARSIPAN'});
    tlSurveySetRegistryActive_(s,false);

    if(!archive||!['DRAF','TERVERIFIKASI'].includes(archive.status_arsip)){
      const row={
        arsip_id:uid_(),survey_id:s.survey_id,survey_period_id:s.survey_period_id,
        nama_survei:s.nama_survei,nama_periode:s.nama_periode,versi:String(archive?Number(archive.versi)+1:1),
        arsip_file_id:archive?.arsip_file_id||'',arsip_url:archive?.arsip_url||'',
        waktu_arsip:now_(),operator_email:op.email,status_arsip:'DRAF',catatan_penutupan:closingNote
      };
      append_(db,'arsip',[row]);
      archive=read_(db,'arsip').find(a=>a.arsip_id===row.arsip_id);
    }
    if(!archive.arsip_file_id){
      const book=SpreadsheetApp.create(('BOLO INPEK - '+s.nama_survei+' - '+s.nama_periode).slice(0,200));
      archive.arsip_file_id=book.getId();
      archive.arsip_url=book.getUrl();
      patch_(db,'arsip',archive._row,{arsip_file_id:archive.arsip_file_id,arsip_url:archive.arsip_url});
      SpreadsheetApp.flush();
    }
    const storedNote=archive.catatan_penutupan||closingNote;
    if(archive.status_arsip!=='TERVERIFIKASI'){
      const book=SpreadsheetApp.openById(archive.arsip_file_id);
      DriveApp.getFileById(book.getId()).moveTo(DriveApp.getFolderById(TL.folder));
      const historyHeaders=TL.headers.tindak_lanjut;
      const history=tlSurveyAppendArchive_(book,'Riwayat tindak lanjut',historyHeaders,
        matrix_(historyHeaders,snapshot.history).slice(1));
      const contactHeaders=TL.headers.kontak;
      tlSurveyAppendArchive_(book,'Kontak',contactHeaders,matrix_(contactHeaders,snapshot.contacts).slice(1));

      const closureHeaders=['arsip_id','versi','waktu_arsip','operator_email','catatan_penutupan'];
      const closures=read_(db,'arsip').filter(a=>key_(a)===k)
        .sort((a,b)=>Number(a.versi)-Number(b.versi));
      tlSurveyAppendArchive_(book,'Riwayat penyelesaian',closureHeaders,matrix_(closureHeaders,closures).slice(1));

      const notedAssignments=new Set(history.map(r=>r[historyHeaders.indexOf('assignment_id')]).filter(Boolean));
      const assignmentHeaders=['survey_id','survey_period_id','assignment_id','survei','nama_assignment',
        'status','status_asli','ppl_id','ppl','pml_id','pml','waktu_data_monitoring','keterangan_tindak_lanjut'];
      const assignments=snapshot.assignment.map(a=>({...a,keterangan_tindak_lanjut:
        notedAssignments.has(a.assignment_id)?'Ada catatan khusus assignment':'Lihat juga catatan umum survei'}));
      archiveTable_(book,'Rekap assignment',matrix_(assignmentHeaders,assignments));
      archiveTable_(book,'Ringkasan',[
        ['parameter','nilai'],['survey_id',s.survey_id],['survey_period_id',s.survey_period_id],
        ['survei',s.nama_survei],['periode',s.nama_periode],['operator_email',archive.operator_email],
        ['identitas_operator','Berdasarkan email yang dimasukkan; tanpa verifikasi kepemilikan'],
        ['waktu_arsip',archive.waktu_arsip],['jumlah_assignment',String(assignments.length)],
        ['jumlah_riwayat',String(history.length)],['tindak_lanjut_belum_selesai',String(snapshot.belumSelesai)],
        ['catatan_penutupan',storedNote]
      ]);
      patch_(db,'arsip',archive._row,{status_arsip:'TERVERIFIKASI',jumlah_assignment:String(assignments.length),
        jumlah_riwayat:String(history.length),catatan_penutupan:storedNote});
    }
    patch_(db,'survei',s._row,{status_operasional:'DITUTUP',waktu_ditutup:now_(),
      ditutup_oleh:archive.operator_email,catatan_penutupan:storedNote});
    cleanup_(db,k,archive);
    return {url:archive.arsip_url};
  });
}
