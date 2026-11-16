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
      arsip_url:s.status_operasional==='DITUTUP'?(archive?.arsip_url||''):''
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

const TL_SURVEY_JOURNAL=[
  {tab:'arsip_riwayat_survei',sheet:'Riwayat tindak lanjut',source:'tindak_lanjut'},
  {tab:'arsip_kontak_survei',sheet:'Kontak',source:'kontak'}
];
const TL_SURVEY_TRASH_TAB='arsip_rekap_dipulihkan';
const TL_SURVEY_TRASH_HEADERS=['file_id','kunci_periode','status'];

// Riwayat harus tersimpan di database sebelum file Drive boleh masuk Sampah.
// File yang dipakai oleh beberapa versi periode yang sama diproses satu kali.
function tlSurveyRetireArchives_(db,k,archives,actorEmail){
  const files=new Map();
  for(const archive of archives){
    if(archive.status_arsip==='BERSIH'&&archive.arsip_file_id&&!files.has(archive.arsip_file_id))
      files.set(archive.arsip_file_id,archive);
  }
  if(!files.size)return;
  const journal=db.getSheetByName(TL_SURVEY_TRASH_TAB)?.getDataRange().getDisplayValues().slice(1)||[];
  const prior=new Map(journal.map(row=>[row[0],row]));
  if(![...files.keys()].some(id=>prior.get(id)?.[2]!=='SAMPAH'))return;
  // Email yang diketik saat login Tindak Lanjut belum membuktikan identitas
  // Google. Operasi ke Sampah memerlukan akun Google admin yang terverifikasi.
  if(!actorEmail||Session.getActiveUser().getEmail().trim().toLowerCase()!==actorEmail.toLowerCase())
    throw Error('Masuk ke Google dengan akun Admin INPEK yang sama untuk memindahkan rekap lama ke Sampah.');
  for(const [id,archive] of files){
    const saved=prior.get(id);
    if(saved&&saved[1]!==k)throw Error('File arsip terdaftar untuk periode lain.');
    if(saved?.[2]==='SAMPAH')continue;
    const file=DriveApp.getFileById(id);
    if(!saved){
      const parents=file.getParents();
      let inArchiveFolder=false;
      while(parents.hasNext()){
        if(parents.next().getId()===TL.folder)inArchiveFolder=true;
      }
      if(!inArchiveFolder)throw Error('Spreadsheet rekap lama berada di luar folder arsip BOLO INPEK.');
      const book=SpreadsheetApp.openById(id);
      const summary=new Map(book.getSheetByName('Ringkasan').getDataRange().getDisplayValues());
      if(key_({survey_id:summary.get('survey_id'),survey_period_id:summary.get('survey_period_id')})!==k)
        throw Error('Identitas spreadsheet rekap berbeda dengan periode survei.');
      let history=[];
      for(const {tab,sheet,source} of TL_SURVEY_JOURNAL){
        const headers=TL.headers[source];
        const values=book.getSheetByName(sheet).getDataRange().getDisplayValues();
        if(JSON.stringify(values[0])!==JSON.stringify(headers))
          throw Error('Header rekap tidak sesuai pada '+sheet+'.');
        const rows=values.slice(1).filter(row=>row[0]);
        if(source==='tindak_lanjut'){
          if(rows.length<Number(archive.jumlah_riwayat||0))
            throw Error('Jumlah catatan di spreadsheet rekap kurang dari yang tercatat.');
          history=rows;
        }else{
          const contactIndex=TL.headers.tindak_lanjut.indexOf('kontak_id');
          const contactIds=new Set(rows.map(row=>row[0]));
          if(contactIndex>=0&&history.some(row=>row[contactIndex]&&!contactIds.has(row[contactIndex])))
            throw Error('Kontak yang dirujuk oleh catatan arsip belum lengkap.');
        }
        tlSurveyAppendArchive_(db,tab,['kunci_baris','kunci_periode',...headers],
          rows.map(row=>[JSON.stringify([k,row[0]]),k,...row]));
      }
      tlSurveyAppendArchive_(db,TL_SURVEY_TRASH_TAB,TL_SURVEY_TRASH_HEADERS,[[id,k,'TERSALIN']]);
    }
    if(!file.isTrashed())file.setTrashed(true);
    if(!file.isTrashed())throw Error('Spreadsheet rekap lama belum berhasil dipindahkan ke Sampah.');
    const marker=db.getSheetByName(TL_SURVEY_TRASH_TAB);
    const row=marker.getDataRange().getDisplayValues().findIndex(values=>values[0]===id)+1;
    marker.getRange(row,3).setValue('SAMPAH');
    SpreadsheetApp.flush();
  }
}

function tlSurveyJournalRows_(db,k,tab){
  const sheet=db.getSheetByName(tab);
  if(!sheet)return [];
  return sheet.getDataRange().getDisplayValues().slice(1)
    .filter(row=>row[1]===k).map(row=>row.slice(2));
}

// Registry Monitoring juga dibaca langsung oleh paket Updater lama.
function tlSurveyRegistryChange_(survey,active){
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
    return ()=>{};
  }
  const [datePeriodCol,dateActiveCol]=index(dates,['survey_period_id','aktif']);
  const j=dates.findIndex((r,n)=>n>0&&r[datePeriodCol]===survey.survey_period_id);
  if(j<0)throw Error('Periode survei belum ditemukan di Monitoring.');
  return ()=>{
    const configCell=config.getRange(i+1,activeCol+1);
    const periodCell=periods.getRange(j+1,dateActiveCol+1);
    const cells=active?[periodCell,configCell]:[configCell,periodCell];
    for(const cell of cells)cell.setValue(active);
    SpreadsheetApp.flush();
  };
}

function tlSurveyRestore_(token,choice,confirmed){
  return lock_(()=>{
    const actor=session_(token,true);
    if(confirmed!==true||!choice||!text_(choice.survey_id)||!text_(choice.survey_period_id))
      throw Error('Pilih periode yang valid dan konfirmasikan pemulihan.');
    const db=db_(),k=key_(choice),s=survey_(db,k);
    if(s.status_operasional==='AKTIF')return {success:true,nama_survei:s.nama_survei};
    if(s.status_operasional!=='DITUTUP')throw Error('Survei belum selesai atau masih diarsipkan.');
    const archives=read_(db,'arsip').filter(a=>key_(a)===k)
      .sort((a,b)=>Number(b.versi)-Number(a.versi));
    const archive=archives[0];
    if(archive?.status_arsip!=='BERSIH')throw Error('Selesaikan pengarsipan sebelum memulihkan survei.');
    const activate=tlSurveyRegistryChange_(s,true);
    tlSurveyRetireArchives_(db,k,archives,actor.email);
    try{
      activate();
      patch_(db,'survei',s._row,{waktu_ditutup:'',ditutup_oleh:'',catatan_penutupan:'',status_operasional:'AKTIF'});
      SpreadsheetApp.flush();
    }catch(err){
      if(survey_(db,k).status_operasional==='DITUTUP')tlSurveyRegistryChange_(s,false)();
      throw err;
    }
    return {success:true,nama_survei:s.nama_survei};
  });
}

function tlSurveyClose_(token,k,note,confirmed){
  return lock_(()=>{
    const op=session_(token,true),db=db_(),s=survey_(db,k);
    const closingNote=text_(note);
    if(confirmed!==true||!closingNote||closingNote.length>20000)
      throw Error('Isi catatan penutupan hingga 20.000 karakter dan konfirmasi tindakan.');
    const archives=read_(db,'arsip').filter(a=>key_(a)===k)
      .sort((a,b)=>Number(b.versi)-Number(a.versi));
    let archive=archives[0];
    if(s.status_operasional==='DITUTUP'&&archive&&['TERVERIFIKASI','BERSIH'].includes(archive.status_arsip)){
      tlSurveyRegistryChange_(s,false)();
      if(archive.status_arsip!=='BERSIH')cleanup_(db,k,archive);
      return {url:archive.arsip_url};
    }
    if(!['AKTIF','NONAKTIF','PENGARSIPAN'].includes(s.status_operasional))
      throw Error('Status survei tidak dapat ditandai selesai.');

    const snapshot=snapshot_(db,k);
    if(!snapshot.assignment.length)throw Error('Rekap assignment kosong. Perbarui kondisi Dashboard dahulu.');
    if(snapshot.assignment.some(a=>!a.waktu_data_monitoring))throw Error('Waktu sumber assignment belum lengkap.');
    // Periode yang sudah aktif sebelum aturan ini diberlakukan mungkin masih
    // memiliki file lama. Simpan riwayatnya sebelum menyiapkan rekap baru.
    const inProgress=['DRAF','TERVERIFIKASI'].includes(archive?.status_arsip)?archive.arsip_file_id:'';
    tlSurveyRetireArchives_(db,k,archives.filter(a=>a.arsip_file_id!==inProgress),op.email);
    if(s.status_operasional!=='PENGARSIPAN')
      patch_(db,'survei',s._row,{status_operasional:'PENGARSIPAN'});
    tlSurveyRegistryChange_(s,false)();
    if(!archive||!['DRAF','TERVERIFIKASI'].includes(archive.status_arsip)){
      const row={
        arsip_id:uid_(),survey_id:s.survey_id,survey_period_id:s.survey_period_id,
        nama_survei:s.nama_survei,nama_periode:s.nama_periode,versi:String(archive?Number(archive.versi)+1:1),
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
      let history=[];
      for(const {tab,sheet,source} of TL_SURVEY_JOURNAL){
        const headers=TL.headers[source];
        const current=source==='tindak_lanjut'?snapshot.history:snapshot.contacts;
        const combined=new Map(tlSurveyJournalRows_(db,k,tab).map(row=>[row[0],row]));
        for(const row of matrix_(headers,current).slice(1))combined.set(row[0],row);
        const rows=tlSurveyAppendArchive_(book,sheet,headers,[...combined.values()]);
        if(source==='tindak_lanjut')history=rows;
      }

      const historyHeaders=TL.headers.tindak_lanjut;
      const latestNotes=new Map();
      const noteKey=historyHeaders.indexOf('tindak_lanjut_id');
      const noteTime=historyHeaders.indexOf('waktu_catat');
      const noteStatus=historyHeaders.indexOf('status_tindak_lanjut');
      for(const row of history){
        const id=row[noteKey]||row[0];
        if(!latestNotes.has(id)||row[noteTime]>=latestNotes.get(id)[noteTime])latestNotes.set(id,row);
      }
      const pending=[...latestNotes.values()].filter(row=>row[noteStatus]!=='SELESAI').length;
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
        ['jumlah_riwayat',String(history.length)],['tindak_lanjut_belum_selesai',String(pending)],
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
