
/* BOLO INPEK · Visualisasi status petugas — berbasis data monitoring asli. */
const biView={
  mode:'grafik',pml:'',ppl:'',
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
  {id:'pending',label:'Belum Submit',color:'#cbdcf0'},
  {id:'sent',label:'Terkirim',color:'#84b2df'},
  {id:'approved',label:'Disetujui / Selesai',color:'#265e9e'},
  {id:'revision',label:'Perlu Perbaikan',color:'#5289bd'},
  {id:'other',label:'Status Lain',color:'#a9bdcf'}
];
function biStatusBucket(value){
  const s=String(value||'').trim().toUpperCase();
  if(s==='OPEN'||s==='DRAFT')return 'pending';
  if(s.startsWith('REJECTED')||s.startsWith('REVOKED'))return 'revision';
  if(s.startsWith('COMPLETED')||s.startsWith('APPROVED'))return 'approved';
  if(s.startsWith('SUBMITTED'))return 'sent';
  return 'other';
}
function biCounts(rows){
  // Lima kelompok visual eksklusif, supaya total tidak dihitung ganda.
  // Sudah Submit adalah METRIK TURUNAN: mencakup terkirim, disetujui,
  // selesai, REJECTED dan REVOKED pada semua tingkat pemeriksaan.
  // Status tidak tersedia/tidak dirinci tidak dipaksa menjadi Sudah Submit.
  const out={pending:0,sent:0,approved:0,revision:0,other:0,submitted:0};
  for(const row of rows)out[biStatusBucket(row.status)]++;
  out.submitted=out.sent+out.approved+out.revision;
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
  const activeRows=DATA.filter(r=>surveys.includes(r.survei));
  const submitted=biCounts(activeRows).submitted;
  const denominator=activeRows.length;
  return '<section class="bi-summary" aria-labelledby="bi-summary-h">'+
    '<div class="bi-head"><div><div class="bi-eyebrow">RINGKASAN MONITORING</div><h2 id="bi-summary-h">Capaian Sudah Submit per Survei</h2>'+
    '<p>Ketuk kartu survei untuk melihat progres PML dan PPL. Kartu ini sekaligus menjadi filter survei.</p></div>'+
    '<div class="bi-summary-actions"><span class="bi-county-total"><strong>'+
    (denominator?percent(submitted,denominator):'—')+'</strong>'+
    '<span>'+format.format(submitted)+' dari '+format.format(denominator)+' assignment sudah submit · Kabupaten</span></span>'+
    (state.survey===null?'':'<button class="bi-back-all" type="button" data-level="home" data-value="">← Semua Survei</button>')+
    '</div></div>'+
    '<div class="bi-summary-grid">'+(surveys.map(survey=>{
      const rows=DATA.filter(r=>r.survei===survey),submitted=biCounts(rows).submitted;
      return '<button type="button" class="bi-summary-tile'+(state.survey===survey?' selected':'')+
        '" data-level="survey" data-value="'+esc(survey)+'">'+
        '<span class="bi-summary-name">'+esc(survey)+'</span>'+
        '<span class="bi-summary-num">'+(rows.length?percent(submitted,rows.length):'—')+'</span>'+
        '<span class="bi-summary-meta">'+format.format(submitted)+' dari '+format.format(rows.length)+' assignment Sudah Submit</span>'+ 
        '<span class="bi-summary-track"><span style="width:'+(rows.length?Math.min(100,submitted/rows.length*100):0)+'%"></span></span></button>';
    }).join('')||'<p class="bi-empty">Belum ada survei aktif.</p>')+'</div>'+
    '<p class="bi-footnote">Belum Submit = OPEN/DRAFT (belum dikirim PPL). Semua tahap SUBMITTED, APPROVED, REJECTED, REVOKED dan COMPLETED termasuk Sudah Submit. Perlu Perbaikan merupakan bagian dari Sudah Submit. Status yang tidak tersedia tetap terpisah.</p></section>';
}
function biRoleNames(rows,key){
  // PPL: urutkan jumlah SUDAH SUBMIT (termasuk REJECTED/REVOKED).
  // PML: urutkan jumlah APPROVED/COMPLETED menurut status FASIH terakhir.
  // Tidak menyimpulkan pernah approve dari status REJECTED/REVOKED.
  const groups=new Map();
  rows.forEach(row=>{
    const person=name(row,key);
    if(!groups.has(person))groups.set(person,[]);
    groups.get(person).push(row);
  });
  const metric=key==='pml'?'approved':'submitted';
  const stats=new Map([...groups].map(([person,group])=>[person,biCounts(group)]));
  return [...groups.keys()].sort((a,b)=>{
    if(a===UNASSIGNED&&b!==UNASSIGNED)return 1;
    if(b===UNASSIGNED&&a!==UNASSIGNED)return -1;
    return stats.get(b)[metric]-stats.get(a)[metric] ||
      groups.get(b).length-groups.get(a).length ||
      a.localeCompare(b,'id');
  });
}
function biRoleContent(rows,key){
  const names=biRoleNames(rows,key);
  if(!names.length)return '<div class="bi-empty">Tidak ada assignment untuk petugas atau filter yang dipilih.</div>';
  const metric=key==='pml'?'approved':'submitted';
  const metricName=key==='pml'?'Approved / Completed':'Sudah Submit';
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
      '<span>'+(key==='pml'?'Approved / Completed':'Sudah Submit')+'</span></span></button>';
  }).join('')+'</div>';
}
function biPanel(rows,key){
  const label=key==='pml'?'Pengawas / PML':'Pencacah / PPL';
  const rank=key==='pml'?'Approved / Completed':'Sudah Submit';
  return '<section class="bi-panel"><div class="bi-role-head"><div><h2>Progres '+label+'</h2>'+
    '<small>Urutan: '+rank+' terbanyak ke paling sedikit.</small></div>'+
    '<div class="bi-panel-tools"><small>'+biRoleNames(rows,key).length+' petugas</small>'+
    biUnitControl(key)+'</div></div>'+
    biRoleContent(rows,key)+(biView.mode==='grafik'?biLegend():'')+'</section>';
}
function biKpis(rows){
  const c=biCounts(rows);
  const items=[
    ['Total Assignment',rows.length,'seluruh status',false],
    ['Belum Submit',c.pending,'OPEN / DRAFT',true],
    ['Sudah Submit',c.submitted,'termasuk REJECTED / REVOKED',false],
    ['Perlu Perbaikan',c.revision,'bagian dari Sudah Submit',false]
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
  // Gunakan hanya kategori visual eksklusif, bukan "submitted" (turunan),
  // agar setiap assignment menempati tepat satu segmen grafik.
  const donutColor=all.length?('conic-gradient('+biBuckets.reduce((agg,bucket)=>{
    const n=count[bucket.id];const start=agg.end;const end=start+n/all.length*100;
    if(n>0)agg.parts.push(bucket.color+' '+start+'% '+end+'%');
    agg.end=end;return agg;
  },{end:0,parts:[]}).parts.join(',')+')'):'#e3ecf6';
  const head='<div class="bi-survey-head card"><div style="display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap">'+
    '<div>'+title('Progres '+survey,'Grafik progres dan rincian petugas dari FASIH.',all.length)+periodeHtml(survey)+'</div>'+
    '<div class="bi-donut-area">'+biUnitControl('survey')+
    '<div class="bi-donut" style="background:'+donutColor+'"><div class="bi-donut-center"><strong>'+
    (biUnitMode('survey')==='persentase'?(all.length?percent(count.submitted,all.length):'—'):format.format(count.submitted))+
    '</strong><small>Sudah Submit</small><span>'+format.format(count.submitted)+' / '+format.format(all.length)+'</span></div></div></div></div>'+
    '<div class="bi-head-actions">'+exportButtons(survey)+tombolTindakLanjut(survey)+
    '<p class="export-feedback" role="status" aria-live="polite"></p></div></div>';
  const controls=biControls(all);
  const filtered=all.filter(r=>(!biView.pml||name(r,'pml')===biView.pml)&&(!biView.ppl||name(r,'ppl')===biView.ppl));
  return head+biKpis(all)+controls+biPanel(filtered,'pml')+biPanel(filtered,'ppl')+
    biPplDetailPanel(survey)+biPmlCards(survey);
}
function biOverview(){
  const surveys=biSurveyList();
  return '<div class="bi-panel"><div class="bi-role-head"><h2>Grafik Progres Seluruh Survei</h2>'+
    '<div class="bi-panel-tools"><small>Pilih survei untuk membuka PML/PPL</small>'+
    biUnitControl('overview')+'</div></div>'+
    '<div class="bi-bars">'+surveys.map(survey=>{
      const rows=DATA.filter(r=>r.survei===survey),submitted=biCounts(rows).submitted;
      return '<button class="bi-bar-row" data-level="survey" data-value="'+esc(survey)+'">'+
        '<span class="bi-name">'+esc(survey)+'</span>'+biBar(rows,survey)+
        '<span class="bi-row-stat"><strong>'+biUnitText(submitted,rows.length,'overview')+'</strong>'+
          '<span>Sudah Submit</span></span></button>';
    }).join('')+'</div>'+biLegend()+'</div>';
}


/* Report khusus PPL: pasangan (PPL, PML) tidak boleh digabung lintas pengawas. */
function biPplPmlPairs(rows){
  const map=new Map();
  rows.forEach(row=>{
    const ppl=name(row,'ppl'),pml=name(row,'pml');
    const key=JSON.stringify([ppl,pml]);
    if(!map.has(key))map.set(key,{ppl,pml,rows:[]});
    map.get(key).rows.push(row);
  });
  return [...map.values()].sort((a,b)=>{
    const sa=biCounts(a.rows).submitted,sb=biCounts(b.rows).submitted;
    return sb-sa || b.rows.length-a.rows.length ||
      a.pml.localeCompare(b.pml,'id') || a.ppl.localeCompare(b.ppl,'id');
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
  const pairs=biPplPmlPairs(rows);
  return '<section class="bi-panel" aria-label="Rincian progres PPL dengan PML">'+
    '<div class="bi-role-head"><div><h2>Rincian Progres Seluruh PPL</h2>'+
    '<small>Urut dari jumlah Sudah Submit PPL terbanyak. PML tetap pada kolom paling kanan.</small></div>'+
    '<small>'+pairs.length+' pasangan PPL–PML</small></div>'+
    '<div class="bi-export-banner"><div><h3>Laporan Seluruh PPL · '+esc(survey)+'</h3>'+
    '<p>Gambar dan PDF memuat progres setiap PPL, status assignment, grafik, serta PML penanggung jawab. Ekspor seluruh survei, tidak terpengaruh filter layar.</p></div>'+
    biExportButtons(survey,null)+'<p class="bi-feedback" role="status" aria-live="polite"></p></div>'+
    (pairs.length?'<div class="tablebox"><table class="bi-ppl-table"><thead><tr>'+
      '<th>PPL</th><th>Assignment</th><th>Belum Submit</th><th>Sudah Submit</th><th>Terkirim</th><th>Disetujui / Selesai</th><th>Perbaikan</th><th>Progres</th><th>PML</th>'+
      '</tr></thead><tbody>'+pairs.map(entry=>{
        const c=biCounts(entry.rows);
        return '<tr><td>'+esc(entry.ppl)+'</td><td>'+entry.rows.length+'</td><td>'+c.pending+'</td>'+
          '<td><strong>'+c.submitted+'</strong></td><td>'+c.sent+'</td><td>'+c.approved+'</td><td>'+c.revision+'</td>'+
          '<td class="bi-mini-stack">'+biBar(entry.rows,entry.ppl)+'</td>'+
          '<td>'+esc(entry.pml)+'</td></tr>';
      }).join('')+'</tbody></table></div>':
      '<div class="bi-empty">Belum ada PPL untuk survei ini.</div>')+
    '<p class="bi-ppl-footnote">Sudah Submit mencakup Terkirim, Disetujui/Selesai, dan Perbaikan (REJECTED/REVOKED); kolom Perbaikan adalah rincian, bukan tambahan. Status Lain tidak disimpulkan sebagai Sudah Submit. Jika PPL bekerja di bawah dua PML, barisnya dipisah agar progres tidak tertukar.</p></section>';
}
function biPmlCards(survey){
  const rows=DATA.filter(row=>row.survei===survey);
  const names=biRoleNames(rows,'pml');
  return '<section class="bi-pml-collection"><div class="bi-role-head"><div>'+
    '<h2>Progres PPL per PML</h2><small>Urut dari jumlah Approved / Completed PML terbanyak. Setiap PML bisa mengunduh laporan sendiri.</small>'+
    '</div><small>'+names.length+' PML</small></div>'+
    (names.length?'<div class="bi-pml-grid">'+names.map(pml=>{
      const group=rows.filter(row=>name(row,'pml')===pml);
      const pairs=biPplPmlPairs(group),stats=biCounts(group);
      return '<article class="bi-pml-card"><div class="bi-pml-top"><div><strong>'+esc(pml)+'</strong>'+
        '<small>'+pairs.length+' PPL · '+group.length+' assignment</small></div>'+
        '<span class="bi-pml-count">'+stats.approved+' approve · '+stats.pending+' belum</span></div>'+
        biBar(group,pml)+biExportButtons(survey,pml)+
        '<p class="bi-feedback" role="status" aria-live="polite"></p>'+
        '<details><summary>Lihat progres '+pairs.length+' PPL</summary>'+
        pairs.map(item=>{
          const n=biCounts(item.rows);
          return '<div class="bi-pml-minirow"><span>'+esc(item.ppl)+'</span>'+
            '<b>'+n.submitted+' sudah · '+n.pending+' belum / '+item.rows.length+'</b></div>';
        }).join('')+'</details></article>';
    }).join('')+'</div>':'<div class="bi-empty">Belum ada PML pada survei ini.</div>')+
    '</section>';
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
  biCanvasText(ctx,'Survei: '+survey,58,104,1250);
  biCanvasText(ctx,'Cakupan: '+(pml===null?'Seluruh PPL':('PML '+pml)),58,135,1300);
  ctx.textAlign='right';ctx.font='bold 24px Arial';ctx.fillStyle='#ffffff';
  ctx.fillText('BPS KABUPATEN BLORA',1620,55);ctx.textAlign='left';
  ctx.fillStyle='#edf5ff';ctx.fillRect(58,186,1568,101);
  const stats=[
    ['ASSIGNMENT',totalCounts.total],
    ['BELUM SUBMIT',totalCounts.pending],
    ['SUDAH SUBMIT',totalCounts.submitted],
    ['TERKIRIM',totalCounts.sent],
    ['DISETUJUI',totalCounts.approved],
    ['PERBAIKAN',totalCounts.revision],
    ['LAINNYA',totalCounts.other]
  ];
  stats.forEach(([label,n],i)=>{
    const x=75+i*220;
    ctx.fillStyle='#5c7390';ctx.font='bold 14px Arial';ctx.fillText(label,x,220);
    ctx.font='bold 30px Arial';ctx.fillStyle=i===1?'#b75c21':'#174679';
    ctx.fillText(String(n),x,260);
  });
  const headings=[
    ['PPL',68],['TOTAL',330],['BELUM',400],['SUDAH',480],
    ['KIRIM',580],['SETUJU',660],['REVISI',745],['LAIN',820],
    ['GRAFIK PROGRES',923],['PML',1303]
  ];
  ctx.fillStyle='#d9e9fa';ctx.fillRect(58,311,1568,51);
  ctx.fillStyle='#184574';ctx.font='bold 17px Arial';
  headings.forEach(([text,x])=>ctx.fillText(text,x,342));
  const first=pageIndex*17,part=pairs.slice(first,first+17);
  part.forEach((entry,i)=>{
    const y=362+i*43;
    ctx.fillStyle=i%2?'#f6f9fd':'#ffffff';
    ctx.fillRect(58,y,1568,43);
    const c=biCounts(entry.rows);
    ctx.font='18px Arial';ctx.fillStyle='#163e68';
    biCanvasText(ctx,entry.ppl,68,y+28,246);
    const values=[entry.rows.length,c.pending,c.submitted,c.sent,c.approved,c.revision,c.other];
    [330,400,480,580,660,745,820].forEach((x,j)=>{ctx.fillStyle=j===1?'#ad5520':j===2?'#166b54':'#183e63';ctx.fillText(String(values[j]),x,y+28);});
    const barX=927,barY=y+15,barW=326,barH=14;
    ctx.fillStyle='#dce5f1';ctx.fillRect(barX,barY,barW,barH);
    let left=0;
    for(const b of biBuckets){const n=c[b.id];if(!n)continue;
      const length=barW*n/entry.rows.length;ctx.fillStyle=b.color;
      ctx.fillRect(barX+left,barY,length,barH);left+=length;
    }
    ctx.fillStyle='#184875';biCanvasText(ctx,entry.pml,1303,y+28,300);
    ctx.fillStyle='#edf2f8';ctx.fillRect(58,y+42,1568,1);
  });
  const footY=1120;
  ctx.fillStyle='#607991';ctx.font='16px Arial';
  ctx.fillText('Belum Submit = OPEN / DRAFT   |   Sudah Submit termasuk REJECTED / REVOKED (Perbaikan)',65,footY);
  ctx.fillText('Data terakhir FASIH: '+(typeof exportTime==='function'?exportTime():'Sesuai monitoring'),65,footY+31);
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
  const pairs=biPplPmlPairs(rows);
  const feedback=button.closest('.bi-export-banner, .bi-pml-card')?.querySelector('.bi-feedback');
  const siblings=button.closest('.bi-export-buttons')?.querySelectorAll('button')||[button];
  if(!pairs.length){if(feedback)feedback.textContent='Belum ada assignment PPL untuk diekspor.';return;}
  const c=biCounts(rows),summary={...c,total:rows.length};
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
