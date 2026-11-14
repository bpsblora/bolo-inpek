/**
 * Sinkronisasi otomatis Tindak Lanjut -> Monitoring Progres BOLO INPEK (read-only sumber).
 * SUMBER: monitoring, konfigurasi_survei, periode_survei, assignment_identitas, info_update.
 * TUJUAN: survei, sumber_survei, sumber_assignment (snapshot saja).
 * BUKAN: petugas, kontak, tindak_lanjut, arsip, operator.
 * Nama baru tanpa UUID FASIH mendapat ID alias monitor:hash dan wajib diverifikasi Admin.
 */
const TL_MON=Object.freeze({
  id:'1bgCF8RSkltsd3jpL-naTEgWEIMw5y2rw8EzYRagCGNo',
  prop:'TL_MONITOR_SYNC_SHA_V1',maxRows:15000
});
function tlMonText_(s){return String(s==null?'':s).trim();}
function tlMonNormalize_(s){return tlMonText_(s).normalize('NFKC').replace(/\s+/g,' ').toLocaleLowerCase('id');}
function tlMonDigest_(s){
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(s),Utilities.Charset.UTF_8)
    .map(n=>(n<0?n+256:n).toString(16).padStart(2,'0')).join('');
}
function tlMonAlias_(name){return 'monitor:'+tlMonDigest_(tlMonNormalize_(name)).slice(0,32);}
function tlMonActive_(x){return ['TRUE','1','AKTIF','YA','YES'].includes(tlMonText_(x).toUpperCase());}
function tlMonRead_(book,name,required){
  const sh=book.getSheetByName(name);
  if(!sh)throw Error('Tab sumber '+name+' tidak ditemukan.');
  const values=sh.getDataRange().getDisplayValues();
  if(!values.length)throw Error('Tab sumber '+name+' kosong.');
  const header=values[0].map(tlMonText_);
  required.forEach(k=>{if(header.filter(h=>h===k).length!==1)throw Error('Kolom '+k+' pada '+name+' tidak sesuai.');});
  return values.slice(1).map((a,i)=>{
    const o={_sheet_row:i+2};
    header.forEach((k,j)=>{if(k)o[k]=tlMonText_(a[j]);});
    return o;
  }).filter(r=>required.some(k=>r[k]));
}
function tlMonStatus_(x){
  const s=tlMonText_(x).toUpperCase();
  if(s==='OPEN'||s==='DRAFT'||s.startsWith('REVOKED'))return 'OPEN';
  if(['REJECT','SUBMIT','APPROVE','COMPLETE'].includes(s))return s;
  if(s.startsWith('REJECTED'))return 'REJECT';
  if(s.startsWith('SUBMITTED'))return 'SUBMIT';
  if(s.startsWith('COMPLETED'))return 'COMPLETE';
  if(s.startsWith('APPROVED'))return 'APPROVE';
  return 'LAINNYA';
}
/**
 * Identitas yang sudah diverifikasi ADMIN adalah sumber utama.
 * Dua record sumber FASIH dengan nama sama tidak boleh membatalkan identitas
 * unik yang sudah terdaftar. Nama kembar di master tetap AMBIGU.
 */
function tlMonNameIDs_(db){
  const master=read_(db,'petugas'),source=read_(db,'sumber_petugas');
  const group=rows=>{
    const result=new Map();
    for(const p of rows){
      const name=tlMonNormalize_(p.nama);
      if(!name||!p.petugas_id)continue;
      if(!result.has(name))result.set(name,new Set());
      result.get(name).add(tlMonText_(p.petugas_id));
    }
    return result;
  };
  const verified=group(master),external=group(source),map=new Map();
  for(const [name,ids] of verified)if(ids.size===1)map.set(name,[...ids][0]);
  for(const [name,ids] of external){
    // Jika ada satu atau lebih orang di master dengan nama ini,
    // JANGAN memilih identitas FASIH yang berbeda secara diam-diam.
    if(verified.has(name))continue;
    if(ids.size===1)map.set(name,[...ids][0]);
  }
  return map;
}
/**
 * Tab mapping manual dibuat saat Admin memilih Tautkan Petugas, tidak
 * mengubah/menambah kolom database induk. Snapshot dapat dibangun read-only.
 */
function tlMonLinkMap_(db){
  const sheet=db.getSheetByName('padanan_petugas');
  if(!sheet)return new Map();
  const values=sheet.getDataRange().getDisplayValues();
  const headers=['alias_monitoring','petugas_id','nama_monitoring','waktu_taut','ditautkan_oleh'];
  if(JSON.stringify(values[0])!==JSON.stringify(headers))
    throw Error('Struktur tab padanan_petugas tidak sesuai. Sinkronisasi dihentikan.');
  const registered=new Set(read_(db,'petugas').map(p=>tlMonText_(p.petugas_id)));
  const map=new Map();
  values.slice(1).forEach((row,n)=>{
    const alias=tlMonText_(row[0]),target=tlMonText_(row[1]),name=tlMonText_(row[2]);
    if(!alias&&!target&&!name)return;
    if(!/^monitor:[a-f0-9]{32}$/.test(alias)||tlMonAlias_(name)!==alias||!registered.has(target))
      throw Error('Padanan petugas tidak valid pada baris '+(n+2)+'.');
    if(map.has(alias)&&map.get(alias)!==target)
      throw Error('Alias petugas memiliki dua tujuan berbeda. Periksa padanan_petugas.');
    map.set(alias,target);
  });
  return map;
}
function tlMonPersonId_(name,map,links){
  const k=tlMonNormalize_(name);
  if(!k||['belum dialokasikan','belum ditetapkan','-','tidak ada'].includes(k))return '';
  const alias=tlMonAlias_(name);
  // Tautan yang sudah dikonfirmasi admin mengatasi ambiguitas nama.
  return (links&&links.get(alias))||map.get(k)||alias;
}
function tlMonBuild_(src,db){
  const config=tlMonRead_(src,'konfigurasi_survei',
    ['code','name','survey_id','survey_period_id','aktif']);
  const periods=tlMonRead_(src,'periode_survei',
    ['survei','survey_period_id','nama_periode']);
  const monitoring=tlMonRead_(src,'monitoring',
    ['survei','nama_assignment','status','ppl','pml']);
  const ids=tlMonRead_(src,'assignment_identitas',
    ['survei','survey_period_id','assignment_id','nama_assignment','monitoring_row']);
  const update=tlMonRead_(src,'info_update',['parameter','nilai'])
    .find(r=>r.parameter==='data_terakhir_diambil')?.nilai||'';
  if(!update||!Number.isFinite(Date.parse(update)))throw Error('Waktu pembaruan monitoring tidak valid.');
  if(!monitoring.length||monitoring.length>TL_MON.maxRows)throw Error('Jumlah assignment monitoring tidak wajar.');
  const byName=new Map(),byPeriod=new Map();
  config.forEach(c=>{
    if(!c.name||!c.survey_id||!c.survey_period_id||byName.has(c.name)||byPeriod.has(c.survey_period_id))
      throw Error('Konfigurasi survei memiliki ID/nama tidak lengkap atau ganda.');
    byName.set(c.name,c);byPeriod.set(c.survey_period_id,c);
  });
  const perMap=new Map(periods.map(p=>[p.survey_period_id,p]));
  const idMap=new Map(),idSet=new Set();
  ids.forEach(r=>{
    const n=Number(r.monitoring_row),id=r.assignment_id.replace(/^id:/i,'');
    if(!Number.isSafeInteger(n)||n<2||idMap.has(n))throw Error('Nomor baris assignment_identitas tidak valid/ganda.');
    if(!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id)||idSet.has(id))
      throw Error('ID assignment FASIH tidak valid/ganda.');
    idSet.add(id);idMap.set(n,{...r,assignment_id:id});
  });
  if(idMap.size!==monitoring.length)throw Error('Monitoring dan assignment_identitas tidak lengkap atau jumlahnya berbeda.');
  const nameMap=tlMonNameIDs_(db),links=tlMonLinkMap_(db),
    unverified=new Map(),assign=[],keys=new Set();
  const registeredIds=new Set(read_(db,'petugas').map(r=>r.petugas_id).filter(Boolean));
  const archivedPeriods=new Set(read_(db,'survei')
    .filter(r=>['DITUTUP','PENGARSIPAN'].includes(tlMonText_(r.status_operasional).toUpperCase()))
    .map(r=>tlMonText_(r.survey_period_id)));
  monitoring.forEach((r,i)=>{
    const id=idMap.get(i+2),c=byName.get(r.survei);
    if(!id||id.survei!==r.survei||id.nama_assignment!==r.nama_assignment)
      throw Error('Identity assignment tidak cocok dengan monitoring baris '+(i+2)+'.');
    if(!c||id.survey_period_id!==c.survey_period_id)
      throw Error('Survei/periode assignment '+r.survei+' tidak cocok dengan konfigurasi.');
    const k=c.survey_period_id+'|'+id.assignment_id;
    if(keys.has(k))throw Error('Assignment ganda pada sumber.');keys.add(k);
    const ppl_id=tlMonPersonId_(r.ppl,nameMap,links),pml_id=tlMonPersonId_(r.pml,nameMap,links);
    // Deteksi hanya untuk SURVEI AKTIF, bukan arsip/periode nonaktif.
    // Assignment historis tetap disalin agar konsistensi referensi terjaga.
    if(tlMonActive_(c.aktif)&&!archivedPeriods.has(c.survey_period_id))
      for(const [role,name,pid] of [['PPL',r.ppl,ppl_id],['PML',r.pml,pml_id]]){
      if(!pid.startsWith('monitor:')||registeredIds.has(pid))continue;
      if(!unverified.has(pid))unverified.set(pid,{petugas_id:pid,nama:name,
        jumlah_assignment:0,survei:[],peran:[],jenis_id:'ALIAS_MONITORING'});
      const u=unverified.get(pid);u.jumlah_assignment++;
      if(!u.survei.includes(r.survei))u.survei.push(r.survei);
      if(!u.peran.includes(role))u.peran.push(role);
    }
    assign.push({survey_id:c.survey_id,survey_period_id:c.survey_period_id,
      assignment_id:id.assignment_id,survei:r.survei,nama_assignment:r.nama_assignment,
      status:tlMonStatus_(r.status_asli||r.status),status_asli:r.status_asli||r.status,
      ppl_id,ppl:r.ppl,pml_id,pml:r.pml,waktu_data_monitoring:update});
  });
  const surveys=config.map(c=>{
    const p=perMap.get(c.survey_period_id);
    if(!p)throw Error('Periode '+c.name+' belum ada di periode_survei.');
    return {survey_id:c.survey_id,survey_period_id:c.survey_period_id,kode_survei:c.code,
      nama_survei:c.name,nama_periode:p.nama_periode||c.name,
      tanggal_mulai:p.tanggal_mulai||c.tanggal_mulai||'',
      tanggal_selesai:p.tanggal_selesai||c.tanggal_selesai||'',
      waktu_data_monitoring:update,aktif:tlMonActive_(c.aktif)};
  });
  return {surveys,assignments:assign,unverified:[...unverified.values()],
    update,checksum:tlMonDigest_(JSON.stringify({surveys,assign}))};
}
function tlMonSummary_(plan,db){
  const prior=new Map(read_(db,'survei').map(r=>[r.survey_period_id,r]));
  return {waktu_monitoring:plan.update,
    survei_aktif:plan.surveys.filter(x=>x.aktif).length,
    assignment:plan.assignments.length,
    survei_baru:plan.surveys.filter(x=>x.aktif&&!prior.has(x.survey_period_id)).map(x=>x.nama_survei),
    periode_ditutup:plan.surveys.filter(x=>prior.get(x.survey_period_id)?.status_operasional==='DITUTUP').map(x=>x.nama_survei),
    calon_petugas:plan.unverified.length,
    kandidat:plan.unverified.slice(0,80)};
}
function apiPratinjauSinkronMonitoring(token){
  session_(token,true);
  const db=db_();return tlMonSummary_(tlMonBuild_(SpreadsheetApp.openById(TL_MON.id),db),db);
}
function tlMonWrite_(db,tab,headers,rows){
  const sh=db.getSheetByName(tab);if(!sh)throw Error('Tab tujuan '+tab+' tidak ditemukan.');
  const existing=sh.getRange(1,1,1,headers.length).getDisplayValues()[0].map(tlMonText_);
  if(JSON.stringify(existing)!==JSON.stringify(headers))throw Error('Header '+tab+' tidak sesuai.');
  const len=rows.length+1,last=sh.getLastRow();
  if(len>sh.getMaxRows())sh.insertRowsAfter(sh.getMaxRows(),len-sh.getMaxRows());
  if(last>1)sh.getRange(2,1,last-1,headers.length).clearContent();
  if(rows.length)sh.getRange(2,1,rows.length,headers.length).setNumberFormat('@')
    .setValues(rows.map(r=>headers.map(c=>safe_(r[c]))));
}
/**
 * Satu mesin sinkronisasi untuk permintaan Admin dan pemeriksaan otomatis.
 * Tidak pernah dipanggil dari endpoint publik; pembungkus API memvalidasi
 * sesi Admin, sedangkan pemicu waktu berjalan dengan izin pemilik skrip.
 */
function tlMonSyncInternal_(){
    const db=db_(),plan=tlMonBuild_(SpreadsheetApp.openById(TL_MON.id),db);
    const report=tlMonSummary_(plan,db);
    const props=PropertiesService.getScriptProperties();
    if(props.getProperty(TL_MON.prop)===plan.checksum)return {...report,success:true,berubah:false};
    const sHeaders=['survey_id','survey_period_id','kode_survei','nama_survei','nama_periode',
      'tanggal_mulai','tanggal_selesai','waktu_data_monitoring'];
    const aHeaders=['survey_id','survey_period_id','assignment_id','survei','nama_assignment','status',
      'status_asli','ppl_id','ppl','pml_id','pml','waktu_data_monitoring'];
    // Validasi semua header dan kecocokan sebelum menulis apa pun.
    for(const [tab,headers] of [['sumber_survei',sHeaders],['sumber_assignment',aHeaders]]){
      const sh=db.getSheetByName(tab);
      if(!sh)throw Error('Tab tujuan '+tab+' tidak ada.');
      const current=sh.getRange(1,1,1,headers.length).getDisplayValues()[0].map(tlMonText_);
      if(JSON.stringify(current)!==JSON.stringify(headers))throw Error('Header tujuan '+tab+' tidak sesuai.');
    }
    const existing=new Map(read_(db,'survei').map(r=>[r.survey_period_id,r]));
    for(const row of plan.surveys){
      const prev=existing.get(row.survey_period_id);
      if(prev&&prev.survey_id!==row.survey_id)throw Error('Survey ID berubah untuk periode '+row.nama_survei+'. Sinkronisasi dibatalkan.');
    }
    // Backup kedua snapshot sumber, bukan catatan/riwayat atau arsip.
    const stamp=Utilities.formatDate(new Date(),'Asia/Jakarta','yyyyMMdd-HHmmss')+
      '-'+Utilities.getUuid().slice(0,5);
    for(const tab of ['sumber_assignment','sumber_survei']){
      const sh=db.getSheetByName(tab).copyTo(db);
      sh.setName(('backup_'+tab+'_'+stamp).slice(0,99));sh.hideSheet();
    }
    tlMonWrite_(db,'sumber_survei',sHeaders,plan.surveys);
    tlMonWrite_(db,'sumber_assignment',aHeaders,plan.assignments);
    for(const row of plan.surveys){
      const prev=existing.get(row.survey_period_id);
      const expected=row.aktif?'AKTIF':'NONAKTIF';
      if(!prev){
        append_(db,'survei',[{...row,status_operasional:expected}]);
      }else{
        const patch={};
        if(!['DITUTUP','PENGARSIPAN'].includes(prev.status_operasional)&&prev.status_operasional!==expected)
          patch.status_operasional=expected;
        for(const k of ['nama_survei','nama_periode','tanggal_mulai','tanggal_selesai']){
          if(row[k]&&row[k]!==prev[k])patch[k]=row[k];
        }
        if(Object.keys(patch).length)patch_(db,'survei',prev._row,patch);
      }
    }
    SpreadsheetApp.flush();
    props.setProperty(TL_MON.prop,plan.checksum);
    return {...report,success:true,berubah:true};
}
/**
 * Menjaga perilaku API lama. Setiap login Admin menjalankan sinkronisasi
 * langsung dan mencoba memasang satu pemicu pemeriksaan otomatis. Jika
 * pembuatan pemicu terkendala izin, sinkronisasi sekarang tetap berhasil.
 */
function apiSinkronMonitoring(token){
  session_(token,true);
  const report=lock_(()=>tlMonSyncInternal_());
  try{
    if(typeof tlAutoEnsure_==='function'){
      report.deteksi_otomatis=tlAutoEnsure_();
    }
  }catch(e){
    console.warn('Deteksi otomatis belum aktif: '+String(e&&e.message||e));
    report.deteksi_otomatis={aktif:false,alasan:String(e&&e.message||e)};
  }
  return report;
}
