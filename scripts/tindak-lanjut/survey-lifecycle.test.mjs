import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';

const source=readFileSync(new URL('../../backend/tindak-lanjut/TindakLanjut_SiklusSurvei.gs',import.meta.url),'utf8');
const survey={survey_id:'survey',survey_period_id:'period',nama_survei:'Contoh',nama_periode:'2026',
  status_operasional:'AKTIF',_row:2};
const key_=r=>JSON.stringify([r.survey_id,r.survey_period_id]);
function stub(){
  const record={...survey};
  const archive=[],notes=[],books=[];
  let failTable='', registryActive=true, periodActive=true;
  function book(){
    const sheets=new Map();
    const value={
      sheets,getId:()=>String(books.indexOf(value)+1),
      getUrl:()=> 'https://docs.google.com/spreadsheets/d/'+value.getId(),
      getSheetByName:n=>sheets.get(n),sheet(n,rows){
        const table={
          rows:rows.map(row=>[...row]),getDataRange:()=>({getDisplayValues:()=>table.rows}),
          getLastRow:()=>table.rows.length,getMaxRows:()=>100,
          getRange(start,_,length){
            const range={setNumberFormat:()=>range,setValues(values){table.rows.splice(start-1,length,...values)},
              getDisplayValues:()=>table.rows.slice(start-1,start-1+length)};
            return range;
          }
        };
        sheets.set(n,table);
      }
    };
    books.push(value);
    return value;
  }
  const env={
    SpreadsheetApp:{
      openById(id){
        if(id!=='monitor')return books[Number(id)-1];
        return {getSheetByName(tab){
          const config=tab==='konfigurasi_survei';
          return {
            getDataRange:()=>({getDisplayValues:()=>config?
              [['survey_id','survey_period_id','aktif'],['survey','period',registryActive]]:
              [['survey_period_id','aktif'],['period',periodActive]]}),
            getRange:()=>({setValue(value){if(config)registryActive=value;else periodActive=value}})
          };
        }};
      },create:book,flush(){}
    },
    DriveApp:{getFileById:()=>({moveTo(){}}),getFolderById:()=>({})},
    TL:{folder:'folder',headers:{tindak_lanjut:['riwayat_id','assignment_id','catatan'],kontak:['kontak_id']}},
    TL_MON:{id:'monitor'},lock_:fn=>fn(),session_:token=>{if(token!=='admin')throw Error('Admin');return {email:'admin'}},
    db_:()=>null,read_:(_,tab)=>tab==='arsip'?archive:[record],survey_:()=>({...record}),key_,
    text_:String,safe_:String,now_:()=> '2026-11-16T01:00:00Z',uid_:()=>String(archive.length+1),
    patch_:(_,tab,row,change)=>Object.assign(tab==='arsip'?archive[row-2]:record,change),
    append_:(_,tab,rows)=>rows.forEach(r=>archive.push({...r,_row:archive.length+2})),
    cleanup_:(_,k,a)=>{notes.length=0;archive[a._row-2].status_arsip='BERSIH'},
    snapshot_:()=>({assignment:[{...survey,assignment_id:'one',waktu_data_monitoring:'2026-11-16'}],
      history:[...notes],contacts:[],belumSelesai:0}),
    matrix_:(headers,rows)=>[headers,...rows.map(r=>headers.map(k=>r[k]||''))],
    archiveTable_(book,name,rows){if(failTable===name)throw Error('Simulasi gagal tulis');book.sheet(name,rows)}
  };
  createContext(env);
  runInContext(source,env);
  return {env,record,archive,books,notes,active:()=>[registryActive,periodActive],
    fail(name){failTable=name}};
}
test('close → restore → close writes to one spreadsheet and preserves old and new notes',()=>{
  const s=stub(),k=key_(survey);
  assert.throws(()=>s.env.apiKelolaSiklusSurvei('operator'),/Admin/);
  s.notes.push({riwayat_id:'first',assignment_id:'one',catatan:'Catatan awal'});
  const first=s.env.tlSurveyClose_('admin',k,'Penutupan awal',true);
  assert.equal(s.record.status_operasional,'DITUTUP');
  assert.deepEqual(s.active(),[false,false]);
  s.env.tlSurveyRestore_('admin',survey,true);
  assert.equal(s.record.status_operasional,'AKTIF');
  assert.deepEqual(s.active(),[true,true]);
  s.notes.push({riwayat_id:'second',assignment_id:'one',catatan:'Catatan setelah pulih'});
  s.fail('Ringkasan');
  assert.throws(()=>s.env.tlSurveyClose_('admin',k,'Penutupan kedua',true),/gagal tulis/);
  assert.equal(s.record.status_operasional,'PENGARSIPAN');
  assert.equal(s.notes.length,1);
  assert.deepEqual(s.active(),[false,false]);
  s.fail('');
  const second=s.env.tlSurveyClose_('admin',k,'Penutupan kedua',true);
  assert.equal(first.url,second.url);
  assert.equal(s.books.length,1);
  assert.equal(s.env.apiKelolaSiklusSurvei('admin')[0].arsip_url,first.url);
  assert.deepEqual(Array.from(s.books[0].sheets.get('Riwayat tindak lanjut').rows.slice(1),r=>r[2]),
    ['Catatan awal','Catatan setelah pulih']);
  assert.equal(s.books[0].sheets.get('Riwayat penyelesaian').rows.length,3);
  assert.equal(s.env.tlSurveyClose_('admin',k,'Penutupan kedua',true).url,first.url);
  assert.equal(s.archive.length,2);
});
