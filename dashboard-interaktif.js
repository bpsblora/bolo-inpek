
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
  {id:'rejectedProvinsi',label:'REJECTED BY ADMIN PROVINSI',color:'#d3a3b6'},
  {id:'other',label:'LAINNYA',color:'#c7d3df'}
];
const BI_STATUS_COLORS={
  'OPEN':'#e79ba9',
  'DRAFT':'#f1c5d1',
  'REJECTED BY PENGAWAS':'#f2d06e',
  'SUBMITTED BY PENCACAH':'#86b5ef',
  'APPROVED BY PENGAWAS':'#8fd3a3',
  'REVOKED BY PENGAWAS':'#eeaa77',
  'REVOKED BY ADMIN KABUPATEN':'#dc907e',
  'APPROVED BY ADMIN':'#66c3a3',
  'REJECTED BY ADMIN KABUPATEN':'#d5af69',
  'REVOKED BY ADMIN PROVINSI':'#b5a1dc',
  'REJECTED BY ADMIN PROVINSI':'#d3a3b6',
  'STATUS TIDAK TERSEDIA':'#b7c6d7',
  'STATUS BELUM DIRINCI':'#a4b5c9'
};
const BI_STATUS_PRIORITY=Object.keys(BI_STATUS_COLORS);
function biRawCode(value){
  return String(value||'').trim().replace(/\s+/g,' ').toUpperCase()||'STATUS TIDAK TERSEDIA';
}
function biDashboardStatus(value){
  return biRawCode(value).replace(/^(?:APPROVED|COMPLETE(?:D)?) BY ADMIN (?:KABUPATEN|PROVINSI)$/, 'APPROVED BY ADMIN');
}
function biCompareStatus(a,b){
  const order=value=>{
    const index=BI_STATUS_PRIORITY.indexOf(biDashboardStatus(value));
    return index<0?BI_STATUS_PRIORITY.length:index;
  };
  return order(a)-order(b)||a.localeCompare(b,'id');
}
function biStatusColor(status){
  const code=biDashboardStatus(status);
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
    const code=biDashboardStatus(row.status);
    raw.set(code,(raw.get(code)||0)+1);
  });
  return [...raw].sort(([a],[b])=>biCompareStatus(a,b))
    .map(([label,count])=>({label,count,color:biStatusColor(label)}));
}
function biStatusBucket(value){
  const s=biDashboardStatus(value);
  if(s==='OPEN')return 'open';
  if(s==='DRAFT')return 'draft';
  if(s.startsWith('SUBMITTED'))return 'sent';
  if(s.startsWith('APPROVED')||s.startsWith('COMPLETED'))return 'approvedStage';
  if(s==='REJECTED BY ADMIN PROVINSI')return 'rejectedProvinsi';
  if(s.startsWith('REJECTED'))return 'rejected';
  if(s.startsWith('REVOKED'))return 'revoked';
  return 'other';
}
function biIsSubmittedBucket(bucket){
  return ['sent','approvedStage','rejected','revoked','rejectedProvinsi'].includes(bucket);
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
  // Kategori mengikuti status Dashboard; indikator Belum/Sudah Submit
  // mengikuti tindak lanjut yang diperlukan (REJECTED BY PENGAWAS belum submit).
  const result=Object.fromEntries(biBuckets.map(b=>[b.id,0]));
  let rejectedByPengawas=0;
  for(const row of rows){
    result[biStatusBucket(row.status)]++;
    if(biRejectedByPengawas(row.status))rejectedByPengawas++;
  }
  result.rejectedByPengawas=rejectedByPengawas;
  result.pending=result.open+result.draft+rejectedByPengawas;
  result.revision=result.rejected+result.rejectedProvinsi+result.revoked;
  result.submitted=result.sent+result.approvedStage+result.revision-rejectedByPengawas;
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
function biBar(rows,label,scope=''){
  const states=biRawStatusStats(rows);
  const segments=states.map(status=>{
    if(!status.count||!rows.length)return '';
    const width=(status.count/rows.length*100).toFixed(3);
    if(scope)return '<button type="button" class="bi-seg" data-bi-status-scope="'+scope+'" data-bi-display-status="'+esc(status.label)+'" aria-haspopup="dialog" aria-label="'+esc(status.label+' · '+status.count+' assignment')+'" style="width:'+width+'%;background:'+status.color+'" title="'+esc(status.label+': '+status.count)+'"></button>';
    return '<span class="bi-seg" style="width:'+width+'%;background:'+status.color+
      '" title="'+esc(status.label+': '+status.count)+'"></span>';
  }).join('');
  return '<span class="bi-stack" role="'+(scope?'group':'img')+'" aria-label="'+esc(label+' — '+
    states.map(s=>s.label+': '+s.count).join('; '))+'">'+segments+'</span>';
}
function biLegend(rows,scope){
  const states=biRawStatusStats(rows||DATA);
  return '<div class="bi-legend bi-legend-raw" role="list" aria-label="Legenda status FASIH">'+
    states.map(s=>'<span role="listitem" class="bi-legend-item"><button type="button" data-bi-status-scope="'+scope+'" data-bi-display-status="'+esc(s.label)+'" aria-haspopup="dialog"><i aria-hidden="true" style="background:'+s.color+
      '"></i>'+esc(s.label)+'</button></span>').join('')+'</div>';
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
    '<div class="bi-summary-actions"><button type="button" data-bi-status-scope="county" data-bi-metric="submitted" aria-haspopup="dialog" class="bi-county-total '+(denominator?(submitted===denominator?'is-success':submitted/denominator>=0.8?'is-warning':'is-danger'):'is-empty')+'"><strong>'+
    (denominator?percent(submitted,denominator):'—')+'</strong>'+
    '<span>'+format.format(submitted)+' dari '+format.format(denominator)+' assignment sudah submit · Kabupaten ›</span></button>'+
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
    '<strong>Sudah Submit</strong> = SUBMITTED, APPROVED (termasuk COMPLETED), REVOKED, serta REJECTED selain oleh pengawas. '+
    'Status LAINNYA tidak otomatis dihitung; assignment bertanda Tidak Dihitung dikecualikan dari total.</p></section>';
}
function biCompareProgress(a,b,mode){
  // Prioritas utama: Sudah Submit; jika sama: jumlah APPROVED.
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
    const statuses=biRawStatusStats(rows);
    const body=names.map(person=>{
      const group=rows.filter(r=>name(r,key)===person),c=biCounts(group);
      const counts=new Map(biRawStatusStats(group).map(({label,count})=>[label,count]));
      return '<tr><td><button class="bi-link" data-level="'+key+'" data-value="'+esc(person)+'">'+esc(person)+' →</button></td>'+
        '<td>'+biStatusCell(key,person,'data-bi-metric="total"',group.length,String(group.length))+'</td>'+
        '<td>'+biStatusCell(key,person,'data-bi-metric="submitted"',c[metric],biUnitText(c[metric],group.length,key))+'</td>'+
        statuses.map(({label})=>{
          const count=counts.get(label)||0;
          return '<td>'+biStatusCell(key,person,'data-bi-display-status="'+esc(label)+'"',count,String(count))+'</td>';
        }).join('')+'</tr>';
    }).join('');
    return '<div class="tablebox"><table class="bi-table"><thead><tr><th>'+key.toUpperCase()+'</th><th>Total</th>'+
      '<th>'+metricName+' ↓</th>'+
      statuses.map(({label})=>'<th scope="col">'+esc(label)+'</th>').join('')+'</tr></thead><tbody>'+body+'</tbody></table></div>';
  }
  return '<div class="bi-bars">'+names.map(person=>{
    const group=rows.filter(r=>name(r,key)===person),counts=biCounts(group);
    return '<button type="button" class="bi-bar-row" data-level="'+key+'" data-value="'+esc(person)+'">'+
      '<span class="bi-name">'+esc(person)+'</span>'+biBar(group,person)+
      '<span class="bi-row-stat"><strong>'+biUnitText(counts[metric],group.length,key)+'</strong>'+
      '<span>Sudah Submit · APPROVED: '+counts.approvedStage+'</span></span></button>';
  }).join('')+'</div>';
}
function biStatusCell(role,person,metricAttrs,count,content){
  if(!count)return content;
  return '<button type="button" class="statusbtn" data-bi-status-scope="view" data-bi-status-role="'+role+'" data-bi-status-person="'+esc(person)+'" '+metricAttrs+' aria-haspopup="dialog">'+content+'</button>';
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
    biRoleContent(rows,key)+biLegend(rows,'view')+'</section>';
}
const BI_KPI_LABELS={total:'Total Assignment',pending:'Belum Submit',submitted:'Sudah Submit',rejected:'REJECTED',approved:'APPROVED'};
function biKpiRows(rows,kind){
  if(kind==='total')return rows;
  if(kind==='pending')return rows.filter(row=>['open','draft'].includes(biStatusBucket(row.status))||biRejectedByPengawas(row.status));
  if(kind==='submitted')return rows.filter(row=>biIsSubmittedStatus(row.status));
  if(kind==='approved')return rows.filter(row=>biStatusBucket(row.status)==='approvedStage');
  return rows.filter(row=>['rejected','rejectedProvinsi'].includes(biStatusBucket(row.status)));
}
function biKpis(rows){
  const c=biCounts(rows);
  // Setiap kartu memiliki kelas warna khusus, tanpa mengubah perhitungan FASIH.
  const items=[
    ['total',rows.length,''],
    ['pending',c.pending,'OPEN / DRAFT / REJECTED PENGAWAS'],
    ['submitted',c.submitted,''],
    ['rejected',c.rejected+c.rejectedProvinsi,c.rejectedProvinsi?'Admin Provinsi: '+c.rejectedProvinsi:'']
  ];
  return '<div class="bi-kpis">'+items.map(([kind,n,note])=>
    '<button type="button" class="bi-kpi bi-kpi-'+kind+'" data-bi-kpi="'+kind+'" aria-haspopup="dialog" aria-controls="biKpiModal">'+
      '<span>'+BI_KPI_LABELS[kind]+'</span><strong>'+format.format(n)+'</strong>'+
      (note?'<small>'+note+'</small>':'')+'<span class="bi-kpi-arrow" aria-hidden="true">›</span></button>').join('')+'</div>';
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
          '<button type="button" class="bi-survey-assignment-chip" data-bi-kpi="total" aria-haspopup="dialog" aria-label="'+format.format(all.length)+' assignment">'+
            '<strong>'+format.format(all.length)+'</strong><span>Assignment ›</span></button>'+
        '</div>'+
        '<div class="bi-survey-progress-group">'+
          '<div class="bi-survey-progress-heading"><strong>Komposisi Status FASIH</strong>'+
            '<button type="button" class="bi-metric-link" data-bi-kpi="submitted" aria-haspopup="dialog"><strong>'+format.format(count.submitted)+' / '+format.format(all.length)+'</strong> Sudah Submit · '+(all.length?percent(count.submitted,all.length):'—')+' ›</button></div>'+
          '<div class="bi-survey-fullbar">'+biBar(all,'Komposisi status FASIH '+survey,'survey')+'</div>'+
        '</div>'+
        '<div class="bi-head-actions">'+exportButtons(survey)+tombolTindakLanjut(survey)+
          '<p class="export-feedback" role="status" aria-live="polite"></p></div>'+
      '</div>'+
      '<div class="bi-survey-donut-panel">'+
        '<button type="button" class="bi-donut" data-bi-kpi="submitted" aria-haspopup="dialog" style="background:'+donutColor+'"><span class="bi-donut-center">'+
          '<strong>'+(all.length?percent(count.submitted,all.length):'—')+'</strong>'+
          '<small>Sudah Submit</small>'+
          '<span>'+format.format(count.submitted)+' / '+format.format(all.length)+'</span>'+
        '</span></button>'+
      '</div>'+
    '</div>'+
    '<div class="bi-survey-hero-legend">'+biLegend(all,'survey')+'</div>'+
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
    }).join('')+'</div>'+biLegend(DATA.filter(r=>surveys.includes(r.survei)),'county')+'</div>';
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
  const dashboardLink=window.self!==window.top
    ?'<a class="bi-export-btn" href="'+esc(biDirectReportUrl(survey))+
      '" target="_blank" rel="noopener noreferrer">Buka Dashboard di tab baru</a>'
    :'';
  return '<div class="bi-export-buttons">'+
    '<button type="button" class="bi-export-btn" data-bi-export="png"'+attrs+
    ' aria-label="Unduh gambar progres '+esc(target)+'">▧ Gambar</button>'+
    '<button type="button" class="bi-export-btn pdf" data-bi-export="pdf"'+attrs+
    ' aria-label="Unduh PDF progres '+esc(target)+'">↓ PDF</button>'+dashboardLink+'</div>';
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
          '<td><button type="button" class="bi-metric-link" data-bi-status-scope="main-pair" data-bi-metric="total" aria-haspopup="dialog">'+format.format(entry.rows.length)+'</button></td>'+
          '<td><button type="button" class="bi-metric-link" data-bi-status-scope="main-pair" data-bi-metric="submitted" aria-haspopup="dialog">'+biUnitText(c.submitted,entry.rows.length,'report')+'</button></td>'+
          '<td><button type="button" class="bi-metric-link" data-bi-status-scope="main-pair" data-bi-metric="approved" aria-haspopup="dialog">'+format.format(c.approvedStage)+'</button></td>'+
          '<td class="bi-mini-stack">'+biBar(entry.rows,entry.ppl,'main-pair')+
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
          '</strong>'+(stats.rejectedProvinsi?' · REJECTED BY ADMIN PROVINSI: <strong>'+
          format.format(stats.rejectedProvinsi)+'</strong>':'')+'</p>'+
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
  content+=biLegend(rows,'progress');
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
    ).join('')+'</div>'+biLegend(rows,'pml-progress')+
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
function biOriginalStatus(row){
  return biRawCode(row.status_asli||row.boloStatusFasih||row.status);
}
function biOriginalStatusButtons(rows){
  const statuses=new Map();
  for(const row of rows){
    const status=biOriginalStatus(row);
    statuses.set(status,(statuses.get(status)||0)+1);
  }
  if(!statuses.size)return '<p class="bi-popup-detail-subtitle">Tidak ada assignment pada kategori ini.</p>';
  return '<div class="bi-popup-status-list">'+
    '<button type="button" class="bi-popup-group bi-all-assignments" data-bi-all-assignments aria-haspopup="dialog" aria-controls="biAssignmentDetailModal">'+
    '<span class="bi-popup-group-top"><strong>Lihat Semua Assignment ›</strong><b>'+format.format(rows.length)+' assignment</b></span></button>'+
    [...statuses].sort(([a],[b])=>biCompareStatus(a,b)).map(([label,count])=>{
      const pct=percent(count,rows.length),color=biStatusColor(label);
      return '<button type="button" class="bi-popup-status-item bi-original-status" data-bi-original-status="'+esc(label)+'" aria-haspopup="dialog" aria-controls="biAssignmentDetailModal">'+
        '<span class="bi-popup-status-dot" aria-hidden="true" style="background:'+color+'"></span>'+
        '<span class="bi-popup-status-label">'+esc(label)+'</span>'+
        '<span class="bi-popup-status-track" aria-hidden="true"><span style="width:'+(count/rows.length*100).toFixed(3)+
          '%;background:'+color+'"></span></span>'+
        '<strong>'+pct+'</strong><small>'+format.format(count)+' / '+format.format(rows.length)+'</small></button>';
    }).join('')+'</div>';
}
function biPopupOpenKpi(kind,trigger){
  if(!state.survey||!Object.hasOwn(BI_KPI_LABELS,kind))return;
  biPopupOpenStatusList(biKpiRows(DATA.filter(row=>row.survei===state.survey),kind),BI_KPI_LABELS[kind],state.survey,trigger);
}
function biPopupOpenStatusList(rows,label,context,trigger){
  biPopupState.kpi={rows,context:context+' · '+label};
  biPopupState.focus.biKpiModal=trigger;
  document.getElementById('biKpiTitle').textContent=label+' · '+context;
  const body=document.getElementById('biKpiBody');
  body.innerHTML='<p class="bi-popup-detail-subtitle">'+format.format(rows.length)+' assignment</p>'+
    '<div class="bi-popup-status-heading"><strong>Status Asli FASIH</strong></div>'+biOriginalStatusButtons(rows);
  document.getElementById('biKpiModal').showModal();
  body.scrollTop=0;
}
function biPopupOpenScopedStatus(trigger){
  const {biStatusScope:scope,biDisplayStatus:status,biMetric:metric,biStatusRole:role,biStatusPerson:person,biStatusBucket:bucket}=trigger.dataset;
  let rows,context;
  switch(scope){
    case 'county': rows=DATA.filter(row=>SURVEYS.includes(row.survei));context='Kabupaten Blora';break;
    case 'survey': rows=DATA.filter(row=>row.survei===state.survey);context=state.survey;break;
    case 'view': rows=selected();context=[state.survey,state.pml,state.ppl].filter(Boolean).join(' · ');break;
    case 'progress': rows=biPopupRows();context=biPopupState.survey;break;
    case 'pml-progress': rows=biPopupRows().filter(row=>name(row,'pml')===biPopupState.pml);context=biPopupState.survey+' · PML '+biPopupState.pml;break;
    case 'person': ({rows,context}=biPopupState.personDetail);break;
    case 'main-pair': {
      const row=trigger.closest('tr[data-bi-detail-pair]');
      const pair=biPplPmlPairs(DATA.filter(item=>item.survei===state.survey),'report')[Number(row?.dataset.biDetailPair)];
      if(!pair)return;
      rows=pair.rows;context=state.survey+' · PPL '+pair.ppl+' · PML '+pair.pml;
      break;
    }
    default: return;
  }
  if(role){
    rows=rows.filter(row=>name(row,role)===person);
    context+=' · '+role.toUpperCase()+' '+person;
  }
  if(status)rows=rows.filter(row=>biDashboardStatus(row.status)===status);
  if(bucket)rows=rows.filter(row=>biStatusBucket(row.status)===bucket);
  if(metric)rows=biKpiRows(rows,metric);
  const label=status||(bucket?biBuckets.find(item=>item.id===bucket)?.label:BI_KPI_LABELS[metric]);
  biPopupOpenStatusList(rows,label,context,trigger);
}
const BI_ASSIGNMENT_COLLATOR=new Intl.Collator('id-ID',{numeric:true,sensitivity:'base'});
const BI_ASSIGNMENT_COLUMNS=[
  {key:'assignment',label:'Nama Assignment',width:44,value:row=>row.nama_assignment},
  {key:'survey',label:'Survei',width:17,value:row=>row.survei},
  {key:'status',label:'Status untuk Perhitungan',width:22,value:row=>row.status},
  {key:'originalStatus',label:'Status Asli FASIH',width:28,value:biOriginalStatus},
  {key:'ppl',label:'PPL',width:24,value:row=>name(row,'ppl')},
  {key:'pml',label:'PML',width:24,value:row=>name(row,'pml')}
];
function biAssignmentText(value){
  return String(value??'').normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('id-ID').trim();
}
function biAssignmentCompare(key){
  return key==='status'||key==='originalStatus'?biCompareStatus:BI_ASSIGNMENT_COLLATOR.compare;
}
function biAssignmentSelection(rows,query,filters,sort){
  const words=biAssignmentText(query).split(/\s+/).filter(Boolean);
  const active=[...filters].filter(([,values])=>values.size);
  const matching=rows.filter(item=>
    active.every(([key,values])=>values.has(item.cells[key]))&&
    words.every(word=>item.search.includes(word)));
  if(sort.length)matching.sort((a,b)=>{
    for(const {key,direction} of sort){
      const difference=biAssignmentCompare(key)(a.cells[key],b.cells[key]);
      if(difference)return direction==='asc'?difference:-difference;
    }
    return a.index-b.index;
  });
  return matching;
}
function biMountAssignmentList(root,rows,{title,context,showStatus=false,showOriginalStatus=false}){
  const surveys=new Set(rows.map(row=>row.survei));
  const showSurvey=surveys.size>1;
  const columns=BI_ASSIGNMENT_COLUMNS.filter(c=>
    (c.key!=='survey'||showSurvey)&&(c.key!=='status'||showStatus)&&(c.key!=='originalStatus'||showOriginalStatus));
  const items=rows.map((row,index)=>{
    const cells=Object.fromEntries(columns.map(c=>[c.key,String(c.value(row)??'')]));
    const status=biOriginalStatus(row);
    return {row,index,cells,statusColor:biStatusColor(status),
      search:biAssignmentText([...Object.values(cells),status,row.boloStatusManual||''].join(' '))};
  });
  const filters=new Map(),sort=[];
  const filterIcon='<svg class="bi-assignment-filter-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">'+
    '<path d="M2 3h12L9.5 8.5v4l-3 1v-5L2 3Z" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round"/></svg>';
  const filterControls=columns.map(column=>{
    const values=[...new Set(items.map(item=>item.cells[column.key]))].sort(biAssignmentCompare(column.key));
    return '<details class="bi-assignment-filter"><summary>'+filterIcon+
      '<span class="bi-filter-sr-only">Filter </span><span>'+esc(column.label)+'</span>'+
      '<span data-filter-count="'+column.key+'"></span></summary>'+
      '<div class="bi-assignment-filter-options" role="group" aria-label="Filter '+esc(column.label)+'">'+
      values.map(value=>'<label><input type="checkbox" data-assignment-filter="'+column.key+'" value="'+esc(value)+'"> <span>'+esc(value||'Kosong')+'</span></label>').join('')+
      '</div></details>';
  }).join('');
  root.innerHTML='<p class="bi-popup-detail-subtitle">'+esc(context)+'</p>'+
    '<div class="bi-assignment-tools"><div class="bi-assignment-actions">'+
    '<label class="bi-assignment-search">Cari assignment atau petugas<input type="search" data-assignment-search placeholder="Ketik kata kunci"></label>'+
    '<div class="bi-assignment-downloads" role="group" aria-label="Unduh daftar assignment">'+
    [['pdf','PDF'],['png','Gambar'],['xlsx','Excel']].map(([type,label])=>
      '<button type="button" class="export-button" data-assignment-export="'+type+'">Unduh '+label+'</button>').join('')+'</div></div>'+
    '<div class="bi-assignment-filters" role="group" aria-label="Filter per kolom">'+filterControls+
    '<button type="button" class="export-button" data-assignment-reset>Reset</button></div>'+
    '<div class="bi-assignment-meta"><span data-assignment-count role="status"></span>'+
    '<span data-assignment-order>Urutkan dengan klik judul kolom. Klik kolom lain untuk menambah urutan.</span></div>'+
    '<div class="bi-assignment-feedback" data-assignment-feedback role="status"></div></div>'+
    '<div class="tablebox bi-assignment-scroll" tabindex="0" role="region" aria-label="Tabel assignment">'+
    '<table class="bi-assignment-detail-table'+(showSurvey?' bi-multi-survey':'')+(showOriginalStatus?' bi-assignment-all-status':'')+'"><thead><tr>'+
    columns.map(c=>'<th scope="col"><button type="button" data-assignment-sort="'+c.key+'">'+esc(c.label)+
      ' <span aria-hidden="true" data-assignment-indicator>↕</span></button></th>').join('')+
    '</tr></thead><tbody></tbody></table></div>';

  const search=root.querySelector('[data-assignment-search]');
  const tableBody=root.querySelector('tbody');
  const scroll=root.querySelector('.bi-assignment-scroll');
  const sortButtons=[...root.querySelectorAll('[data-assignment-sort]')];
  const downloadButtons=[...root.querySelectorAll('[data-assignment-export]')];
  const count=root.querySelector('[data-assignment-count]');
  const order=root.querySelector('[data-assignment-order]');
  const feedback=root.querySelector('[data-assignment-feedback]');
  let visible=[],exporting=false;
  function paint(){
    visible=biAssignmentSelection(items,search.value,filters,sort);
    count.textContent=format.format(visible.length)+' dari '+format.format(items.length)+' assignment';
    for(const button of sortButtons){
      const index=sort.findIndex(item=>item.key===button.dataset.assignmentSort);
      const column=columns.find(c=>c.key===button.dataset.assignmentSort);
      const direction=sort[index]?.direction;
      button.querySelector('[data-assignment-indicator]').textContent=index<0?'↕':
        (direction==='asc'?'↑':'↓')+' '+(index+1);
      const th=button.closest('th');
      if(index===0)th.setAttribute('aria-sort',direction==='asc'?'ascending':'descending');
      else th.removeAttribute('aria-sort');
      button.setAttribute('aria-label',column.label+(index<0?', urutkan naik':
        ', urutan '+(index+1)+' '+(direction==='asc'?'naik, urutkan turun':'turun, hapus urutan')));
    }
    order.textContent=sort.length?'Urutan: '+sort.map(({key,direction})=>
      columns.find(c=>c.key===key).label+(direction==='asc'?' ↑':' ↓')).join(' → '):
      'Urutkan dengan klik judul kolom. Klik kolom lain untuk menambah urutan.';
    for(const c of columns){
      const size=filters.get(c.key)?.size||0;
      const badge=root.querySelector('[data-filter-count="'+c.key+'"]');
      badge.textContent=size?'('+size+')':'';
      badge.closest('summary').classList.toggle('bi-filter-active',size>0);
    }
    tableBody.innerHTML=visible.length?visible.map(({row,cells,statusColor})=>
      '<tr class="bi-assignment-status-row" style="--bi-assignment-status:'+esc(statusColor)+'">'+columns.map(({key})=>
      '<td>'+esc(cells[key])+(key==='assignment'&&row.boloStatusManual?
        '<small>Status perhitungan manual · '+esc(row.status)+'</small>':'')+'</td>').join('')+'</tr>').join(''):
      '<tr><td class="empty" colspan="'+columns.length+'">Tidak ada assignment yang cocok.</td></tr>';
    scroll.scrollTop=0;
    downloadButtons.forEach(button=>button.disabled=exporting||!visible.length);
  }
  root.oninput=event=>{if(event.target===search)paint();};
  root.onchange=event=>{
    const input=event.target.closest('[data-assignment-filter]');
    if(!input)return;
    const key=input.dataset.assignmentFilter;
    if(!filters.has(key))filters.set(key,new Set());
    const values=filters.get(key);
    if(input.checked)values.add(input.value);
    else values.delete(input.value);
    paint();
  };
  root.onclick=async event=>{
    const button=event.target.closest('button');
    if(!button)return;
    if(button.hasAttribute('data-assignment-reset')){
      search.value='';
      filters.clear();
      sort.length=0;
      root.querySelectorAll('[data-assignment-filter]').forEach(input=>input.checked=false);
      paint();
      return;
    }
    const key=button.dataset.assignmentSort;
    if(key){
      const index=sort.findIndex(item=>item.key===key);
      if(index<0)sort.push({key,direction:'asc'});
      else if(sort[index].direction==='asc')sort[index].direction='desc';
      else sort.splice(index,1);
      paint();
      return;
    }
    const type=button.dataset.assignmentExport;
    if(!type||!visible.length||exporting)return;
    exporting=true;
    downloadButtons.forEach(control=>control.disabled=true);
    feedback.textContent='Menyiapkan unduhan…';
    try{
      await biExportAssignmentList(type,{title,context,columns,items:visible,time:exportTime()},feedback);
    }catch(error){
      feedback.textContent=error.message||'Unduhan gagal. Silakan coba lagi.';
    }finally{
      exporting=false;
      downloadButtons.forEach(control=>control.disabled=!visible.length);
    }
  };
  paint();
}
function biPopupOpenAssignments(status,trigger){
  const source=trigger.closest('#biKpiModal')?biPopupState.kpi:biPopupState.personDetail;
  const allStatuses=status===null;
  const rows=allStatuses?source?.rows:source?.rows.filter(row=>biOriginalStatus(row)===status);
  if(!rows?.length)return;
  const title=allStatuses?'Assignment · Semua Status':'Assignment · '+status;
  biPopupState.focus.biAssignmentDetailModal=trigger;
  document.getElementById('biAssignmentDetailTitle').textContent=title;
  const body=document.getElementById('biAssignmentDetailBody');
  biMountAssignmentList(body,rows,{title,context:source.context,showOriginalStatus:allStatuses});
  document.getElementById('biAssignmentDetailModal').showModal();
  body.scrollTop=0;
}
function biPopupDetailHtml(rows,title,context){
  const n=rows.length,c=biCounts(rows);
  const metrics=[['total',format.format(n)],['submitted',biUnitText(c.submitted,n,'report')],['approved',format.format(c.approvedStage)]];
  return '<div class="bi-popup-detail-subtitle">'+esc(context)+'</div>'+
    '<div class="bi-popup-stats-grid">'+metrics.map(([kind,value])=>
      '<button type="button" data-bi-status-scope="person" data-bi-metric="'+kind+'" aria-haspopup="dialog"><span>'+BI_KPI_LABELS[kind]+' ›</span><strong>'+value+'</strong></button>'
    ).join('')+'</div>'+
    '<div class="bi-popup-status-heading"><strong>Komposisi Status FASIH</strong></div>'+
    '<div class="bi-popup-mainbar">'+biBar(rows,title,'person')+'</div>'+
    '<div class="bi-popup-status-heading"><strong>Status Asli FASIH</strong></div>'+biOriginalStatusButtons(rows);
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
  biPopupState.personDetail={rows,context:label+' · '+context};
  document.getElementById('biStatusTitle').textContent='Rincian Status · '+label;
  document.getElementById('biStatusBody').innerHTML=biPopupDetailHtml(rows,label,context);
  biPopupState.focus.biStatusModal=trigger||document.activeElement;
  const dialog=document.getElementById('biStatusModal');
  if(!dialog.open)dialog.showModal();
}
const BI_POPUP_IDS=['biAssignmentDetailModal','biKpiModal','biStatusModal','biPmlPeopleModal','biProgressModal'];
function biPopupClose(id){
  if(!BI_POPUP_IDS.includes(id))return;
  const dialog=document.getElementById(id);
  if(dialog?.open)dialog.close();
}
function biPopupCloseAll(){
  BI_POPUP_IDS.forEach(biPopupClose);
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
function biProgressCanvas(survey,pairCount,scale=1){
  const width=1684,height=1191;
  const canvas=document.createElement('canvas');
  canvas.width=width*scale;canvas.height=height*scale;
  const ctx=canvas.getContext('2d',{alpha:false});
  if(!ctx)throw new Error('Canvas tidak tersedia untuk membuat laporan.');
  ctx.scale(scale,scale);
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,width,height);
  ctx.fillStyle='#174679';ctx.fillRect(0,0,width,160);
  ctx.fillStyle='#ffffff';ctx.font='bold 38px Arial';ctx.textAlign='left';
  ctx.fillText('BOLO INPEK  /  PROGRES PPL',58,64);
  ctx.font='20px Arial';ctx.fillStyle='#dcecff';
  biCanvasText(ctx,'Survei: '+survey,58,98,1250);
  biCanvasText(ctx,pairCount+' pasangan PPL–PML',58,122,1300);
  ctx.font='bold 17px Arial';ctx.fillStyle='#ffffff';
  biCanvasText(ctx,'DATA TERAKHIR DIAMBIL: '+(typeof exportTime==='function'?exportTime():'Belum tercatat'),58,150,1525);
  ctx.textAlign='right';ctx.font='bold 24px Arial';ctx.fillStyle='#ffffff';
  ctx.fillText('BPS KABUPATEN BLORA',1620,55);ctx.textAlign='left';
  return {canvas,ctx};
}
function biCanvasPage(survey,pml,pairs,pageIndex,pages,totalCounts){
  const {canvas,ctx}=biProgressCanvas(survey,pairs.length);
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
    ['REJECT ADMIN PROV.',totalCounts.rejectedProvinsi,'#9d5876'],
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
    ['REJECT',801],['REVOKE',887],['REJECT PROV.',969],['LAIN',1055],
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
      c.approvedStage,c.rejected,c.revoked,c.rejectedProvinsi,c.other];
    const rowTones=['#183e63','#9e4758','#a76379','#174679','#316b9e',
      '#2f805b','#98751b','#995e31','#9d5876','#617388'];
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
  biProgressCanvasFooter(ctx,pageIndex,pages,totalCounts.manual);
  return canvas;
}
function biProgressCanvasFooter(ctx,pageIndex,pages,manual){
  const footY=1120;
  ctx.fillStyle='#607991';ctx.font='16px Arial';
  biCanvasText(ctx,'Data terakhir diambil: '+(typeof exportTime==='function'?exportTime():'Belum tercatat')+
    (manual?' | '+manual+' assignment memakai status manual':''),
    65,footY+31,1500);
  ctx.textAlign='right';ctx.fillStyle='#1c578f';
  ctx.fillText('Halaman '+(pageIndex+1)+' / '+pages,1618,footY+31);
  ctx.textAlign='left';
}
const BI_PROGRES_PDF_PER_PAGE=14;
const BI_PROGRES_PDF_STATUS=[
  {label:'OPEN',header:['OPEN'],x:428,legendX:72},
  {label:'DRAFT',header:['DRAFT'],x:510,legendX:258},
  {label:'REJECTED BY PENGAWAS',header:['REJECTED','PENGAWAS'],x:597,legendX:445},
  {label:'SUBMITTED BY PENCACAH',header:['SUBMITTED','PENCACAH'],x:696,legendX:800},
  {label:'APPROVED BY PENGAWAS',header:['APPROVED','PENGAWAS'],x:793,legendX:1158}
];
function biProgresPdfPage(survey,pairs,pageIndex,pages,total,summary,manual){
  const {canvas,ctx}=biProgressCanvas(survey,pairs.length,2);
  const number=value=>format.format(value);
  const shownTotal=BI_PROGRES_PDF_STATUS.reduce((sum,{label})=>sum+(summary.get(label)||0),0);
  ctx.fillStyle='#edf5ff';ctx.fillRect(58,182,1568,126);
  ctx.fillStyle='#174679';ctx.font='bold 18px Arial';
  ctx.fillText('LEGENDA STATUS FASIH',72,209);
  BI_PROGRES_PDF_STATUS.forEach(({label,legendX})=>{
    ctx.fillStyle=biStatusColor(label);
    ctx.fillRect(legendX,225,24,24);
    ctx.fillStyle='#183e63';ctx.font='bold 17px Arial';
    ctx.fillText(label,legendX+34,243);
    ctx.font='17px Arial';
    ctx.fillText(number(summary.get(label)||0)+' assignment',legendX+34,270);
  });
  ctx.fillStyle='#365d82';ctx.font='17px Arial';
  ctx.fillText(number(total)+' assignment seluruh status · Grafik mencakup '+number(shownTotal)+' assignment pada lima status di atas.',72,297);
  ctx.fillStyle='#d9e9fa';ctx.fillRect(58,326,1568,62);
  ctx.fillStyle='#184574';ctx.font='bold 16px Arial';
  ctx.fillText('PPL',68,363);
  ctx.fillText('GRAFIK KOMPOSISI STATUS',858,363);
  ctx.fillText('PML',1372,363);
  ctx.textAlign='center';
  ctx.fillText('TOTAL',348,354);
  ctx.fillText('ASSIGNMENT',348,374);
  for(const {header,x} of BI_PROGRES_PDF_STATUS){
    header.forEach((line,i)=>ctx.fillText(line,x,header.length===1?363:354+i*20));
  }
  ctx.textAlign='left';
  const first=pageIndex*BI_PROGRES_PDF_PER_PAGE;
  pairs.slice(first,first+BI_PROGRES_PDF_PER_PAGE).forEach((entry,i)=>{
    const y=388+i*51;
    const byStatus=new Map(biRawStatusStats(entry.rows).map(({label,count})=>[label,count]));
    const counts=BI_PROGRES_PDF_STATUS.map(({label})=>byStatus.get(label)||0);
    const shown=counts.reduce((sum,count)=>sum+count,0);
    ctx.fillStyle=i%2?'#f6f9fd':'#ffffff';
    ctx.fillRect(58,y,1568,51);
    ctx.fillStyle='#163e68';ctx.font='18px Arial';
    biCanvasText(ctx,entry.ppl,68,y+32,214);
    biCanvasText(ctx,entry.pml,1372,y+32,239);
    ctx.textAlign='center';
    ctx.fillText(number(entry.rows.length),348,y+32);
    counts.forEach((count,j)=>ctx.fillText(number(count),BI_PROGRES_PDF_STATUS[j].x,y+32));
    ctx.textAlign='left';
    if(shown){
      const barX=858,barY=y+13,barW=492,barH=26;
      let left=0;
      counts.forEach((count,j)=>{
        if(!count)return;
        const right=left+barW*count/shown;
        ctx.fillStyle=biStatusColor(BI_PROGRES_PDF_STATUS[j].label);
        ctx.fillRect(barX+left,barY,right-left,barH);
        const label=number(count);
        ctx.font='bold 16px Arial';
        const labelWidth=ctx.measureText(label).width;
        if(right-left>=labelWidth+10){
          ctx.fillStyle='#153754';
          ctx.fillText(label,barX+(left+right-labelWidth)/2,barY+19);
        }
        left=right;
      });
    }else{
      ctx.fillStyle='#526b84';
      ctx.fillText('Tidak ada assignment pada lima status ini',858,y+32);
    }
    ctx.fillStyle='#edf2f8';ctx.fillRect(58,y+50,1568,1);
  });
  biProgressCanvasFooter(ctx,pageIndex,pages,manual);
  return canvas;
}
function biDownloadLink(blob,filename,label){
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;
  link.download=filename;
  link.textContent=label;
  setTimeout(()=>{
    URL.revokeObjectURL(url);
    link.removeAttribute('href');
  },10*60*1000);
  return link;
}
function biCanvasBlob(canvas,type,quality){
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>
    blob?resolve(blob):reject(new Error('Ekspor gambar tidak berhasil.')),type,quality));
}
function biAssignmentWrap(ctx,value,maxWidth){
  const lines=[];
  let line='';
  for(const word of String(value).match(/\S+/g)||[]){
    const next=line?line+' '+word:word;
    if(ctx.measureText(next).width<=maxWidth){line=next;continue;}
    if(line)lines.push(line);
    line='';
    for(const char of word){
      if(line&&ctx.measureText(line+char).width>maxWidth){lines.push(line);line='';}
      line+=char;
    }
  }
  lines.push(line);
  return lines;
}
function biAssignmentPages(report){
  const canvas=document.createElement('canvas');
  canvas.width=1600;
  canvas.height=1131;
  const ctx=canvas.getContext('2d',{alpha:false});
  if(!ctx)throw new Error('Canvas tidak tersedia untuk membuat laporan.');
  const margin=48,top=214,bottom=1054,lineHeight=23,rowPadding=12;
  const usableWidth=canvas.width-2*margin;
  const weight=report.columns.reduce((sum,column)=>sum+column.width,0);
  const widths=report.columns.map(column=>usableWidth*column.width/weight);
  const pages=[];
  let page=[],y=top;
  ctx.font='18px Arial';
  for(const item of report.items){
    const cells=report.columns.map(({key},i)=>{
      const value=item.cells[key]+(key==='assignment'&&item.row.boloStatusManual?
        ' · Status perhitungan manual: '+item.row.status:'');
      return biAssignmentWrap(ctx,value,widths[i]-24);
    });
    const length=Math.max(...cells.map(lines=>lines.length));
    let offset=0;
    while(offset<length){
      let capacity=Math.floor((bottom-y-2*rowPadding)/lineHeight);
      if(capacity<=0||(offset===0&&length<=Math.floor((bottom-top-2*rowPadding)/lineHeight)&&length>capacity)){
        pages.push(page);
        page=[];
        y=top;
        capacity=Math.floor((bottom-y-2*rowPadding)/lineHeight);
      }
      const size=Math.min(length-offset,capacity);
      const height=2*rowPadding+size*lineHeight;
      page.push({y,height,cells:cells.map(lines=>lines.slice(offset,offset+size)),odd:item.index%2});
      y+=height;
      offset+=size;
    }
  }
  if(page.length)pages.push(page);
  return {canvas,pages,draw(index){
    ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle='#174775';ctx.fillRect(0,0,canvas.width,153);
    ctx.fillStyle='#fff';ctx.font='bold 30px Arial';
    biCanvasText(ctx,'BOLO INPEK · '+report.title,margin,53,usableWidth);
    ctx.font='20px Arial';
    biCanvasText(ctx,report.context+' · '+format.format(report.items.length)+' assignment',margin,91,usableWidth);
    biCanvasText(ctx,'Data terakhir diambil: '+report.time,margin,124,usableWidth);
    ctx.fillStyle='#e8f2ff';ctx.fillRect(margin,164,usableWidth,50);
    ctx.fillStyle='#173b5e';ctx.font='bold 19px Arial';
    let x=margin;
    report.columns.forEach((column,i)=>{biCanvasText(ctx,column.label,x+12,196,widths[i]-24);x+=widths[i];});
    ctx.font='18px Arial';
    for(const row of pages[index]){
      ctx.fillStyle=row.odd?'#f2f7fd':'#fff';
      ctx.fillRect(margin,row.y,usableWidth,row.height);
      ctx.fillStyle='#193b5d';
      x=margin;
      row.cells.forEach((lines,i)=>{
        lines.forEach((line,j)=>ctx.fillText(line,x+12,row.y+rowPadding+17+j*lineHeight));
        x+=widths[i];
      });
      ctx.fillStyle='#dae5ef';ctx.fillRect(margin,row.y+row.height-1,usableWidth,1);
    }
    ctx.font='17px Arial';ctx.fillStyle='#55708d';
    ctx.fillText('BPS Kabupaten Blora · FASIH-SM',margin,1091);
    ctx.textAlign='right';ctx.fillText('Halaman '+(index+1)+' / '+pages.length,canvas.width-margin,1091);ctx.textAlign='left';
    return canvas;
  }};
}
async function biExportAssignmentList(type,report,feedback){
  const filename='BOLO_INPEK_Assignment_'+biReportName(report.context+'_'+report.title);
  if(type==='xlsx'){
    const XLSX=await loadExcelLibrary();
    const book=XLSX.utils.book_new();
    const columns=report.columns.some(c=>c.key==='originalStatus')?report.columns:
      [...report.columns,BI_ASSIGNMENT_COLUMNS.find(c=>c.key==='originalStatus')];
    const data=XLSX.utils.aoa_to_sheet([
      [...columns.map(c=>c.label),'Status Manual'],
      ...report.items.map(({row,cells})=>[
        ...columns.map(c=>cells[c.key]??c.value(row)),row.boloStatusManual?row.status:''
      ])
    ]);
    data['!cols']=[...columns.map(c=>({wch:c.width})),{wch:38}];
    data['!autofilter']={ref:data['!ref']};
    XLSX.utils.book_append_sheet(book,data,'Assignment');
    const info=XLSX.utils.aoa_to_sheet([
      ['BOLO INPEK',report.title],['Cakupan',report.context],
      ['Jumlah assignment',report.items.length],['Data terakhir diambil',report.time],
      ['Sumber','FASIH-SM melalui Google Sheets']
    ]);
    info['!cols']=[{wch:24},{wch:75}];
    XLSX.utils.book_append_sheet(book,info,'Informasi');
    XLSX.writeFile(book,filename+'.xlsx',{compression:true});
    feedback.textContent='Excel siap. Periksa unduhan browser.';
    return;
  }

  const reportPages=biAssignmentPages(report);
  const pageCount=reportPages.pages.length;
  if(type==='pdf'){
    const JsPDF=await biLoadPdfLib();
    const pdf=new JsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true});
    for(let i=0;i<pageCount;i++){
      if(i)pdf.addPage();
      pdf.addImage(reportPages.draw(i).toDataURL('image/jpeg',.92),'JPEG',0,0,
        pdf.internal.pageSize.getWidth(),pdf.internal.pageSize.getHeight());
    }
    pdf.save(filename+'.pdf');
    feedback.textContent='PDF siap. Periksa unduhan browser.';
    return;
  }

  const links=[];
  for(let i=0;i<pageCount;i++){
    const blob=await biCanvasBlob(reportPages.draw(i),'image/png');
    const suffix=pageCount>1?'_Halaman_'+(i+1):'';
    links.push(biDownloadLink(blob,filename+suffix+'.png','Gambar '+(i+1)));
  }
  if(links.length===1){
    document.body.append(links[0]);links[0].click();links[0].remove();
    feedback.textContent='Gambar siap. Periksa unduhan browser.';
  }else{
    feedback.textContent='Unduh gambar per halaman: ';
    for(const link of links){
      link.className='export-button';
      feedback.append(link);
    }
  }
}
function biDirectReportUrl(survey){
  const url=new URL('https://bpsblora.github.io/bolo-inpek/');
  url.searchParams.set('survei',survey);
  return url.href;
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
  const isPdf=button.dataset.biExport==='pdf';
  const pages=Math.ceil(pairs.length/(isPdf?BI_PROGRES_PDF_PER_PAGE:17));
  const namePart=biReportName(survey)+'_'+biReportName(pml||'Seluruh_PPL');
  const multiPart=!isPdf&&pages>5;
  const filename='BOLO_INPEK_Progres_PPL_'+namePart+(isPdf?'.pdf':'.png');
  siblings.forEach(x=>x.disabled=true);
  if(feedback)feedback.textContent='Menyiapkan '+(isPdf?'PDF':'gambar')+'…';
  try{
    const downloads=[];
    if(isPdf){
      const JsPDF=await biLoadPdfLib();
      const doc=new JsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true});
      const byStatus=new Map(biRawStatusStats(rows).map(({label,count})=>[label,count]));
      for(let i=0;i<pages;i++){
        const canvas=biProgresPdfPage(survey,pairs,i,pages,rows.length,byStatus,summary.manual);
        if(i>0)doc.addPage('a4','landscape');
        doc.addImage(canvas.toDataURL('image/jpeg',0.95),'JPEG',0,0,297,210);
      }
      downloads.push({blob:doc.output('blob'),filename});
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
        downloads.push({blob,filename:multiPart?filename.replace(/\.png$/,'_Bagian_'+part+'.png'):filename});
        startPage+=portion;part++;
      }
    }
    if(feedback)feedback.textContent='';
    if(multiPart&&feedback){
      downloads.forEach(({blob,filename},i)=>{
        if(i)feedback.append(' · ');
        feedback.append(biDownloadLink(blob,filename,'Unduh Gambar Bagian '+(i+1)));
      });
    }else{
      const link=biDownloadLink(downloads[0].blob,downloads[0].filename,'');
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
  }catch(error){
    if(feedback)feedback.textContent='Gagal ekspor: '+(error.message||String(error));
  }finally{
    siblings.forEach(x=>x.disabled=false);
  }
}
