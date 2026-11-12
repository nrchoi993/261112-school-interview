/* 학생 입실 확인(로그인), 기록 서버 저장, 비밀번호 바꾸기 */
import { API } from '../ai/api.js';
import { bot, resetChat, updateStats } from '../chat/chat.js';
import { $, esc } from '../lib/dom.js';
import { liveStop } from '../live/flow.js';
import { LIVE, renderLiveEnv } from '../live/state.js';
import { renderMyRecords } from '../records/records.js';
import { DEFAULT_PROFILE, S, schoolName } from '../state.js';
import { ADMIN, postJSON } from '../teacher/auth.js';
import { renderBank, renderGuide, renderSchoolTab } from '../ui/tabs.js';
import { setTicketOpen, syncTicketUI } from '../ui/ticket.js';

/* =========================================================
   7. 학생 로그인(입실 확인)·기록 저장
   - 학번+이름+비밀번호로 들어와요. 처음이면 그 비밀번호로 새 기록이 만들어져요.
   - 기록은 서버(Upstash Redis)에 저장돼서 다른 브라우저·기기에서도 같은 비밀번호로 불러와요.
   - 같은 브라우저에서는 30일 동안 자동으로 다시 들어와요(로그아웃하면 지워져요).
   ========================================================= */
export const STU_KEY='hsStuToken';
export const AUTH={ student:null, guest:false, gateMode:'login' };   // student: {token, sid, name, temp}
export const SYNC={ queue:[], timer:null, saveTimer:null, dirty:false };
export const LOGS=[];                                                  // 내 기록(서버에서 받은 것 + 이번에 추가한 것)

export const stuApi=(action, extra)=>postJSON('/api/student',{action, token:AUTH.student&&AUTH.student.token, ...(extra||{})});

export function setSync(s, msg){
  const el=$('#syncDot'); if(!el) return;
  el.dataset.s=s;
  el.textContent = s==='ok' ? '기록 저장됨' : s==='saving' ? '저장 중…' : (msg||'저장 실패 · 다시 시도할게요');
}
export function logEntry(e){
  e.at=e.at||new Date().toISOString();
  LOGS.push(e);
  if($('#tab-records').classList.contains('on')) renderMyRecords();
  if(!AUTH.student) return;
  SYNC.queue.push(e);
  clearTimeout(SYNC.timer); SYNC.timer=setTimeout(flushLogs,500);
}
export async function flushLogs(){
  if(!AUTH.student||!SYNC.queue.length) return;
  const batch=SYNC.queue.splice(0,30);
  setSync('saving');
  const r=await stuApi('log',{entries:batch});
  if(!r.ok){
    SYNC.queue.unshift(...batch);
    if(r.error.code==='session') return onSessionLost();
    setSync('err'); clearTimeout(SYNC.timer); SYNC.timer=setTimeout(flushLogs,6000); return;
  }
  if(SYNC.queue.length) return flushLogs();
  if(!SYNC.dirty) setSync('ok');
}
export function saveRemote(){
  if(!AUTH.student) return;
  SYNC.dirty=true; clearTimeout(SYNC.saveTimer); SYNC.saveTimer=setTimeout(doSave,800);
}
export function savePayload(){ return {profile:{...S.profile, schoolName:schoolName()}, answered:[...S.answered], convo:S.convo.slice(-30)}; }
export async function doSave(){
  if(!AUTH.student) return;
  setSync('saving');
  const r=await stuApi('save',savePayload());
  if(!r.ok){
    if(r.error.code==='session') return onSessionLost();
    setSync('err'); clearTimeout(SYNC.saveTimer); SYNC.saveTimer=setTimeout(doSave,6000); return;
  }
  SYNC.dirty=false; if(!SYNC.queue.length) setSync('ok');
}
/* 탭을 닫을 때 아직 못 보낸 기록이 있으면 sendBeacon으로 보내요 */
export function initSyncBeacon(){
addEventListener('pagehide',()=>{
  if(!AUTH.student||!navigator.sendBeacon) return;
  const token=AUTH.student.token;
  if(SYNC.queue.length) navigator.sendBeacon('/api/student', new Blob([JSON.stringify({action:'log', token, entries:SYNC.queue.splice(0,30)})],{type:'application/json'}));
  if(SYNC.dirty) navigator.sendBeacon('/api/student', new Blob([JSON.stringify({action:'save', token, ...savePayload()})],{type:'application/json'}));
});
}

/* ---------- 입실 확인 화면 ---------- */
export function showGate(msg){
  $('#gate').hidden=false; document.body.style.overflow='hidden';
  gateMode('login');
  if(msg){ $('#gateMsg').textContent=msg; $('#gateMsg').dataset.ok=''; }
  const noStore = API.srv && API.srv.storage==='none';
  $('#gateGuest').hidden = !noStore;
  if(noStore){ $('#gateMsg').textContent='지금은 서버 저장소가 연결되지 않아 로그인할 수 없어요. ‘저장 없이 둘러보기’로 연습할 수 있어요(기록은 저장되지 않아요).'; }
  setTimeout(()=>($('#gSid').value?$('#gPw'):$('#gSid')).focus(),30);
}
export function hideGate(){ $('#gate').hidden=true; document.body.style.overflow=''; }
export function gateMode(m){
  AUTH.gateMode=m;
  $('#gPw2Wrap').hidden = m!=='new';
  $('#gateBack').hidden = m!=='new';
  $('#gSid').readOnly = $('#gName').readOnly = m==='new';
  $('#gateGo').textContent = m==='new' ? '새로 시작하기' : '들어가기';
  $('#gateLead').innerHTML = m==='new'
    ? `<b>${esc($('#gSid').value.trim())} ${esc($('#gName').value.trim())}</b> 학생은 처음이에요. 학번과 이름이 맞는지 확인하고, 방금 정한 비밀번호를 한 번 더 입력하세요. <b>이 비밀번호를 꼭 기억하세요.</b>`
    : '학번, 이름, 비밀번호를 입력하세요. 처음이면 지금 정한 비밀번호로 내 기록이 만들어지고, 다른 기기에서도 같은 비밀번호로 이어서 할 수 있어요.';
  $('#gateMsg').textContent='';
  if(m==='new'){ $('#gPw2').value=''; setTimeout(()=>$('#gPw2').focus(),30); }
}
export async function submitGate(ev){
  ev.preventDefault();
  const sid=$('#gSid').value.replace(/\s/g,''), name=$('#gName').value.replace(/\s/g,''), pw=$('#gPw').value, msg=$('#gateMsg');
  const say=(t,ok)=>{ msg.textContent=t; msg.dataset.ok=ok?'1':''; };
  if(!sid) return say('학번을 입력하세요.'), $('#gSid').focus();
  if(!name) return say('이름을 입력하세요.'), $('#gName').focus();
  if(pw.length<4||pw.length>32||/\s/.test(pw)) return say('비밀번호는 공백 없이 4~32자로 정해 주세요.'), $('#gPw').focus();
  const btn=$('#gateGo'); btn.disabled=true;
  try{
    if(AUTH.gateMode==='new'){
      if($('#gPw2').value!==pw) return say('두 비밀번호가 서로 달라요. 다시 입력하세요.');
      say('내 기록을 만들고 있어요…',true);
      const r=await stuApi('register',{sid,name,pw,profile:{...DEFAULT_PROFILE}});
      if(!r.ok) return say(r.error.message);
      return applyLogin(r,true);
    }
    say('확인하고 있어요…',true);
    const r=await stuApi('login',{sid,name,pw});
    if(r.code==='new') return gateMode('new');
    if(!r.ok){ $('#gPw').value=''; $('#gPw').focus(); return say(r.error.message); }
    applyLogin(r,false);
  }finally{ btn.disabled=false; }
}
export function applyLogin(r, created, opts){
  const st=r.state;
  AUTH.student={ token:r.token||AUTH.student&&AUTH.student.token, sid:st.sid, name:st.name, temp:st.temp };
  AUTH.guest=false;
  if(!(opts&&opts.virtual)) try{ localStorage.setItem(STU_KEY, AUTH.student.token); }catch(e){}   // 가상 학생은 이 기기 자동 로그인에 남기지 않아요
  // 저장된 정보 불러오기
  const p=st.profile||{}; delete p.schoolName;
  S.profile={...DEFAULT_PROFILE, ...(created?{}:p)};
  try{ localStorage.setItem('hsInterviewProfile3',JSON.stringify(S.profile)); }catch(e){}
  S.answered=new Set(st.answered||[]);
  S.convo=st.convo||[];
  LOGS.splice(0,LOGS.length,...(r.logs||[]));
  S.history=LOGS.filter(e=>e.type==='answer').map(e=>({id:e.qid,q:e.q,total:e.total,crit:e.crit.map(c=>({name:c.name,score:c.score}))}));
  syncTicketUI(); setTicketOpen(!S.profile.dept); updateStats(); renderBank(); renderSchoolTab(); renderGuide();
  $('#whoBar').hidden=false; $('#whoName').textContent=`${st.sid} ${st.name}`;
  $('#ticketNo').textContent=st.sid;
  setSync('ok');
  hideGate(); ['#gPw','#gPw2'].forEach(s=>$(s).value='');
  resetChat(created?'new':'back');
  renderLiveEnv();
  if(st.temp) openStuPw(true);
}
export function onSessionLost(){
  if(AUTH.virtual){ try{ sessionStorage.removeItem('hsVirtualToken'); }catch(e){} location.href=location.pathname; return; }
  AUTH.student=null; try{ localStorage.removeItem(STU_KEY); }catch(e){}
  $('#whoBar').hidden=true;
  if(!ADMIN.on) showGate('로그인이 끝났어요(비밀번호가 초기화되었을 수 있어요). 다시 로그인해 주세요.');
}
export async function logout(){
  if(LIVE.state!=='idle'&&LIVE.state!=='done') liveStop(true);
  await flushLogs(); if(SYNC.dirty) await doSave();
  await stuApi('logout');
  try{ localStorage.removeItem(STU_KEY); localStorage.removeItem('hsInterviewProfile3'); }catch(e){}
  location.reload();                                   // 공용 컴퓨터에서 다음 학생에게 이전 기록이 남지 않게 새로 시작
}

/* ---------- 학생 비밀번호 바꾸기 ---------- */
export function openStuPw(forced){
  const dlg=$('#stuPwDlg');
  dlg.dataset.forced=forced?'1':'';
  $('#stuPwCur').hidden=!!forced; $('#stuPwCancel').hidden=!!forced;
  $('#stuPwLead').textContent = forced
    ? '선생님이 비밀번호를 초기화했어요. 임시 비밀번호 대신 쓸 새 비밀번호를 정하세요.'
    : '지금 비밀번호와 새 비밀번호를 입력하세요. 다음부터 새 비밀번호로 들어와요.';
  ['#stuPwCur','#stuPwNew','#stuPwNew2'].forEach(s=>$(s).value=''); $('#stuPwMsg').textContent='';
  if(typeof dlg.showModal==='function') dlg.showModal(); else dlg.setAttribute('open','');
  (forced?$('#stuPwNew'):$('#stuPwCur')).focus();
}
export function closeStuPw(){ const d=$('#stuPwDlg'); if(d.open){ if(d.close) d.close(); else d.removeAttribute('open'); } }
export async function submitStuPw(ev){
  ev.preventDefault();
  const forced=$('#stuPwDlg').dataset.forced==='1', msg=$('#stuPwMsg');
  const cur=$('#stuPwCur').value, a=$('#stuPwNew').value, b=$('#stuPwNew2').value;
  if(a.length<4||a.length>32||/\s/.test(a)) return msg.textContent='새 비밀번호는 공백 없이 4~32자로 정해 주세요.';
  if(a!==b) return msg.textContent='새 비밀번호와 확인 칸이 서로 달라요.';
  const r=await stuApi('changepw',{cur:forced?undefined:cur, pw:a});
  if(!r.ok) return msg.textContent=r.error.message;
  AUTH.student.temp=false; closeStuPw();
  bot('<p>비밀번호를 바꿨어요. 다음부터 새 비밀번호로 들어오세요.</p>');
}
export function initStuPwDialog(){ $('#stuPwDlg').addEventListener('cancel',e=>{ if($('#stuPwDlg').dataset.forced==='1') e.preventDefault(); }); }
