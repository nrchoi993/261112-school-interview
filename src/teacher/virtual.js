/* 교사: 가상 학생으로 학생 화면 체험하기 */
import { $ } from '../lib/dom.js';
import { AUTH, applyLogin, doSave, flushLogs, stuApi, SYNC } from '../student/auth.js';
import { teacherApi } from './auth.js';
import { switchTab } from '../ui/tabs.js';
import { LIVE } from '../live/state.js';
import { liveStop } from '../live/flow.js';

export const VIRTUAL_KEY='hsVirtualToken';     // 같은 탭에서 새로고침해도 가상 학생 화면을 유지해요

function startVirtual(r){
  AUTH.virtual=true;
  applyLogin(r, false, { virtual:true });
  try{ sessionStorage.setItem(VIRTUAL_KEY, AUTH.student.token); }catch(e){}
  document.body.classList.add('as-virtual'); document.body.classList.remove('teacher-view');
  $('#virtualBar').hidden=false; $('#vName').textContent=r.state.name;
  switchTab('chat');
}
export async function enterVirtual(id){
  const btn=$('#vGo'); btn.disabled=true;
  try{
    const r=await teacherApi('as-student',{id});
    if(!r.ok){ $('#dashDetail').innerHTML=`<div class="warn" style="margin:14px 0 0">${r.error.message}</div>`; return; }
    startVirtual(r);
  }finally{ btn.disabled=false; }
}
export async function restoreVirtual(){
  let t=''; try{ t=sessionStorage.getItem(VIRTUAL_KEY)||''; }catch(e){}
  if(!t) return false;
  AUTH.student={ token:t };
  const r=await stuApi('me');
  if(!r.ok){ AUTH.student=null; try{ sessionStorage.removeItem(VIRTUAL_KEY); }catch(e){} return false; }
  startVirtual({ ...r, token:t });
  return true;
}
/* 교사 대시보드로 돌아가기: 남은 기록을 보내고 화면을 새로 열어요(교사 로그인은 유지) */
export async function exitVirtual(){
  if(LIVE.state!=='idle'&&LIVE.state!=='done') liveStop(true);
  await flushLogs(); if(SYNC.dirty) await doSave();
  try{ sessionStorage.removeItem(VIRTUAL_KEY); }catch(e){}
  location.href=location.pathname;
}
export function initVirtual(){
  $('#vGo').onclick=()=>{ const id=$('#vSel').value; if(id) enterVirtual(id); };
  $('#vExit').onclick=exitVirtual;
}
