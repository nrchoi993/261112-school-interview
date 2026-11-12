/* 시작점: 스타일 불러오기, 버튼 연결, 자동 로그인(boot) */
import './styles/base.css';
import './styles/chat.css';
import './styles/tabs.css';
import './styles/admin.css';
import './styles/login.css';
import './styles/live.css';
import './styles/records.css';
import './styles/dashboard.css';
import './styles/mobile.css';
import { API, loadHealth, renderApiPanel, renderApiPill } from './ai/api.js';
import { groundImproved } from './ai/grounding.js';
import { testConnection } from './ai/scoring.js';
import { bot, greet, initChat, resetChat } from './chat/chat.js';
import { SCHOOLS } from './data/schools.js';
import { TRACKS } from './data/tracks.js';
import { $ } from './lib/dom.js';
import { initLive } from './live/flow.js';
import { mountInterviewers } from './live/interviewers.js';
import { LIVE, renderLiveEnv } from './live/state.js';
import { S } from './state.js';
import { applyLogin, AUTH, closeStuPw, gateMode, hideGate, initStuPwDialog, initSyncBeacon, logout, LOGS, openStuPw, showGate, STU_KEY, stuApi, submitGate, submitStuPw } from './student/auth.js';
import { ADMIN, closeAdminDialog, openAdminDialog, setAdmin, submitAdminLogin, submitPwChange, TEACHER, TEACHER_KEY, teacherApi } from './teacher/auth.js';
import { initDashboard, loadDash } from './teacher/dashboard.js';
import { initBank, initSchoolFilters, initTabs, renderBank, renderGuide, renderSchoolTab, switchTab } from './ui/tabs.js';
import { initTicket, initTicketToggle, setDept, setSchool, updateTicketSum } from './ui/ticket.js';
import { initVirtual, restoreVirtual } from './teacher/virtual.js';

/* =========================================================
   6. 시작
   ========================================================= */
mountInterviewers(); initChat(); initTabs(); initSyncBeacon(); initStuPwDialog(); initDashboard(); initLive(); initVirtual();
initTicket(); initTicketToggle(); initBank(); initSchoolFilters(); renderBank(); renderSchoolTab(); renderGuide();
document.querySelectorAll('.seg button').forEach(b=>b.addEventListener('click',()=>{ renderGuide(); updateTicketSum(); }));

$('#resetBtn').onclick=()=>resetChat();
$('#apiTestBtn').onclick=testConnection;
$('#apiPill').onclick=()=>switchTab('api');
$('#adminBtn').onclick=openAdminDialog;
$('#adminForm').onsubmit=submitAdminLogin;
$('#adminCancel').onclick=closeAdminDialog;
$('#adminExitBtn').onclick=()=>{ setAdmin(false); bot('<p>교사 모드를 종료했어요.</p>'); };
$('#pwForm').onsubmit=submitPwChange;
$('#gateForm').onsubmit=submitGate;
$('#gateBack').onclick=()=>{ gateMode('login'); $('#gPw').value=''; $('#gPw').focus(); };
$('#gateTeacher').onclick=openAdminDialog;
$('#gateGuest').onclick=()=>{ AUTH.guest=true; hideGate(); resetChat(''); };
$('#logoutBtn').onclick=logout;
$('#myPwBtn').onclick=()=>openStuPw(false);
$('#stuPwForm').onsubmit=submitStuPw;
$('#stuPwCancel').onclick=closeStuPw;
/* 왼쪽 위 ‘면접 대기실’을 누르면 사이트를 새로고침해요(로그인은 유지돼요) */
$('#homeLink').onclick=e=>{ e.preventDefault(); location.href=location.pathname; };

(async function boot(){
  await loadHealth();
  renderApiPill(); renderApiPanel(); renderLiveEnv();
  let tt=''; try{ tt=sessionStorage.getItem(TEACHER_KEY)||''; }catch(e){}
  if(tt && API.srv.storage!=='none'){                 // 같은 탭에서 새로고침하면 교사 모드 유지
    TEACHER.token=tt;
    const r=await teacherApi('check');
    if(r.ok && !r.mustChange){
      hideGate();
      if(await restoreVirtual()) setAdmin(true);          // 가상 학생 화면을 보던 중이면 그대로
      else{ setAdmin(true); switchTab('dash'); }
      loadDash();
    } else { TEACHER.token=''; try{ sessionStorage.removeItem(TEACHER_KEY); }catch(e){} }
  }
  let st=''; try{ st=localStorage.getItem(STU_KEY)||''; }catch(e){}
  if(st && API.srv.storage!=='none' && !ADMIN.on){    // 같은 브라우저면 자동으로 다시 들어와요
    AUTH.student={token:st};
    const r=await stuApi('me');
    if(r.ok){ applyLogin({...r, token:st}, false); }
    else{ AUTH.student=null; try{ localStorage.removeItem(STU_KEY); }catch(e){} }
  }
  if(!AUTH.student){
    greet('');
    if(ADMIN.on) hideGate(); else showGate();
  }
  renderLiveEnv();
})();
window.__app={S,API,ADMIN,AUTH,LIVE,LOGS:()=>LOGS,groundImproved,SCHOOLS,setSchool,setDept,setAdmin,TRACKS};   // 테스트·디버깅용
