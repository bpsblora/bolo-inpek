
/* BOLO INPEK · Visualisasi status petugas — berbasis data monitoring asli. */
const biView={mode:'grafik',pml:'',ppl:''};
const biBuckets=[
  {id:'pending',label:'Belum Submit',color:'#f0a45a'},
  {id:'sent',label:'Terkirim',color:'#4c89d5'},
  {id:'approved',label:'Disetujui / Selesai',color:'#298c70'},
  {id:'revision',label:'Perlu Perbaikan',color:'#d65b73'},
  {id:'other',label:'Status Lain',color:'#98a7ba'}
];
function biStatusBucket(value){
  const s=String(value||'').trim().toUpperCase();
  if(s==='OPEN'||s==='DRAFT')return 'pending';
  if(s.startsWith('REJECTED')||s.startsWith('REVOKED'))return 'revision';
  if(s.startsWith('COMPLETED')||s.startsWith('APPROVED'))return 'approved';
  if(s.startsWith('SUBMITTED')||s.startsWith('EDITED'))return 'sent';
  return 'other';
}
function biCounts(rows){
  const out={pending:0,sent:0,approved:0,revision:0,other:0};
  for(const row of rows)out[biStatusBucket(row.status)]++;
  return out;
}
function biSurveyList(){return surveiUrutDeadline().filter(surveiMasihAktif);}
function biBar(rows,label){
  const counts=biCounts(rows);
  const segments=biBuckets.map(b=>{
    const n=counts[b.id];if(!n)return '';
    const width=(n/rows.length*100).toFixed(3);
    return '<span class="bi-seg" style="width:'+width+'%;background:'+b.color+'" title="'+esc(b.label+': '+n)+'"></span>';
  }).join('');
  return '<span class="bi-stack" role="img" aria-label="'+esc(label+' — '+biBuckets.map(b=>b.label+': '+counts[b.id]).join('; '))+'">'+segments+'</span>';
}
function biLegend(){
  return '<div class="bi-legend">'+biBuckets.map(b=>
    '<span><i style="background:'+b.color+'"></i>'+esc(b.label)+'</span>').join('')+'</div>';
}
function biSummary(){
  const surveys=biSurveyList();
  const total=biCounts(DATA.filter(r=>surveys.includes(r.survei))).pending;
  return '<section class="bi-summary" aria-labelledby="bi-summary-h">'+
    '<div class="bi-head"><div><div class="bi-eyebrow">RINGKASAN MONITORING</div><h2 id="bi-summary-h">Belum Submit per Survei</h2>'+
    '<p>Jumlah assignment dengan status OPEN atau DRAFT.</p></div>'+
    '<span class="bi-county-total"><strong>'+total+'</strong> Belum Submit · Kabupaten</span></div>'+
    '<div class="bi-summary-grid">'+(surveys.map(survey=>{
      const rows=DATA.filter(r=>r.survei===survey),pending=biCounts(rows).pending;
      return '<button type="button" class="bi-summary-tile'+(state.survey===survey?' selected':'')+
        '" data-level="survey" data-value="'+esc(survey)+'">'+
        '<span class="bi-summary-name">'+esc(survey)+'</span>'+
        '<span class="bi-summary-num">'+format.format(pending)+'</span>'+
        '<span class="bi-summary-meta">dari '+format.format(rows.length)+' assignment · '+percent(pending,rows.length)+'</span></button>';
    }).join('')||'<p class="bi-empty">Belum ada survei aktif.</p>')+'</div>'+
    '<p class="bi-footnote">Belum Submit = OPEN + DRAFT. REJECTED/REVOKED ditampilkan terpisah sebagai Perlu Perbaikan; tidak dihitung sebagai belum submit.</p></section>';
}
function biTabs(){
  const surveys=biSurveyList();
  const data=[{name:'Semua Survei',value:null}].concat(surveys.map(name=>({name,value:name})));
  return '<section class="bi-filters" aria-label="Filter Survei"><div class="bi-filter-title">FILTER SURVEI · PILIH UNTUK MELIHAT DETAIL</div>'+
    '<div class="bi-chip-row" role="group" aria-label="Pilih survei">'+data.map(item=>{
      const count=DATA.filter(r=>item.value===null?surveys.includes(r.survei):r.survei===item.value).length;
      const active=state.survey===item.value;
      return '<button type="button" data-level="'+(item.value===null?'home':'survey')+
        '" data-value="'+esc(item.value||'')+'" aria-pressed="'+active+'" class="bi-survey-chip'+(active?' selected':'')+'">'+
        '<b>'+esc(item.name)+'</b><small>'+format.format(count)+' assignment</small></button>';
    }).join('')+'</div></section>';
}
function biRoleNames(rows,key){
  return [...new Set(rows.map(r=>name(r,key)))].sort((a,b)=>a===UNASSIGNED?1:b===UNASSIGNED?-1:a.localeCompare(b,'id'));
}
function biRoleContent(rows,key){
  const names=biRoleNames(rows,key);
  if(!names.length)return '<div class="bi-empty">Tidak ada assignment untuk petugas atau filter yang dipilih.</div>';
  if(biView.mode==='tabel'){
    const body=names.map(person=>{
      const group=rows.filter(r=>name(r,key)===person),c=biCounts(group);
      return '<tr><td><button class="bi-link" data-level="'+key+'" data-value="'+esc(person)+'">'+esc(person)+' →</button></td>'+
        '<td>'+group.length+'</td>'+biBuckets.map(b=>'<td>'+c[b.id]+'</td>').join('')+'</tr>';
    }).join('');
    return '<div class="tablebox"><table class="bi-table"><thead><tr><th>'+key.toUpperCase()+'</th><th>Total</th>'+
      biBuckets.map(b=>'<th>'+esc(b.label)+'</th>').join('')+'</tr></thead><tbody>'+body+'</tbody></table></div>';
  }
  return '<div class="bi-bars">'+names.map(person=>{
    const group=rows.filter(r=>name(r,key)===person),counts=biCounts(group);
    return '<button type="button" class="bi-bar-row" data-level="'+key+'" data-value="'+esc(person)+'">'+
      '<span class="bi-name">'+esc(person)+'</span>'+biBar(group,person)+
      '<span class="bi-row-stat"><strong>'+counts.pending+' belum</strong>'+group.length+' assignment</span></button>';
  }).join('')+'</div>';
}
function biPanel(rows,key){
  const label=key==='pml'?'Pengawas / PML':'Pencacah / PPL';
  return '<section class="bi-panel"><div class="bi-role-head"><h2>Progres '+label+'</h2>'+
    '<small>'+biRoleNames(rows,key).length+' petugas</small></div>'+
    biRoleContent(rows,key)+(biView.mode==='grafik'?biLegend():'')+'</section>';
}
function biKpis(rows){
  const c=biCounts(rows);
  const items=[
    ['Total Assignment',rows.length,'seluruh status',false],
    ['Belum Submit',c.pending,'OPEN / DRAFT',true],
    ['Terkirim & Disetujui',c.sent+c.approved,'proses dan selesai',false],
    ['Perlu Perbaikan',c.revision,'REJECTED / REVOKED',false]
  ];
  return '<div class="bi-kpis">'+items.map(([label,n,note,warn])=>
    '<div class="bi-kpi'+(warn?' alert':'')+'"><span>'+label+'</span><strong>'+format.format(n)+'</strong><small>'+note+'</small></div>').join('')+'</div>';
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
  const legendStops=biBuckets.map(b=>b.color+' '+(all.length?(count[b.id]/all.length*100).toFixed(2):0)+'%').join(',');
  const donutColor=all.length?('conic-gradient('+Object.entries(count).reduce((agg,[id,n])=>{
    const bucket=biBuckets.find(b=>b.id===id);const start=agg.end;const end=start+n/all.length*100;
    agg.parts.push(bucket.color+' '+start+'% '+end+'%');agg.end=end;return agg;
  },{end:0,parts:[]}).parts.join(',')+')'):'#e3ecf6';
  const head='<div class="bi-survey-head card"><div style="display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap">'+
    '<div>'+title('Progres '+survey,'Grafik progres dan rincian petugas dari FASIH.',all.length)+periodeHtml(survey)+'</div>'+
    '<div class="bi-donut" style="background:'+donutColor+'"><div class="bi-donut-center"><strong>'+percent(count.approved,all.length)+'</strong><small>Disetujui / Selesai</small></div></div></div>'+
    '<div class="bi-head-actions">'+exportButtons(survey)+tombolTindakLanjut(survey)+
    '<p class="export-feedback" role="status" aria-live="polite"></p></div></div>';
  const controls=biControls(all);
  const filtered=all.filter(r=>(!biView.pml||name(r,'pml')===biView.pml)&&(!biView.ppl||name(r,'ppl')===biView.ppl));
  return head+biKpis(all)+controls+biPanel(filtered,'pml')+biPanel(filtered,'ppl');
}
function biOverview(){
  const surveys=biSurveyList();
  return '<div class="bi-panel"><div class="bi-role-head"><h2>Grafik Progres Seluruh Survei</h2>'+
    '<small>Pilih survei untuk membuka PML/PPL</small></div>'+
    '<div class="bi-bars">'+surveys.map(survey=>{
      const rows=DATA.filter(r=>r.survei===survey),pending=biCounts(rows).pending;
      return '<button class="bi-bar-row" data-level="survey" data-value="'+esc(survey)+'">'+
        '<span class="bi-name">'+esc(survey)+'</span>'+biBar(rows,survey)+
        '<span class="bi-row-stat"><strong>'+pending+' belum</strong>'+rows.length+' assignment</span></button>';
    }).join('')+'</div>'+biLegend()+'</div>';
}
