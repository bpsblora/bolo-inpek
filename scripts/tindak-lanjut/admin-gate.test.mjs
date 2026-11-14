import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {Script} from 'node:vm';

const root=process.cwd();
const page=readFileSync(join(root,'index.html'),'utf8');
const tl=readFileSync(join(root,'backend/tindak-lanjut/Index_TindakLanjutV2.html'),'utf8');
const begin=page.lastIndexOf('<script>\n(()=>{');
const end=page.indexOf('</script>',begin);
if(begin<0||end<0)throw Error('Controller login admin pada index.html tidak ditemukan.');
const controller=page.slice(begin+'<script>\n'.length,end);

function sandbox(){
  const allIds=['tlPopup','tlFrame','adminEnter','adminTools','adminExit','adminTlMenu',
    'adminInfo','tlPopupTitle','tlClose','boloUpdaterOpen','adminStaffMenu','adminStaffPending'];
  const el=id=>({
    id,hidden:false,open:false,src:'',textContent:'',
    listeners:{},addEventListener(type,cb){this.listeners[type]=cb;},
    focus(){this.focused=true;},click(){this.listeners.click?.({preventDefault(){}})},
    showModal(){this.open=true;},
    close(){this.open=false;this.listeners.close?.();}
  });
  const elements=Object.fromEntries(allIds.map(id=>[id,el(id)]));
  elements.adminTools.hidden=true;
  const document={
    activeElement:{isConnected:true,focus(){}},
    documentElement:{style:{}},
    listeners:{},
    getElementById:id=>elements[id],
    addEventListener(type,fn){this.listeners[type]=fn;}
  };
  const window={
    crypto:{getRandomValues:bytes=>bytes.fill(7)},
    listeners:{},
    addEventListener(type,fn){this.listeners[type]=fn;}
  };
  const admin={verified:false,nonce:'',nama:'',email:'',since:0};
  const active=()=>admin.verified&&Date.now()-admin.since<55*60*1000;
  let renders=0;
  new Script(controller);
  new Function('document','window','BOLO_ADMIN','boloAdminActive','BOLO_ADMIN_GATE_PREFIX',
    'TINDAK_LANJUT_URL','URL','render','loading',controller)(
      document,window,admin,active,'__BOLO_INPEK_ADMIN_GATE__',
      'https://script.google.com/macros/s/AKfysafeexample12345678901234567890123456789/exec',
      URL,()=>{renders++;},false
    );
  return {elements,document,window,admin,active,renders:()=>renders};
}
function grantEvent(s,overrides={}){
  return {isTrusted:true,origin:'https://n-abc-script.googleusercontent.com',
    source:{postMessage(message,origin){s.lastMessage={message,origin};}},
    data:{type:'BOLO_INPEK_ADMIN_VERIFIED',nonce:s.admin.nonce,
      peran:'ADMIN',nama:'Admin INPEK',email:'admin@bps.go.id'},...overrides};
}

test('dashboard starts with exactly one admin entrance and private action group',()=>{
  assert.match(page,/id="adminEnter"/);
  assert.match(page,/id="adminTools" hidden/);
  assert.match(page,/#adminTools\[hidden\],#adminEnter\[hidden\]\{display:none!important\}/);
  assert.match(page,/if\(!boloAdminActive\(\)\) return '';/);
  assert.match(page,/if\(!boloAdminActive\(\)\)\{document\.getElementById\('adminEnter'\)\.click\(\);return;\}/);
});
test('frontend accepts only trusted origin, correct nonce and ADMIN role',()=>{
  const s=sandbox();
  s.elements.adminEnter.click();
  assert.match(s.elements.tlFrame.src,/survei=__BOLO_INPEK_ADMIN_GATE__/);
  const forged=grantEvent(s,{isTrusted:false});
  s.window.listeners.message(forged);
  assert.equal(s.admin.verified,false,'Synthetic browser event rejected');
  s.window.listeners.message(grantEvent(s,{origin:'https://attacker.example'}));
  assert.equal(s.admin.verified,false,'Incorrect origin rejected');
  s.window.listeners.message(grantEvent(s,{data:{...grantEvent(s).data,nonce:'0'.repeat(32)}}));
  assert.equal(s.admin.verified,false,'Wrong nonce rejected');
  s.window.listeners.message(grantEvent(s,{data:{...grantEvent(s).data,peran:'OPERATOR'}}));
  assert.equal(s.admin.verified,false,'Operator role rejected');
  const firstSrc=s.elements.tlFrame.src;
  s.window.listeners.message(grantEvent(s));
  assert.equal(s.admin.verified,true);
  assert.equal(s.elements.adminEnter.hidden,true);
  assert.equal(s.elements.adminTools.hidden,false);
  assert.equal(s.elements.tlPopup.open,false);
  assert.equal(s.elements.tlFrame.src,firstSrc,'Login iframe retained with server-side session');
  s.elements.adminTlMenu.click();
  assert.equal(s.elements.tlPopup.open,true);
  s.window.listeners.message(grantEvent(s,{
    data:{...grantEvent(s).data,type:'BOLO_INPEK_PETUGAS_PENDING',jumlah:3,id_kosong:2}
  }));
  assert.equal(s.elements.adminStaffPending.textContent,'3');
  assert.equal(s.elements.adminStaffPending.hidden,false);
  s.elements.adminStaffMenu.click();
  assert.equal(s.lastMessage.message.type,'BOLO_INPEK_ADMIN_SHOW_PETUGAS');
  assert.equal(s.lastMessage.message.nonce,s.admin.nonce);
  assert.equal(s.lastMessage.origin,'https://n-abc-script.googleusercontent.com');
  assert.equal(s.elements.tlFrame.src,firstSrc,'Tindak Lanjut reuses authenticated iframe');
  s.elements.adminExit.click();
  assert.equal(s.admin.verified,false);
  assert.equal(s.elements.adminTools.hidden,true);
  assert.equal(s.elements.tlFrame.src,'about:blank');
  assert.equal(s.elements.adminStaffPending.hidden,true);
});
test('cancelled Admin login ignores delayed iframe success callback',()=>{
  const s=sandbox();
  s.elements.adminEnter.click();
  const callback=grantEvent(s);
  s.elements.tlPopup.close();
  assert.equal(s.admin.nonce,'');
  s.window.listeners.message(callback);
  assert.equal(s.admin.verified,false);
  assert.equal(s.elements.adminTools.hidden,true);
});
test('Tindak Lanjut requires explicit selection of survey in shared admin session',()=>{
  assert.match(tl,/if\(BOLO_ADMIN_GATE_NONCE\)option\(\$\('survey'\),'','— Pilih Survei dan Periode —'\)/);
  assert.match(tl,/\$\('noteMenu'\)\.disabled=!s/);
  assert.match(tl,/\$\('remindMenu'\)\.disabled=!s/);
});

test('Apps Script verifies ADMIN role through apiLogin and exposes no token to parent',()=>{
  assert.match(tl,/const x = await rpc\('apiLogin', \$\('email'\)\.value\)/);
  assert.match(tl,/BOLO_ADMIN_GATE_NONCE && x\?\.operator\?\.peran!=='ADMIN'/);
  assert.match(tl,/notifyDashboardAdmin\('BOLO_INPEK_ADMIN_VERIFIED'/);
  assert.match(tl,/BOLO_INPEK_ADMIN_LOGOUT/);
  assert.match(tl,/ancestor\.postMessage\(message,BOLO_ADMIN_PARENT\)/);
  assert.match(tl,/Pilih Survei dan Periode/);
  assert.match(tl,/id="openCompletedTL"/);
  assert.match(tl,/id="backToTL"/);
  assert.doesNotMatch(tl,/postMessage\([^;\n]*token\b/);
  const js=tl.split('<script>')[1].split('</script>')[0];
  new Script(js);
});
