
/* BOLO INPEK · Visualisasi status petugas — berbasis data monitoring asli. */
const biView={
  mode:'grafik',pml:'',ppl:'',
  markFilter:'all',
  units:{survey:'persentase',overview:'persentase',pml:'persentase',ppl:'persentase',report:'persentase',cards:'persentase'}
};
function biUnitMode(scope){
  return biView.units[scope]==='angka'?'angka':'persentase';
}
function biUnitText(n,total,scope){
  const left=format.format(n),right=format.format(total);
  if(biUnitMode(scope)==='angka')return left+' dari '+right;
  return (total?percent(n,total):'—')+' ('+left+'/'+right+')';
}
function biUnitControl(scope){
  return '<span class="bi-unit-toggle" role="group" aria-label="Tampilan capaian dalam angka atau persentase">'+
    [['angka','Angka'],['persentase','Persentase']].map(item=>{
      const value=item[0],label=item[1],selected=biUnitMode(scope)===value;
      return '<button type="button" data-bi-unit="'+value+'" data-bi-scope="'+scope+
        '" class="'+(selected?'selected':'')+'" aria-pressed="'+selected+'">'+label+'</button>';
    }).join('')+'</span>';
}
const biBuckets=[
  {id:'open',label:'OPEN',color:'#e9a4ad'},
  {id:'draft',label:'DRAFT',color:'#f4c6d2'},
  {id:'sent',label:'SUBMITTED',color:'#8cbcf0'},
  {id:'approvedStage',label:'APPROVED',color:'#9ad9a5'},
  {id:'rejected',label:'REJECTED',color:'#f6dc85'},
  {id:'revoked',label:'REVOKED',color:'#f7bd90'},
  {id:'completed',label:'COMPLETED',color:'#72cdbb'},
  {id:'other',label:'LAINNYA',color:'#c7d3df'}
];
const BI_STATUS_COLORS={
  'OPEN':'#e79ba9',
  'DRAFT':'#f1c5d1',
  'SUBMITTED BY PENCACAH':'#86b5ef',
  'REVOKED BY PENGAWAS':'#eeaa77',
  'APPROVED BY PENGAWAS':'#8fd3a3',
  'REJECTED BY PENGAWAS':'#f2d06e',
  'REVOKED BY ADMIN KABUPATEN':'#dc907e',
  'APPROVED BY ADMIN KABUPATEN':'#66c3a3',
  'REJECTED BY ADMIN KABUPATEN':'#d5af69',
  'COMPLETED BY ADMIN KABUPATEN':'#55b9b6',
  'REVOKED BY ADMIN PROVINSI':'#b5a1dc',
  'APPROVED BY ADMIN PROVINSI':'#80b3bd',
  'REJECTED BY ADMIN PROVINSI':'#d3a3b6',
  'COMPLETED BY ADMIN PROVINSI':'#789fca',
  'STATUS TIDAK TERSEDIA':'#b7c6d7',
  'STATUS BELUM DIRINCI':'#a4b5c9'
};
const BI_STATUS_PRIORITY=Object.keys(BI_STATUS_COLORS);
function biRawCode(value){
  return String(value||'').trim().replace(/\s+/g,' ').toUpperCase()||'STATUS TIDAK TERSEDIA';
}
function biStatusColor(status){
  const code=biRawCode(status);
  if(Object.prototype.hasOwnProperty.call(BI_STATUS_COLORS,code))return BI_STATUS_COLORS[code];
  // New FASIH stages are visually distinct yet remain muted; stable across refreshes.
  let hash=2166136261;
  for(const ch of code){hash^=ch.charCodeAt(0);hash=Math.imul(hash,16777619);}
  const hue=((hash>>>0)*137.508)%360;
  const sat=49+((hash>>>8)&7);
  const light=70+((hash>>>16)&7);
  return 'hsl('+hue.toFixed(1)+' '+sat+'% '+light+'%)';
}
function biRawStatusStats(rows){
  const raw=new Map();
  rows.forEach(row=>{
    const code=biRawCode(row.status);
    raw.set(code,(raw.get(code)||0)+1);
  });
  return [...raw].sort(([a],[b])=>{
    const pa=BI_STATUS_PRIORITY.indexOf(a),pb=BI_STATUS_PRIORITY.indexOf(b);
    return (pa<0?BI_STATUS_PRIORITY.length:pa)-(pb<0?BI_STATUS_PRIORITY.length:pb)||
      a.localeCompare(b,'id');
  }).map(([label,count])=>({label,count,color:biStatusColor(label)}));
}
function biStatusBucket(value){
  const s=String(value||'').trim().toUpperCase();
  if(s==='OPEN')return 'open';
  if(s==='DRAFT')return 'draft';
  if(s.startsWith('SUBMITTED'))return 'sent';
  if(s.startsWith('APPROVED'))return 'approvedStage';
  if(s.startsWith('REJECTED'))return 'rejected';
  if(s.startsWith('REVOKED'))return 'revoked';
  if(s.startsWith('COMPLETED'))return 'completed';
  return 'other';
}
function biIsSubmittedBucket(bucket){
  return ['sent','approvedStage','rejected','revoked','completed'].includes(bucket);
}
function biRejectedByPengawas(status){
  // REJECTED BY PENGAWAS masih harus diperbaiki dan dikirim ulang PPL.
  return String(status||'').trim().replace(/\s+/g,' ').toUpperCase()
    .startsWith('REJECTED BY PENGAWAS');
}
function biIsSubmittedStatus(status){
  return biIsSubmittedBucket(biStatusBucket(status))&&!biRejectedByPengawas(status);
}
function biCounts(rows){
  // Kategori warna tetap mengikuti status asli; indikator Belum/Sudah Submit
  // mengikuti tindak lanjut yang diperlukan (REJECTED BY PENGAWAS belum submit).
  const result=Object.fromEntries(biBuckets.map(b=>[b.id,0]));
  let rejectedByPengawas=0;
  for(const row of rows){
    result[biStatusBucket(row.status)]++;
    if(biRejectedByPengawas(row.status))rejectedByPengawas++;
  }
  result.rejectedByPengawas=rejectedByPengawas;
  result.pending=result.open+result.draft+rejectedByPengawas;
  result.approved=result.approvedStage+result.completed;
  result.revision=result.rejected+result.revoked;
  result.submitted=result.sent+result.approved+result.revision-rejectedByPengawas;
  return result;
}

function biUnassigned(value){
  const normal=x=>String(x||'').normalize('NFC').trim().replace(/\s+/g,' ').toLowerCase();
  return !normal(value.ppl)||!normal(value.pml)||
    ['belum dialokasikan','belum ditetapkan'].includes(normal(value.ppl))||
    ['belum dialokasikan','belum ditetapkan'].includes(normal(value.pml));
}
function biMarkComposite(row){
  const norm=x=>String(x||'').normalize('NFC').trim().replace(/\s+/g,' ').toLowerCase();
  return JSON.stringify([norm(row.survei),norm(row.nama_assignment)]);
}
async function biMarkHash(composite){
  if(!crypto?.subtle||typeof TextEncoder==='undefined'){
    throw new Error('Browser ini tidak mendukung verifikasi SHA-256 penanda.');
  }
  const input=new TextEncoder().encode(composite);
  const digest=await crypto.subtle.digest('SHA-256',input);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function biApplyMarkers(rows,marks){
  const sources=rows.map(row=>({...row,boloMark:null,boloExcluded:false,
    boloStatusManual:'',boloStatusFasih:row.status}));
  if(!marks.length)return sources;
  const candidates=new Map();
  sources.forEach(row=>{
    if(!biUnassigned(row))return;
    const key=biMarkComposite(row);
    if(!candidates.has(key))candidates.set(key,[]);
    candidates.get(key).push(row);
  });
  const lookup=new Map(marks.map(mark=>[mark.id,mark]));
  for(const [composite,items] of candidates){
    // Nama ganda tidak boleh dikecualikan berdasarkan tebakan.
    if(items.length!==1)continue;
    const hash=await biMarkHash(composite);
    const mark=lookup.get(hash);
    if(!mark)continue;
    items[0].boloMark=mark;
    // Pengecualian hanya berlaku jika server sudah mengonfirmasi bahwa
    // status FASIH masih sama. Status berubah -> ikut status asli FASIH.
    items[0].boloExcluded=mark.dihitung===false&&mark.berlaku===true;
    // Status FASIH tetap asli pada ALL_ASSIGNMENTS dan tab monitoring.
    // Hanya DATA turunan untuk grafik yang memakai status manual.
    const manual=String(mark.status_perhitungan||'').toUpperCase().trim();
    items[0].boloStatusManual=mark.dihitung&&mark.berlaku&&
      /^(OPEN|DRAFT|SUBMITTED BY |APPROVED BY |REJECTED BY |REVOKED BY |COMPLETED BY )/.test(manual)
      ?manual:'';
  }
  return sources;
}


function biMarkRows(survey){
  return ALL_ASSIGNMENTS.filter(row=>(!survey||row.survei===survey)&&biUnassigned(row));
}
function biMarkTotals(rows){
  return {
    all:rows.length,
    excluded:rows.filter(r=>r.boloExcluded).length,
    included:rows.filter(r=>!r.boloExcluded).length,
    review:rows.filter(r=>r.boloMark?.perlu_tinjau).length,
    unmarked:rows.filter(r=>!r.boloMark).length
  };
}
function biUnassignedPanel(survey){
  const rows=biMarkRows(survey);
  if(!rows.length)return '';
  const t=biMarkTotals(rows);
  return '<section class="bi-unassigned-panel'+(t.unmarked||t.review?' needs-attention':' all-reviewed')+'" id="bi-unassigned-panel">'+
    '<div class="bi-unassigned-header"><div>'+
    ''+
    '<h2>Penanda Assignment Belum Dialokasikan</h2>'+
    '<p>Assignment tanpa PPL/PML tidak otomatis dikecualikan.</p>'+
    '</div><button type="button" class="bi-mark-button" data-bi-show-marks>'+
    '☷ Lihat Assignment</button></div>'+
    '<div class="bi-unassigned-stats" role="group" aria-label="Ringkasan penanda assignment">'+
    '<div class="bi-mark-stat bi-stat-unassigned"><span>Belum Dialokasikan</span>'+
      '<strong>'+format.format(t.all)+'</strong></div>'+
    '<button type="button" class="bi-mark-stat bi-mark-stat-link bi-stat-excluded" data-bi-open-mark-filter="excluded"'+
      ' aria-label="Lihat '+format.format(t.excluded)+' assignment Tidak Dihitung">'+
      '<span>Tidak Dihitung</span><strong>'+format.format(t.excluded)+'</strong>'+
      '</button>'+
    '<div class="bi-mark-stat bi-stat-unmarked'+(t.unmarked?' has-pending':' is-complete')+'">'+
      '<span>Belum Ditandai</span><strong>'+format.format(t.unmarked)+'</strong>'+
      '</div>'+
    (t.review?'<button type="button" class="bi-mark-stat bi-mark-stat-link bi-stat-review" data-bi-open-mark-filter="review"'+
      ' aria-label="Lihat '+format.format(t.review)+' assignment Perlu Tinjau Ulang">'+
      '<span>Perlu Tinjau Ulang</span><strong>'+format.format(t.review)+'</strong>'+
      '</button>':'')+
    '</div>'+
    (!MARKERS_AVAILABLE?'<div class="bi-mark-notice" role="status">'+
      'Penanda bersama belum aktif. Seluruh assignment tetap dihitung. '+
      '<button type="button" class="bi-mark-activate-btn" data-bi-activation-help>Lihat Cara Mengaktifkan</button>'+
      '</div>':'')+
    ''+
    '</section>';
}
function biMarkListContent(survey){
  const rows=biMarkRows(survey);
  const totals=biMarkTotals(rows);
  const options=[
    {id:'all',label:'Semua',count:totals.all},
    {id:'excluded',label:'Tidak Dihitung',count:totals.excluded},
    {id:'included',label:'Dihitung',count:totals.included},
    {id:'review',label:'Perlu Tinjau',count:totals.review},
    {id:'unmarked',label:'Belum Ditandai',count:totals.unmarked}
  ];
  const filter=options.some(item=>item.id===biView.markFilter)?biView.markFilter:'all';
  const selected=options.find(item=>item.id===filter);
  const subset=rows.filter(row=>
    filter==='all'||(filter==='excluded'&&row.boloExcluded)||
    (filter==='included'&&!row.boloExcluded)||
    (filter==='review'&&row.boloMark?.perlu_tinjau)||
    (filter==='unmarked'&&!row.boloMark));
  const duplicates=new Map();
  for(const row of rows){
    const key=biMarkComposite(row);
    duplicates.set(key,(duplicates.get(key)||0)+1);
  }
  const ordered=subset.slice().sort((a,b)=>
    Number(!!b.boloExcluded)-Number(!!a.boloExcluded)||
    a.survei.localeCompare(b.survei,'id')||
    a.nama_assignment.localeCompare(b.nama_assignment,'id'));
  const buttons=options.map(item=>
    '<button type="button" data-bi-mark-filter="'+item.id+'" class="bi-mark-filter'+
    (filter===item.id?' selected':'')+(item.id==='excluded'?' excluded':'')+
    '" aria-pressed="'+(filter===item.id)+'">'+
    esc(item.label)+' <strong>'+format.format(item.count)+'</strong></button>'
  ).join('');
  const tableRows=ordered.length?ordered.map(row=>{
    const mark=row.boloMark;
    const status=row.boloExcluded?'Tidak Dihitung':
      mark?.perlu_tinjau?'Perlu Tinjau · Ikuti FASIH':
      mark?'Tetap Dihitung':'Belum Ditandai · Dihitung';
    const note=mark?[mark.alasan,mark.catatan].filter(Boolean).join(' — '):'Belum ada catatan';
    const duplicated=duplicates.get(biMarkComposite(row))!==1;
    const disabled=duplicated?' disabled title="Nama assignment ganda; perlu ID unik"':'';
    const button=MARKERS_AVAILABLE?
      ' data-bi-mark-survey="'+esc(row.survei)+'" data-bi-mark-assignment="'+esc(row.nama_assignment)+'"':
      ' data-bi-activation-help';
    return '<tr><td>'+esc(row.survei)+'</td><td>'+esc(row.nama_assignment)+'</td>'+
      '<td>'+esc(row.status)+'</td>'+
      '<td>'+esc(row.boloExcluded?'Tidak Dihitung':row.boloStatusManual?
        row.boloStatusManual+' (Manual)':row.status+' (FASIH)')+'</td>'+
      '<td><span class="bi-mark-state'+(row.boloExcluded?' off':'')+'">'+esc(status)+'</span></td>'+
      '<td>'+esc(note)+'</td>'+
      '<td><button type="button" class="bi-mark-row-btn"'+button+disabled+
      ' aria-label="'+esc('Atur penanda '+row.nama_assignment)+'">'+
      (duplicated?'Nama Ganda':MARKERS_AVAILABLE?'Atur Penanda':'Aktifkan Penanda')+
      '</button></td></tr>';
  }).join(''):'<tr><td colspan="7" class="bi-mark-no-rows">'+
    (filter==='excluded'?'Belum ada assignment yang ditandai Tidak Dihitung.':
     filter==='review'?'Tidak ada penanda yang perlu ditinjau ulang.':
     filter==='unmarked'?'Seluruh assignment sudah ditandai.':
     'Tidak ada assignment pada pilihan ini.')+'</td></tr>';
  return '<div class="bi-mark-modal-intro"><p>'+
    (survey?'Survei '+esc(survey)+' · ':'Seluruh Survei · ')+
    format.format(totals.all)+' assignment Belum Dialokasikan</p>'+
    '<p>Pilih kategori untuk melihat rincian. Penanda tidak mengubah status asli FASIH.</p></div>'+
    '<div class="bi-mark-filters" role="group" aria-label="Filter penanda assignment">'+buttons+'</div>'+
    '<p class="bi-mark-filter-caption">Menampilkan '+format.format(ordered.length)+
    ' dari '+format.format(totals.all)+' assignment · '+esc(selected.label)+'</p>'+
    (!MARKERS_AVAILABLE?'<p class="bi-mark-notice">Layanan penanda belum aktif. '+
      '<button type="button" class="bi-mark-activate-btn" data-bi-activation-help>Lihat Aktivasi</button></p>':'')+
    '<div class="tablebox bi-mark-modal-tablebox"><table class="bi-unassigned-table">'+
    '<thead><tr><th>Survei</th><th>Assignment</th><th>Status FASIH Asli</th>'+
    '<th>Status Perhitungan</th><th>Perlakuan</th><th>Alasan / Catatan</th>'+
    '<th>Tindakan</th></tr></thead><tbody>'+tableRows+'</tbody></table></div>'+
    '<p class="bi-mark-footnote">Klik <b>Atur Penanda</b> pada assignment untuk membuka formulir di pop-up kedua. '+
    'Pop-up daftar ini tetap terbuka dan filter tidak direset. Setelah menyimpan, '+
    'gunakan <b>Muat Ulang Data</b> di dashboard hanya bila ingin menyinkronkan perubahan.</p>';
}


function biSurveyList(){return surveiUrutDeadline().filter(surveiMasihAktif);}
function biBar(rows,label){
  const states=biRawStatusStats(rows);
  const segments=states.map(status=>{
    if(!status.count||!rows.length)return '';
    const width=(status.count/rows.length*100).toFixed(3);
    return '<span class="bi-seg" style="width:'+width+'%;background:'+status.color+
      '" title="'+esc(status.label+': '+status.count)+'"></span>';
  }).join('');
  return '<span class="bi-stack" role="img" aria-label="'+esc(label+' — '+
    states.map(s=>s.label+': '+s.count).join('; '))+'">'+segments+'</span>';
}
function biLegend(rows){
  const states=biRawStatusStats(rows||DATA);
  return '<div class="bi-legend bi-legend-raw" role="list" aria-label="Legenda status FASIH">'+
    states.map(s=>'<span role="listitem" title="'+esc(s.label)+'"><i style="background:'+s.color+
      '"></i>'+esc(s.label)+'</span>').join('')+'</div>';
}
function biSummarySurveyList(){
  // Ranking utama: belum 100% di kiri, sudah 100% di kanan.
  // Dalam setiap kelompok tetap mengikuti tanggal akhir, tanggal mulai,
  // lalu urutan daftar survei yang sudah ditetapkan di surveiUrutDeadline().
  const base=biSurveyList();
  const totalBySurvey=new Map();
  for(const row of DATA){
    if(!totalBySurvey.has(row.survei))totalBySurvey.set(row.survei,{total:0,submitted:0});
    const stats=totalBySurvey.get(row.survei);
    stats.total++;
    if(biIsSubmittedStatus(row.status))stats.submitted++;
  }
  return base.slice().sort((a,b)=>{
    const first=totalBySurvey.get(a),second=totalBySurvey.get(b);
    const aDone=!!first&&first.total>0&&first.submitted===first.total;
    const bDone=!!second&&second.total>0&&second.submitted===second.total;
    return Number(aDone)-Number(bDone);
  });
}
function biSummary(){
  const surveys=biSummarySurveyList();
  const activeRows=DATA.filter(r=>surveys.includes(r.survei));
  const submitted=biCounts(activeRows).submitted;
  const denominator=activeRows.length;
  return '<section class="bi-summary" aria-labelledby="bi-summary-h">'+
    '<div class="bi-head"><div><div class="bi-eyebrow">RINGKASAN MONITORING</div><h2 id="bi-summary-h">Capaian Sudah Submit per Survei</h2></div>'+
    '<div class="bi-summary-actions"><span class="bi-county-total '+(denominator?(submitted===denominator?'is-success':submitted/denominator>=0.8?'is-warning':'is-danger'):'is-empty')+'"><strong>'+
    (denominator?percent(submitted,denominator):'—')+'</strong>'+
    '<span>'+format.format(submitted)+' dari '+format.format(denominator)+' assignment sudah submit · Kabupaten</span></span>'+
    (state.survey===null?'':'<button class="bi-back-all" type="button" data-level="home" data-value="">← Semua Survei</button>')+
    '</div></div>'+
    '<div class="bi-summary-tip" role="note"><span class="bi-summary-tip-icon" aria-hidden="true">✦</span>'+
      '<span><strong>Pilih survei</strong> untuk membuka progresnya.</span></div>'+
    '<div class="bi-summary-grid">'+(surveys.map(survey=>{
      const rows=DATA.filter(r=>r.survei===survey),submitted=biCounts(rows).submitted;
      const rate=rows.length?submitted/rows.length*100:null;
      const level=rate===null?'is-empty':rate>=100?'is-success':rate>=80?'is-warning':'is-danger';
      return '<button type="button" class="bi-summary-tile '+level+(state.survey===survey?' selected':'')+
        '" data-level="survey" data-value="'+esc(survey)+'">'+
        '<span class="bi-summary-name">'+esc(survey)+'</span>'+
        '<span class="bi-summary-num">'+(rows.length?percent(submitted,rows.length):'—')+'</span>'+
        '<span class="bi-summary-meta">'+format.format(submitted)+' dari '+format.format(rows.length)+' assignment Sudah Submit</span>'+ 
        '<span class="bi-summary-track"><span style="width:'+(rows.length?Math.min(100,submitted/rows.length*100):0)+'%"></span></span></button>';
    }).join('')||'<p class="bi-empty">Belum ada survei aktif.</p>')+'</div>'+
    ((ALL_ASSIGNMENTS.length-DATA.length)>0?'<p class="bi-footnote bi-exclusion-note">'+format.format(ALL_ASSIGNMENTS.length-DATA.length)+' assignment Tidak Dihitung.</p>':'')+
    '<p class="bi-method-note" role="note"><strong>Dasar perhitungan:</strong> '+
    '<strong>Belum Submit</strong> = OPEN, DRAFT, dan REJECTED BY PENGAWAS (perlu dikirim ulang). '+
    '<strong>Sudah Submit</strong> = SUBMITTED, APPROVED, COMPLETED, REVOKED, serta REJECTED selain oleh pengawas. '+
    'Status LAINNYA tidak otomatis dihitung; assignment bertanda Tidak Dihitung dikecualikan dari total.</p></section>';
}
function biCompareProgress(a,b,mode){
  // Prioritas utama: Sudah Submit; jika sama: status APPROVED saja (COMPLETED terpisah).
  // Tombol Angka membandingkan jumlah, tombol Persentase membandingkan rasio.
  const submittedRatio=b.submitted*a.total-a.submitted*b.total;
  const approvedRatio=b.approved*a.total-a.approved*b.total;
  const submittedCount=b.submitted-a.submitted;
  const approvedCount=b.approved-a.approved;
  return mode==='persentase'
    ?submittedRatio||approvedRatio||submittedCount||approvedCount
    :submittedCount||approvedCount||submittedRatio||approvedRatio;
}
function biRoleNames(rows,key,scope=key){
  const groups=new Map();
  rows.forEach(row=>{
    const person=name(row,key);
    if(!groups.has(person))groups.set(person,[]);
    groups.get(person).push(row);
  });
  const scores=new Map([...groups].map(([person,group])=>{
    const score=biCounts(group);
    return [person,{total:group.length,submitted:score.submitted,approved:score.approvedStage}];
  }));
  return [...groups.keys()].sort((a,b)=>{
    if(a===UNASSIGNED&&b!==UNASSIGNED)return 1;
    if(b===UNASSIGNED&&a!==UNASSIGNED)return -1;
    return biCompareProgress(scores.get(a),scores.get(b),biUnitMode(scope))||
      a.localeCompare(b,'id');
  });
}
function biRoleContent(rows,key){
  const names=biRoleNames(rows,key);
  if(!names.length)return '<div class="bi-empty">Tidak ada assignment untuk petugas atau filter yang dipilih.</div>';
  const metric='submitted';
  const metricName='Sudah Submit';
  if(biView.mode==='tabel'){
    const body=names.map(person=>{
      const group=rows.filter(r=>name(r,key)===person),c=biCounts(group);
      return '<tr><td><button class="bi-link" data-level="'+key+'" data-value="'+esc(person)+'">'+esc(person)+' →</button></td>'+
        '<td>'+group.length+'</td><td><strong>'+biUnitText(c[metric],group.length,key)+'</strong></td>'+
        biBuckets.map(b=>'<td>'+c[b.id]+'</td>').join('')+'</tr>';
    }).join('');
    return '<div class="tablebox"><table class="bi-table"><thead><tr><th>'+key.toUpperCase()+'</th><th>Total</th>'+
      '<th>'+metricName+' ↓</th>'+
      biBuckets.map(b=>'<th>'+esc(b.label)+'</th>').join('')+'</tr></thead><tbody>'+body+'</tbody></table></div>';
  }
  return '<div class="bi-bars">'+names.map(person=>{
    const group=rows.filter(r=>name(r,key)===person),counts=biCounts(group);
    return '<button type="button" class="bi-bar-row" data-level="'+key+'" data-value="'+esc(person)+'">'+
      '<span class="bi-name">'+esc(person)+'</span>'+biBar(group,person)+
      '<span class="bi-row-stat"><strong>'+biUnitText(counts[metric],group.length,key)+'</strong>'+
      '<span>Sudah Submit · APPROVED: '+counts.approvedStage+'</span></span></button>';
  }).join('')+'</div>';
}
function biPanel(rows,key){
  const label=key==='pml'?'Pengawas / PML':'Pencacah / PPL';
  const rank='Sudah Submit';
  const orderLabel=biUnitMode(key)==='persentase'
    ?'Persentase '+rank+' tertinggi, lalu APPROVED jika sama.'
    :'Jumlah '+rank+' terbanyak, lalu APPROVED jika sama.';
  return '<section class="bi-panel"><div class="bi-role-head"><div><h2>Progres '+label+'</h2>'+
    '<small>Urutan: '+orderLabel+'</small></div>'+
    '<div class="bi-panel-tools"><small>'+biRoleNames(rows,key).length+' petugas</small>'+
    biUnitControl(key)+'</div></div>'+
    biRoleContent(rows,key)+biLegend(rows)+'</section>';
}
function biKpis(rows){
  const c=biCounts(rows);
  // Setiap kartu memiliki kelas warna khusus, tanpa mengubah perhitungan FASIH.
  const items=[
    ['Total Assignment',rows.length,'','total'],
    ['Belum Submit',c.pending,'OPEN / DRAFT / REJECTED PENGAWAS','pending'],
    ['Sudah Submit',c.submitted,'','submitted'],
    ['REJECTED',c.rejected,'','rejected']
  ];
  return '<div class="bi-kpis">'+items.map(([label,n,note,kind])=>
    '<div class="bi-kpi bi-kpi-'+kind+'">'+
      '<span>'+label+'</span><strong>'+format.format(n)+'</strong>'+
      (note?'<small>'+note+'</small>':'')+'</div>').join('')+'</div>';
}
function biControls(rows){
  const pmls=biRoleNames(rows,'pml');
  if(biView.pml&&!pmls.includes(biView.pml))biView.pml='';
  const pplBase=biView.pml?rows.filter(r=>name(r,'pml')===biView.pml):rows;
  const ppls=biRoleNames(pplBase,'ppl');
  if(biView.ppl&&!ppls.includes(biView.ppl))biView.ppl='';
  const options=(key,people)=>'<label>Filter '+key.toUpperCase()+'<select data-bi-person="'+key+'"><option value="">Semua '+key.toUpperCase()+'</option>'+
    people.map(person=>'<option value="'+esc(person)+'"'+(biView[key]===person?' selected':'')+'>'+esc(person)+'</option>').join('')+'</select></label>';
  return '<div class="bi-select-row"><div class="selectors">'+options('pml',pmls)+options('ppl',ppls)+'</div>'+
    '<div class="bi-toggle" role="group" aria-label="Tampilan data">'+[['grafik','Grafik'],['tabel','Tabel']].map(([value,label])=>
      '<button type="button" data-bi-mode="'+value+'" class="'+(biView.mode===value?'selected':'')+'" aria-pressed="'+(biView.mode===value)+'">'+label+'</button>').join('')+
    '</div></div>';
}
function biSurveyDashboard(survey){
  const all=DATA.filter(r=>r.survei===survey);
  const count=biCounts(all);
  // Diagram utama dan bar progres memakai warna spesifik tiap status FASIH.
  const statusRows=biRawStatusStats(all);
  let position=0;
  const slices=[];
  for(const item of statusRows){
    if(!all.length||!item.count)continue;
    const next=position+item.count/all.length*100;
    slices.push(item.color+' '+position+'% '+next+'%');
    position=next;
  }
  const donutColor=slices.length?'conic-gradient('+slices.join(',')+')':'#e3ecf6';
  const head='<section class="bi-survey-head card bi-survey-hero" aria-label="Ringkasan progres '+esc(survey)+'">'+
    '<div class="bi-survey-layout">'+
      '<div class="bi-survey-main">'+
        '<div class="bi-survey-heading">'+
          '<div class="bi-survey-heading-text">'+
            '<span class="bi-survey-eyebrow">PROGRES SURVEI</span>'+
            '<h1 tabindex="-1">Progres '+esc(survey)+'</h1>'+
            '<div class="bi-survey-period-row">'+periodeHtml(survey)+'</div>'+
          '</div>'+
          '<div class="bi-survey-assignment-chip" aria-label="'+format.format(all.length)+' assignment">'+
            '<strong>'+format.format(all.length)+'</strong><span>Assignment</span></div>'+
        '</div>'+
        '<div class="bi-survey-progress-group">'+
          '<div class="bi-survey-progress-heading"><strong>Komposisi Status FASIH</strong>'+
            '<span>'+format.format(statusRows.length)+' status tercatat</span></div>'+
          '<div class="bi-survey-fullbar">'+biBar(all,'Komposisi status FASIH '+survey)+'</div>'+
        '</div>'+
        '<div class="bi-head-actions">'+exportButtons(survey)+tombolTindakLanjut(survey)+
          '<p class="export-feedback" role="status" aria-live="polite"></p></div>'+
      '</div>'+
      '<div class="bi-survey-donut-panel">'+
        biUnitControl('survey')+
        '<div class="bi-donut" style="background:'+donutColor+'"><div class="bi-donut-center">'+
          '<strong>'+(biUnitMode('survey')==='persentase'?(all.length?percent(count.submitted,all.length):'—'):format.format(count.submitted))+'</strong>'+
          '<small>Sudah Submit</small>'+
          '<span>'+format.format(count.submitted)+' / '+format.format(all.length)+'</span>'+
        '</div></div>'+
      '</div>'+
    '</div>'+
    '<div class="bi-survey-hero-legend">'+biLegend(all)+'</div>'+
  '</section>';
  return head+biKpis(all)+biProgressNavigation(survey,all)+biPplDetailPanel(survey);
}
function biProgressNavigation(survey,rows){
  const ppl=biRoleNames(rows,'ppl').length,pml=biRoleNames(rows,'pml').length;
  const pairs=biPplPmlPairs(rows,'report').length;
  const cards=[
    {view:'ppl',title:'Progres per PPL',count:ppl+' PPL',icon:'◉'},
    {view:'pml',title:'Progres per PML',count:pml+' PML',icon:'◎'},
    {view:'by-pml',title:'PPL menurut PML',count:pairs+' pasangan',icon:'▦'}
  ];
  return '<nav class="bi-progress-navigation" aria-label="Pilihan tampilan progres">'+cards.map(card=>
    '<button type="button" class="bi-progress-nav-card bi-nav-'+card.view+
      '" data-bi-popup-nav="'+card.view+'" data-bi-popup-survey="'+esc(survey)+'">'+
      '<span class="bi-nav-icon" aria-hidden="true">'+card.icon+'</span>'+
      '<span class="bi-nav-copy"><strong>'+card.title+'</strong></span>'+
      '<span class="bi-nav-count">'+card.count+'</span>'+
      '<span class="bi-nav-arrow" aria-hidden="true">↗</span></button>'
  ).join('')+'</nav>'+
  '';
}
function biOverview(){
  // Gunakan urutan identik dengan kartu ringkasan: belum 100% dahulu,
  // lalu survei selesai; dalam tiap kelompok tetap mengikuti urutan periode.
  const surveys=biSummarySurveyList();
  return '<div class="bi-panel"><div class="bi-role-head"><h2>Grafik Progres Seluruh Survei</h2>'+
    '<div class="bi-panel-tools"><small>Pilih survei untuk membuka PML/PPL</small>'+
    biUnitControl('overview')+'</div></div>'+
    '<div class="bi-bars">'+surveys.map(survey=>{
      const rows=DATA.filter(r=>r.survei===survey),submitted=biCounts(rows).submitted;
      return '<button class="bi-bar-row" data-level="survey" data-value="'+esc(survey)+'">'+
        '<span class="bi-name">'+esc(survey)+'</span>'+biBar(rows,survey)+
        '<span class="bi-row-stat"><strong>'+biUnitText(submitted,rows.length,'overview')+'</strong>'+
          '<span>Sudah Submit</span></span></button>';
    }).join('')+'</div>'+biLegend(DATA.filter(r=>surveys.includes(r.survei)))+'</div>';
}


/* Report khusus PPL: pasangan (PPL, PML) tidak boleh digabung lintas pengawas. */
function biPplPmlPairs(rows,scope='report'){
  const map=new Map();
  rows.forEach(row=>{
    const ppl=name(row,'ppl'),pml=name(row,'pml'),key=JSON.stringify([ppl,pml]);
    if(!map.has(key))map.set(key,{ppl,pml,rows:[]});
    map.get(key).rows.push(row);
  });
  return [...map.values()].sort((a,b)=>{
    const ac=biCounts(a.rows),bc=biCounts(b.rows);
    const va={total:a.rows.length,submitted:ac.submitted,approved:ac.approvedStage};
    const vb={total:b.rows.length,submitted:bc.submitted,approved:bc.approvedStage};
    return biCompareProgress(va,vb,biUnitMode(scope))||
      a.ppl.localeCompare(b.ppl,'id')||a.pml.localeCompare(b.pml,'id');
  });
}
function biExportButtons(survey,pml){
  const attrs=' data-survey="'+esc(survey)+'" data-scope="'+(pml===null?'all':'pml')+'"'+
    (pml===null?'':' data-pml="'+esc(pml)+'"');
  const target=pml===null?'semua PPL':'PPL pada PML '+pml;
  return '<span class="bi-export-buttons">'+
    '<button type="button" class="bi-export-btn" data-bi-export="png"'+attrs+
    ' aria-label="Unduh gambar progres '+esc(target)+'">▧ Gambar</button>'+
    '<button type="button" class="bi-export-btn pdf" data-bi-export="pdf"'+attrs+
    ' aria-label="Unduh PDF progres '+esc(target)+'">↓ PDF</button></span>';
}
function biPplDetailPanel(survey){
  const rows=DATA.filter(row=>row.survei===survey);
  const pairs=biPplPmlPairs(rows,'report');
  const orderText=biUnitMode('report')==='persentase'
    ?'persentase Sudah Submit tertinggi, lalu APPROVED'
    :'jumlah Sudah Submit terbanyak, lalu APPROVED';
  return '<section class="bi-panel bi-main-ppl-panel" aria-label="Rincian progres PPL dengan PML">'+
    '<div class="bi-role-head"><div><h2>Rincian Progres Seluruh PPL</h2>'+
    '<small>Urut: '+orderText+'. Pilih baris untuk rincian status.</small></div>'+
    '<div class="bi-panel-tools"><small>'+pairs.length+' pasangan PPL–PML</small>'+
    biUnitControl('report')+'</div></div>'+
    '<div class="bi-export-banner"><div><h3>Unduh Laporan PPL · '+esc(survey)+'</h3>'+
    '</div>'+
    biExportButtons(survey,null)+'<p class="bi-feedback" role="status" aria-live="polite"></p></div>'+
    '<div class="bi-inline-status-legend" id="statusLegend" role="list" aria-label="Legenda warna status FASIH"></div>'+
    (pairs.length?'<div class="tablebox"><table class="bi-ppl-table bi-ppl-summary-table"><thead><tr>'+
      '<th>PPL</th><th>Assignment</th><th>Sudah Submit ↓</th><th>APPROVED</th><th>Progres</th><th>PML</th>'+
      '</tr></thead><tbody>'+pairs.map((entry,i)=>{
        const c=biCounts(entry.rows);
        return '<tr class="bi-ppl-clickable" tabindex="0" data-bi-detail-pair="'+i+
          '" aria-label="Lihat rincian status PPL '+esc(entry.ppl)+' dengan PML '+esc(entry.pml)+'">'+
          '<td><strong>'+esc(entry.ppl)+'</strong></td>'+
          '<td>'+format.format(entry.rows.length)+'</td>'+
          '<td><strong>'+biUnitText(c.submitted,entry.rows.length,'report')+'</strong></td>'+
          '<td>'+format.format(c.approvedStage)+'</td>'+
          '<td class="bi-mini-stack">'+biBar(entry.rows,entry.ppl)+
            '<small class="bi-progress-label">'+biUnitText(c.submitted,entry.rows.length,'report')+'</small></td>'+
          '<td>'+esc(entry.pml)+'</td></tr>';
      }).join('')+'</tbody></table></div>':
      '<div class="bi-empty">Belum ada PPL untuk survei ini.</div>')+
    '</section>';
}
function biPmlCards(survey){
  const rows=DATA.filter(row=>row.survei===survey);
  const names=biRoleNames(rows,'pml','cards');
  return '<section class="bi-pml-collection"><div class="bi-role-head"><div>'+
    '<h2>Progres PPL per PML</h2><small>Urut berdasarkan Sudah Submit, lalu status APPROVED jika sama. Setiap PML bisa mengunduh laporan sendiri.</small>'+
    '</div><div class="bi-panel-tools"><small>'+names.length+' PML</small>'+
    biUnitControl('cards')+'</div></div>'+
    (names.length?'<div class="bi-pml-grid">'+names.map(pml=>{
      const group=rows.filter(row=>name(row,'pml')===pml);
      const pairs=biPplPmlPairs(group,'cards'),stats=biCounts(group);
      return '<article class="bi-pml-card"><div class="bi-pml-top"><div><strong>'+esc(pml)+'</strong>'+
        '<small>'+pairs.length+' PPL · '+group.length+' assignment</small></div>'+
        '<span class="bi-pml-count">'+biUnitText(stats.submitted,group.length,'cards')+' Sudah Submit</span></div>'+
        biBar(group,pml)+'<p class="bi-card-progress">APPROVED: <strong>'+format.format(stats.approvedStage)+
          '</strong> · COMPLETED: <strong>'+format.format(stats.completed)+'</strong></p>'+
        biExportButtons(survey,pml)+
        '<p class="bi-feedback" role="status" aria-live="polite"></p>'+
        '<details><summary>Lihat progres '+pairs.length+' PPL</summary>'+
        pairs.map(item=>{
          const n=biCounts(item.rows);
          return '<div class="bi-pml-minirow"><span>'+esc(item.ppl)+'</span>'+
            '<b>'+biUnitText(n.submitted,item.rows.length,'cards')+' Sudah Submit</b></div>';
        }).join('')+'</details></article>';
    }).join('')+'</div>':'<div class="bi-empty">Belum ada PML pada survei ini.</div>')+
    '</section>';
}

// Navigasi progres dalam pop-up: tidak mengubah filter survei di dashboard.
const biPopupState={survey:'',view:'',pml:'',focus:{},selection:null};
function biPopupScope(){return biPopupState.view==='by-pml'?'cards':biPopupState.view;}
function biPopupRows(){return DATA.filter(row=>row.survei===biPopupState.survey);}
function biPopupUnitControls(scope){
  return '<div class="bi-unit-toggle bi-popup-unit" role="group" aria-label="Satuan progres pop-up">'+
    [['angka','Angka'],['persentase','Persentase']].map(([mode,label])=>
      '<button type="button" data-bi-popup-unit="'+mode+'" data-bi-popup-scope="'+scope+
      '" class="'+(biUnitMode(scope)===mode?'selected':'')+
      '" aria-pressed="'+(biUnitMode(scope)===mode)+'">'+label+'</button>'
    ).join('')+'</div>';
}
function biPopupGroupButton(title,rows,scope,attrs,meta){
  const count=biCounts(rows),total=rows.length;
  return '<button class="bi-popup-group" type="button" '+attrs+'>'+
    '<span class="bi-popup-group-top"><strong>'+esc(title)+'</strong>'+
      '<b>'+biUnitText(count.submitted,total,scope)+'</b></span>'+
    '<span class="bi-popup-group-meta">'+(meta?esc(meta)+' · ':'')+'APPROVED '+count.approvedStage+' / '+total+'</span>'+biBar(rows,title)+'</button>';
}
function biPopupPaint(){
  const view=biPopupState.view,survey=biPopupState.survey,rows=biPopupRows();
  const key=view==='ppl'?'ppl':'pml',scope=biPopupScope();
  const title=view==='ppl'?'Progres per PPL':view==='pml'?'Progres per PML':'PPL menurut PML';
  document.getElementById('biProgressTitle').textContent=title+' · '+survey;
  const names=biRoleNames(rows,key,scope);
  let content='<div class="bi-popup-toolbar"><span>'+names.length+' '+(key==='ppl'?'PPL':'PML')+
    '</span>'+biPopupUnitControls(scope)+'</div>';
  if(!names.length)content+='<div class="bi-empty">Belum ada assignment untuk pilihan ini.</div>';
  else{
    content+='<div class="'+(view==='by-pml'?'bi-popup-group-grid':'bi-popup-group-list')+'">'+
      names.map(person=>{
        const group=rows.filter(row=>name(row,key)===person);
        const attrs=view==='by-pml'?'data-bi-popup-pml="'+esc(person)+'"':
          'data-bi-popup-person="'+esc(person)+'" data-bi-popup-person-role="'+key+'"';
        const meta=view==='by-pml'?biPplPmlPairs(group,'cards').length+' PPL':'';
        return biPopupGroupButton(person,group,scope,attrs,meta);
      }).join('')+'</div>';
  }
  content+=biLegend(rows);
  document.getElementById('biProgressBody').innerHTML=content;
}
function biPopupOpen(view,survey,trigger){
  if(!['ppl','pml','by-pml'].includes(view)||!biSurveyList().includes(survey))return;
  biPopupClose('biStatusModal');biPopupClose('biPmlPeopleModal');
  biPopupState.view=view;biPopupState.survey=survey;biPopupState.pml='';
  biPopupState.focus.biProgressModal=trigger||document.activeElement;
  biPopupPaint();
  const dialog=document.getElementById('biProgressModal');
  if(!dialog.open)dialog.showModal();
}
function biPopupPaintPmlPeople(){
  const survey=biPopupState.survey,pml=biPopupState.pml;
  const rows=biPopupRows().filter(row=>name(row,'pml')===pml);
  const pairs=biPplPmlPairs(rows,'cards');
  document.getElementById('biPmlPeopleTitle').textContent='PPL di bawah PML · '+pml;
  const body='<div class="bi-popup-toolbar"><span>'+pairs.length+
    ' PPL · '+rows.length+' assignment</span>'+
    biPopupUnitControls('cards')+'</div>'+
    '<div class="bi-popup-group-list">'+pairs.map((entry,i)=>
      biPopupGroupButton(entry.ppl,entry.rows,'cards',
        'data-bi-popup-pml-pair="'+i+'"','')
    ).join('')+'</div>'+biLegend(rows)+
    '<div class="bi-pml-card bi-popup-report-export"><div class="bi-popup-export-line">'+
      '<span>Laporan PPL</span>'+biExportButtons(survey,pml)+'</div>'+
      '<p class="bi-feedback" role="status" aria-live="polite"></p></div>';
  document.getElementById('biPmlPeopleBody').innerHTML=body;
}
function biPopupOpenPml(pml,trigger){
  if(biPopupState.view!=='by-pml')return;
  if(!biPopupRows().some(row=>name(row,'pml')===pml))return;
  biPopupState.pml=pml;
  biPopupState.focus.biPmlPeopleModal=trigger||document.activeElement;
  biPopupPaintPmlPeople();
  const dialog=document.getElementById('biPmlPeopleModal');
  if(!dialog.open)dialog.showModal();
}
function biPopupDetailHtml(rows,title,context){
  const n=rows.length,c=biCounts(rows),statuses=biRawStatusStats(rows);
  return '<div class="bi-popup-detail-subtitle">'+esc(context)+'</div>'+
    '<div class="bi-popup-stats-grid">'+
      '<div><span>Total Assignment</span><strong>'+n+'</strong></div>'+
      '<div><span>Sudah Submit</span><strong>'+biUnitText(c.submitted,n,'report')+'</strong></div>'+
      '<div><span>APPROVED</span><strong>'+c.approvedStage+'</strong></div>'+
    '</div>'+
    '<div class="bi-popup-status-heading"><strong>Komposisi Status FASIH</strong></div>'+
    '<div class="bi-popup-mainbar">'+biBar(rows,title)+'</div>'+
    '<div class="bi-popup-status-list">'+statuses.map(status=>{
      const count=status.count,pct=n?percent(count,n):'—';
      return '<div class="bi-popup-status-item">'+
        '<span class="bi-popup-status-dot" style="background:'+status.color+'"></span>'+
        '<span class="bi-popup-status-label">'+esc(status.label)+'</span>'+
        '<span class="bi-popup-status-track"><span style="width:'+(n?count/n*100:0).toFixed(3)+
          '%;background:'+status.color+'"></span></span>'+
        '<strong>'+pct+'</strong><small>'+count+' / '+n+'</small></div>';
    }).join('')+'</div>'+
    '';
}
function biPopupOpenDetail(kind,value,trigger){
  const survey=state.survey||biPopupState.survey;
  if(!survey)return;
  const all=DATA.filter(row=>row.survei===survey);
  let rows=[],label='',context='';
  if(kind==='main-pair'){
    const pairs=biPplPmlPairs(all,'report'),entry=pairs[value];
    if(!entry)return;
    rows=entry.rows;label=entry.ppl;context='PML: '+entry.pml+' · Survei: '+survey;
  }else if(kind==='modal-person'){
    const role=biPopupState.view==='ppl'?'ppl':'pml';
    if(!['ppl','pml'].includes(biPopupState.view))return;
    rows=all.filter(row=>name(row,role)===value);
    label=value;context=(role==='ppl'?'Pencacah / PPL':'Pengawas / PML')+' · Survei: '+survey;
  }else if(kind==='pml-pair'){
    const group=all.filter(row=>name(row,'pml')===biPopupState.pml);
    const entry=biPplPmlPairs(group,'cards')[value];
    if(!entry)return;
    rows=entry.rows;label=entry.ppl;context='PML: '+entry.pml+' · Survei: '+survey;
  }else return;
  if(!rows.length)return;
  document.getElementById('biStatusTitle').textContent='Rincian Status · '+label;
  document.getElementById('biStatusBody').innerHTML=biPopupDetailHtml(rows,label,context);
  biPopupState.focus.biStatusModal=trigger||document.activeElement;
  const dialog=document.getElementById('biStatusModal');
  if(!dialog.open)dialog.showModal();
}
function biPopupClose(id){
  if(!['biProgressModal','biPmlPeopleModal','biStatusModal'].includes(id))return;
  const dialog=document.getElementById(id);
  if(dialog?.open)dialog.close();
}
function biPopupCloseAll(){
  ['biStatusModal','biPmlPeopleModal','biProgressModal'].forEach(biPopupClose);
}

/* Semua gambar/PDF dibuat secara lokal di browser, tanpa mengirim data ke layanan lain. */
let biPdfLibPromise;
function biLoadPdfLib(){
  if(window.jspdf&&window.jspdf.jsPDF)return Promise.resolve(window.jspdf.jsPDF);
  if(!biPdfLibPromise){
    biPdfLibPromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src='https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js';
      script.async=true;
      script.onload=()=>window.jspdf?.jsPDF?resolve(window.jspdf.jsPDF):reject(new Error('Komponen PDF tidak tersedia.'));
      script.onerror=()=>reject(new Error('Gagal memuat pustaka PDF. Periksa koneksi internet.'));
      document.head.appendChild(script);
    }).catch(err=>{biPdfLibPromise=null;throw err;});
  }
  return biPdfLibPromise;
}
function biReportName(s){
  return String(s).normalize('NFKD').replace(/[^A-Za-z0-9_-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,75)||'progres';
}
function biCanvasText(ctx,text,x,y,maxWidth){
  let t=String(text);
  if(ctx.measureText(t).width<=maxWidth){ctx.fillText(t,x,y);return;}
  while(t.length>1&&ctx.measureText(t+'…').width>maxWidth)t=t.slice(0,-1);
  ctx.fillText(t+'…',x,y);
}
function biCanvasPage(survey,pml,pairs,pageIndex,pages,totalCounts){
  const width=1684,height=1191;
  const canvas=document.createElement('canvas');
  canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d',{alpha:false});
  if(!ctx)throw new Error('Canvas tidak tersedia untuk membuat laporan.');
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,width,height);
  ctx.fillStyle='#174679';ctx.fillRect(0,0,width,160);
  ctx.fillStyle='#ffffff';ctx.font='bold 38px Arial';ctx.textAlign='left';
  ctx.fillText('BOLO INPEK  /  PROGRES PPL',58,64);
  ctx.font='20px Arial';ctx.fillStyle='#dcecff';
  biCanvasText(ctx,'Survei: '+survey,58,98,1250);
  biCanvasText(ctx,'Cakupan: '+(pml===null?'Seluruh PPL':('PML '+pml)),58,122,1300);
  ctx.font='bold 17px Arial';ctx.fillStyle='#ffffff';
  biCanvasText(ctx,'DATA TERAKHIR DIAMBIL: '+(typeof exportTime==='function'?exportTime():'Belum tercatat'),58,150,1525);
  ctx.textAlign='right';ctx.font='bold 24px Arial';ctx.fillStyle='#ffffff';
  ctx.fillText('BPS KABUPATEN BLORA',1620,55);ctx.textAlign='left';
  ctx.fillStyle='#edf5ff';ctx.fillRect(58,186,1568,101);
  const stats=[
    ['ASSIGNMENT',totalCounts.total,'#174679'],
    ['OPEN',totalCounts.open,'#9e4758'],
    ['DRAFT',totalCounts.draft,'#a76379'],
    ['SUDAH SUBMIT',totalCounts.submitted,'#174679'],
    ['SUBMITTED',totalCounts.sent,'#316b9e'],
    ['APPROVED',totalCounts.approvedStage,'#2f805b'],
    ['REJECTED',totalCounts.rejected,'#98751b'],
    ['REVOKED',totalCounts.revoked,'#995e31'],
    ['COMPLETED',totalCounts.completed,'#237e76'],
    ['LAINNYA',totalCounts.other,'#617388']
  ];
  stats.forEach(([label,n,tone],i)=>{
    const x=72+i*156;
    ctx.fillStyle='#5c7390';ctx.font='bold 12px Arial';ctx.fillText(label,x,220);
    ctx.font='bold 27px Arial';ctx.fillStyle=tone;
    ctx.fillText(String(n),x,260);
  });
  const headings=[
    ['PPL',68],['TOTAL',330],['OPEN',400],['DRAFT',466],
    ['SUDAH',532],['SUBMIT',610],['APPROVE',709],
    ['REJECT',801],['REVOKE',887],['COMPLETE',969],['LAIN',1055],
    ['GRAFIK',1130],['PML',1303]
  ];
  ctx.fillStyle='#d9e9fa';ctx.fillRect(58,311,1568,51);
  ctx.fillStyle='#184574';ctx.font='bold 14px Arial';
  headings.forEach(([text,x])=>ctx.fillText(text,x,342));
  const first=pageIndex*17,part=pairs.slice(first,first+17);
  part.forEach((entry,i)=>{
    const y=362+i*43;
    ctx.fillStyle=i%2?'#f6f9fd':'#ffffff';
    ctx.fillRect(58,y,1568,43);
    const c=biCounts(entry.rows);
    ctx.font='18px Arial';ctx.fillStyle='#163e68';
    biCanvasText(ctx,entry.ppl,68,y+28,246);
    const values=[entry.rows.length,c.open,c.draft,c.submitted,c.sent,
      c.approvedStage,c.rejected,c.revoked,c.completed,c.other];
    const rowTones=['#183e63','#9e4758','#a76379','#174679','#316b9e',
      '#2f805b','#98751b','#995e31','#237e76','#617388'];
    ctx.font='15px Arial';
    [330,400,466,532,610,709,801,887,969,1055].forEach((x,k)=>{
      ctx.fillStyle=rowTones[k];ctx.fillText(String(values[k]),x,y+28);
    });
    const barX=1128,barY=y+26,barW=145,barH=9;
    ctx.font='bold 15px Arial';ctx.fillStyle='#245f98';
    biCanvasText(ctx,biUnitText(c.submitted,entry.rows.length,pml===null?'report':'cards'),barX,y+19,barW);
    ctx.fillStyle='#dce5f1';ctx.fillRect(barX,barY,barW,barH);
    let left=0;
    for(const status of biRawStatusStats(entry.rows)){
      if(!status.count)continue;
      const length=barW*status.count/entry.rows.length;ctx.fillStyle=status.color;
      ctx.fillRect(barX+left,barY,length,barH);left+=length;
    }
    ctx.fillStyle='#184875';biCanvasText(ctx,entry.pml,1303,y+28,300);
    ctx.fillStyle='#edf2f8';ctx.fillRect(58,y+42,1568,1);
  });
  const footY=1120;
  ctx.fillStyle='#607991';ctx.font='16px Arial';
  biCanvasText(ctx,'Belum Submit = OPEN + DRAFT + REJECTED BY PENGAWAS  |  Status REJECTED lain dihitung Sudah Submit',65,footY,1540);
  biCanvasText(ctx,'Data terakhir diambil: '+(typeof exportTime==='function'?exportTime():'Belum tercatat')+
    (totalCounts.manual?' | '+totalCounts.manual+' assignment memakai status manual':''),
    65,footY+31,1500);
  ctx.textAlign='right';ctx.fillStyle='#1c578f';
  ctx.fillText('Halaman '+(pageIndex+1)+' / '+pages+' · '+pairs.length+' pasangan PPL–PML',1618,footY+31);
  ctx.textAlign='left';
  return canvas;
}
function biDownloadBlob(blob,filename){
  if(!blob)throw new Error('Tidak dapat menghasilkan gambar.');
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
function biCanvasBlob(canvas,type,quality){
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>
    blob?resolve(blob):reject(new Error('Ekspor gambar tidak berhasil.')),type,quality));
}
async function biExportProgress(button){
  if(button.disabled)return;
  const survey=button.dataset.survey;
  const pml=button.dataset.scope==='pml'?button.dataset.pml:null;
  const rows=DATA.filter(r=>r.survei===survey&&(pml===null||name(r,'pml')===pml));
  // Seluruh assignment tetap tercakup; hanya urutan yang mengikuti tombol panel.
  const pairs=biPplPmlPairs(rows,pml===null?'report':'cards');
  const feedback=button.closest('.bi-export-banner, .bi-pml-card')?.querySelector('.bi-feedback');
  const siblings=button.closest('.bi-export-buttons')?.querySelectorAll('button')||[button];
  if(!pairs.length){if(feedback)feedback.textContent='Belum ada assignment PPL untuk diekspor.';return;}
  const c=biCounts(rows),summary={...c,total:rows.length,
    manual:rows.filter(r=>r.boloStatusManual).length};
  const pages=Math.ceil(pairs.length/17),namePart=biReportName(survey)+'_'+biReportName(pml||'Seluruh_PPL');
  siblings.forEach(x=>x.disabled=true);
  if(feedback)feedback.textContent='Menyiapkan laporan '+(button.dataset.biExport==='pdf'?'PDF':'gambar')+' untuk '+pairs.length+' pasangan PPL–PML…';
  try{
    if(button.dataset.biExport==='pdf'){
      const JsPDF=await biLoadPdfLib();
      const doc=new JsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true});
      for(let i=0;i<pages;i++){
        const canvas=biCanvasPage(survey,pml,pairs,i,pages,summary);
        if(i>0)doc.addPage('a4','landscape');
        doc.addImage(canvas.toDataURL('image/jpeg',0.88),'JPEG',0,0,297,210);
      }
      doc.save('BOLO_INPEK_Progres_PPL_'+namePart+'.pdf');
    }else{
      // Satu gambar tinggi jika memungkinkan; untuk laporan sangat panjang,
      // beberapa berkas PNG per 5 halaman menghindari batas ukuran canvas Windows.
      let startPage=0,part=1;
      while(startPage<pages){
        const portion=Math.min(5,pages-startPage);
        const combined=document.createElement('canvas');
        combined.width=1684;combined.height=1191*portion;
        const context=combined.getContext('2d',{alpha:false});
        if(!context)throw new Error('Canvas laporan tidak tersedia.');
        for(let j=0;j<portion;j++){
          const pg=biCanvasPage(survey,pml,pairs,startPage+j,pages,summary);
          context.drawImage(pg,0,j*1191);
        }
        const blob=await biCanvasBlob(combined,'image/png');
        biDownloadBlob(blob,'BOLO_INPEK_Progres_PPL_'+namePart+(pages>5?'_Bagian_'+part:'')+'.png');
        startPage+=portion;part++;
      }
    }
    if(feedback)feedback.textContent='Laporan berhasil dibuat. Silakan periksa unduhan browser.'+
      (button.dataset.biExport==='png'&&pages>5?' Laporan panjang dibagi menjadi beberapa gambar.':'');
  }catch(error){
    if(feedback)feedback.textContent='Gagal ekspor: '+(error.message||String(error));
  }finally{siblings.forEach(x=>x.disabled=false);}
}
