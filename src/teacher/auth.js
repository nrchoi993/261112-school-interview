/* 교사 로그인·교사 모드·교사 비밀번호 바꾸기 */
import { API } from '../ai/api.js';
import { bot } from '../chat/chat.js';
import { $ } from '../lib/dom.js';
import { AUTH, hideGate } from '../student/auth.js';
import { DASH, loadDash } from './dashboard.js';
import { switchTab } from '../ui/tabs.js';

/* =========================================================
   교사 모드: 학생 대시보드·API 상태는 교사에게만 보여요
   - 비밀번호 확인은 서버(/api/teacher)에서 해요. 바꾼 비밀번호는 서버 저장소에 해시로 저장돼 어느 기기에서나 같아요.
   - 처음 비밀번호: Vercel 환경 변수 TEACHER_PASSWORD, 없으면 00000000(들어오면 바로 새 비밀번호를 정해야 해요)
   - 로그인 정보는 sessionStorage에 두어 탭을 닫으면 풀리고, 같은 탭에서 새로고침하면 유지돼요.
   ========================================================= */
export const TEACHER_KEY = 'hsTeacherToken';
export const ADMIN = { on:false };
export const TEACHER = { token:'', mustChange:false, pendingCur:'' };

export async function postJSON(url, body){
  let r, j=null;
  try{ r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) }); }
  catch(e){ return { ok:false, status:0, error:{ code:'network', message:'서버에 연결하지 못했어요. 인터넷 연결을 확인하세요.' } }; }
  try{ j = await r.json(); }catch(e){}
  if(!j) j = { ok:false, error:{ code:'http', message:`서버 응답을 읽지 못했어요 (HTTP ${r.status}).` } };
  j.status = r.status;
  return j;
}
export const teacherApi = (action, extra) => postJSON('/api/teacher', { action, token:TEACHER.token, ...(extra||{}) });

export function setAdmin(on){
  ADMIN.on=on;
  document.body.classList.toggle('is-admin',on);
  document.body.classList.toggle('teacher-view', on && !AUTH.virtual);   // 교사 화면: 대시보드만 보여요
  document.querySelectorAll('.admin-only').forEach(el=>{ el.hidden=!on; });
  if(!on){
    if(TEACHER.token) teacherApi('logout');
    TEACHER.token=''; try{ sessionStorage.removeItem(TEACHER_KEY); sessionStorage.removeItem('hsVirtualToken'); }catch(e){}
    location.href=location.pathname;                                        // 처음 화면으로 깔끔하게 돌아가요
    return;
  }
  const btn=$('#adminBtn'); btn.textContent = on ? '교사 모드 종료' : '교사'; btn.setAttribute('aria-pressed',String(on));
  renderPwInfo();
}

export function adminStep(n){
  $('#adminStep1').hidden = n!==1; $('#adminStep2').hidden = n!==2;
  $('#adminDlgLead').textContent = n===1 ? '교사 비밀번호를 입력하세요.' : '기본 비밀번호로 들어왔어요. 학생 기록을 지키려면 새 비밀번호(6~40자)를 정해 주세요.';
  $('#adminSubmit').textContent = n===1 ? '들어가기' : '새 비밀번호 저장';
  $('#adminMsg').textContent='';
  (n===1?$('#adminPw'):$('#adminNew')).focus();
}
export function openAdminDialog(){
  if(ADMIN.on){ setAdmin(false); bot('<p>교사 모드를 종료했어요.</p>'); return; }
  const dlg=$('#adminDlg'); ['#adminPw','#adminNew','#adminNew2'].forEach(s=>$(s).value='');
  if(typeof dlg.showModal==='function') dlg.showModal(); else dlg.setAttribute('open','');
  adminStep(1);
}
export function closeAdminDialog(){ const dlg=$('#adminDlg'); if(dlg.open){ if(dlg.close) dlg.close(); else dlg.removeAttribute('open'); } }

export async function enterTeacher(){
  closeAdminDialog(); hideGate();
  if(AUTH.student && !AUTH.virtual){ AUTH.student=null; $('#whoBar').hidden=true; }   // 이 기기의 학생 화면은 잠시 닫아요(교사 모드를 끝내면 다시 열려요)
  setAdmin(true); switchTab('dash');
  try{ sessionStorage.setItem(TEACHER_KEY, TEACHER.token); }catch(e){}
  loadDash();
}
export async function submitAdminLogin(ev){
  ev.preventDefault();
  const msg=$('#adminMsg');
  if(!$('#adminStep2').hidden){
    const a=$('#adminNew').value, b=$('#adminNew2').value;
    if(a.length<6||a.length>40||/\s/.test(a)) return msg.textContent='새 비밀번호는 공백 없이 6~40자로 정해 주세요.';
    if(a!==b) return msg.textContent='새 비밀번호와 확인 칸이 서로 달라요.';
    const r=await teacherApi('changepw',{cur:TEACHER.pendingCur, pw:a});
    if(!r.ok) return msg.textContent=r.error.message;
    TEACHER.pendingCur=''; TEACHER.mustChange=false;
    bot('<p>교사 비밀번호를 새로 정했어요. 다음부터 어느 기기에서나 새 비밀번호로 들어오세요.</p>');
    return enterTeacher();
  }
  const pw=$('#adminPw').value;
  if(!pw) return msg.textContent='비밀번호를 입력하세요.';
  if(API.srv && API.srv.storage==='none') return msg.textContent='서버 저장소(Upstash Redis)가 연결되지 않아 교사 모드를 쓸 수 없어요. Vercel → Storage에서 연결하세요.';
  msg.textContent='확인하고 있어요…';
  const r=await postJSON('/api/teacher',{action:'login', pw});
  if(!r.ok){ $('#adminPw').value=''; $('#adminPw').focus(); return msg.textContent=r.error.message; }
  TEACHER.token=r.token; TEACHER.mustChange=!!r.mustChange;
  if(r.mustChange){ TEACHER.pendingCur=pw; return adminStep(2); }
  enterTeacher();
}

export function renderPwInfo(){
  const el=$('#pwInfo'); if(!el) return;
  el.textContent = DASH.pwChangedAt
    ? `서버에 저장된 비밀번호를 쓰고 있어요. (마지막 변경: ${new Date(DASH.pwChangedAt).toLocaleString('ko-KR')})`
    : (API.srv&&API.srv.teacherPwFromEnv ? 'Vercel 환경 변수 TEACHER_PASSWORD의 비밀번호를 쓰고 있어요.' : '');
}

export async function submitPwChange(ev){
  ev.preventDefault();
  const cur=$('#pwCur').value, nw=$('#pwNew').value, nw2=$('#pwNew2').value, msg=$('#pwMsg');
  const say=(t,ok)=>{ msg.textContent=t; msg.dataset.ok=ok?'1':''; };
  if(nw.length<6||nw.length>40) return say('새 비밀번호는 6~40자로 정해 주세요.');
  if(/\s/.test(nw)) return say('새 비밀번호에는 공백을 넣을 수 없어요.');
  if(nw!==nw2) return say('새 비밀번호와 확인 칸이 서로 달라요.');
  const r=await teacherApi('changepw',{cur, pw:nw});
  if(!r.ok) return say(r.error.message);
  ['#pwCur','#pwNew','#pwNew2'].forEach(s=>{ $(s).value=''; });
  DASH.pwChangedAt=new Date().toISOString();
  say('비밀번호를 바꿨어요. 다음부터 어느 기기에서나 새 비밀번호로 들어오세요.', true);
  renderPwInfo();
}
