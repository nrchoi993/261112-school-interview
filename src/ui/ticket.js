/* 수험표: 지원 학교·학과·계열 선택 */
import { bot, idleChips } from '../chat/chat.js';
import { deptTrack, ivPoints, SCHOOLS } from '../data/schools.js';
import { TRACKS } from '../data/tracks.js';
import { $, esc } from '../lib/dom.js';
import { curSchool, S, saveProfile } from '../state.js';
import { renderBank, renderSchoolTab, switchTab } from './tabs.js';

/* =========================================================
   5. 수험표·탭·부가 화면
   ========================================================= */
export const ALL_DEPTS=[...new Set(SCHOOLS.flatMap(s=>s.d.map(([d])=>d)).filter(d=>!/공통/.test(d)))].sort((a,b)=>a.localeCompare(b,'ko'));
export function schoolsWithDept(d){return SCHOOLS.filter(s=>s.d.some(([x])=>x===d));}

export function initTicket(){
  const ss=$('#schoolSel');
  ss.innerHTML='<option value="">선택 안 함</option>'+SCHOOLS.map((s,i)=>`<option value="${i}">${esc(s.n)}</option>`).join('')+'<option value="custom">목록에 없음 · 직접 입력</option>';
  const ts=$('#trackSel');
  ts.innerHTML=Object.entries(TRACKS).map(([k,t])=>`<option value="${k}">${esc(t.name)}</option>`).join('');
  syncTicketUI();
  $('#ticketNo').textContent=String(Math.floor(Math.random()*9000)+1000);

  ss.onchange=()=>setSchool(ss.value,true);
  $('#deptSel').onchange=e=>setDept(e.target.value,true);
  $('#deptIn').onchange=e=>setDept(e.target.value.trim(),true);
  $('#schoolCustom').oninput=e=>{S.profile.custom=e.target.value; saveProfile();};
  ts.onchange=()=>{S.profile.track=ts.value; S.profile.trackManual=true; saveProfile(); renderTrackBadge(); renderSchoolTab(); renderBank();};
  document.querySelectorAll('.seg button').forEach(b=>b.onclick=()=>{
    S.profile.type=b.dataset.type; saveProfile();
    document.querySelectorAll('.seg button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
    if(b.dataset.type==='일반') bot('<p>2027학년도 서울 특성화고 일반전형은 면접 없이 중학교 고입전형 총점(내신) 순으로 선발해요. 면접은 특별전형에서만 봐요. 특별전형에 떨어져도 일반전형에 다시 지원할 수 있으니 면접 연습은 해 두면 좋아요.</p>');
  });
}

/* 수험표 입력칸을 S.profile 값에 맞추기 (처음 열 때, 로그인해서 저장된 정보를 불러올 때) */
export function syncTicketUI(){
  if(S.profile.schoolIdx!=='' && S.profile.schoolIdx!=='custom' && !SCHOOLS[+S.profile.schoolIdx]) S.profile.schoolIdx='';
  if(!TRACKS[S.profile.track]) S.profile.track='it';
  $('#schoolSel').value=S.profile.schoolIdx; $('#schoolCustom').value=S.profile.custom||'';
  $('#customWrap').hidden=S.profile.schoolIdx!=='custom';
  document.querySelectorAll('.seg button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.type===S.profile.type)));
  refreshDeptList(); renderTrackBadge();
}

/* 학과 목록: 학교를 고르면 그 학교 학과, 고르지 않으면 67개교 전체 학과 */
export function refreshDeptList(){
  const s=curSchool(), sel=$('#deptSel'), inp=$('#deptIn');
  if(S.profile.schoolIdx==='custom'){
    sel.hidden=true; inp.hidden=false; inp.value=S.profile.dept; return;
  }
  sel.hidden=false;
  sel.innerHTML = s
    ? `<option value="">학과를 고르세요 (${s.d.length}개 학과)</option>`+s.d.map(([d,c])=>`<option value="${esc(d)}">${esc(d)} (${c}명)</option>`).join('')
    : `<option value="">학과를 고르세요 (전체 ${ALL_DEPTS.length}개)</option>`+ALL_DEPTS.map(d=>`<option value="${esc(d)}">${esc(d)}</option>`).join('')+'<option value="__custom">목록에 없음 · 직접 입력</option>';
  const has=[...sel.options].some(o=>o.value===S.profile.dept);
  sel.value = has ? S.profile.dept : (!s && S.profile.dept ? '__custom' : '');
  inp.hidden = sel.value!=='__custom';
  if(!inp.hidden) inp.value=S.profile.dept;
}

export function renderTrackBadge(){
  const b=$('#trackBadge'), t=TRACKS[S.profile.track];
  $('#trackSel').value=S.profile.track;
  if(!S.profile.dept){ b.className='track-badge empty'; b.innerHTML='<span>학과를 고르면 계열이 자동으로 정해져요</span>'; return; }
  b.className='track-badge';
  b.innerHTML=`<b>${esc(t.name)}</b><span>${S.profile.trackManual?'직접 고른 계열':`‘${esc(S.profile.dept)}’ 기준 자동 분류`}</span>`;
}

export function setDept(d, announce){
  if(d==='__custom'){ $('#deptIn').hidden=false; $('#deptIn').value=''; $('#deptIn').focus(); return; }
  if(d && $('#deptSel').value!=='__custom') $('#deptIn').hidden=true;
  const s=curSchool();
  S.profile.dept=d; S.profile.trackManual=false;
  const tk=d?deptTrack(d, s&&s.n):null;
  if(tk) S.profile.track=tk;
  saveProfile(); renderTrackBadge(); renderSchoolTab(); renderBank();
  if(!announce||!d) return;
  const t=TRACKS[S.profile.track];
  let extra='';
  if(s){
    const tip=s.tips.find(x=>/2학년/.test(x));
    if(/공통|계열|과정/.test(d) && tip) extra=`<p class="time-note">${esc(tip)}</p>`;
  }else if(S.profile.schoolIdx!=='custom'){
    const list=schoolsWithDept(d);
    if(list.length) extra=`<p>이 학과가 있는 학교: ${list.map(x=>`<b>${esc(x.n)}</b>`).join(', ')}</p><p class="time-note">수험표에서 학교를 고르면 그 학교의 면접 배점과 준비 포인트도 알려 드려요.</p>`;
  }
  bot(`<p>${s?esc(s.n)+' ':''}<b>${esc(d)}</b> 지원으로 정했어요. ${tk?`이 학과는 <b>${esc(t.name)}</b> 계열로 분류했어요. 질문과 피드백을 이 계열에 맞춰 드릴게요.`:'학과 이름만으로 계열을 정하지 못했어요. 수험표의 ‘계열 직접 바꾸기’에서 골라 주세요.'}</p>${extra}`);
  if(!S.awaiting) idleChips();
}

export function ro(w){
  const h=(w.match(/[가-힣]/g)||[]).pop(); if(!h) return '로';
  const jong=(h.charCodeAt(0)-0xAC00)%28; return (jong===0||jong===8)?'로':'으로';
}
export function setSchool(val, announce, dept){
  S.profile.schoolIdx=String(val); $('#schoolSel').value=S.profile.schoolIdx; $('#customWrap').hidden=S.profile.schoolIdx!=='custom';
  const s=curSchool();
  if(dept!==undefined) S.profile.dept=dept;
  else if(s && !s.d.some(([d])=>d===S.profile.dept)) S.profile.dept = s.d.length===1 ? s.d[0][0] : '';
  S.profile.trackManual=false;
  if(S.profile.dept){ const tk=deptTrack(S.profile.dept, s&&s.n); if(tk) S.profile.track=tk; }
  refreshDeptList(); renderTrackBadge(); saveProfile(); renderSchoolTab(); renderBank();
  if(announce && s){
    switchTab('chat');
    const pts=ivPoints(s.ev);
    bot(`<p><b>${esc(s.n)}</b>를 지원 학교로 정했어요. ${S.profile.dept
        ? `지원 학과는 <b>${esc(S.profile.dept)}</b>, 계열은 <b>${esc(TRACKS[S.profile.track].name)}</b>${ro(TRACKS[S.profile.track].name)} 분류했어요.`
        : `이 학교에는 ${s.d.map(([d])=>esc(d)).join(', ')} 등 ${s.d.length}개 학과가 있어요. 수험표에서 <b>지원 학과</b>를 골라 주세요.`}</p>
      <p>미래인재 특별전형 배점은 <b>${esc(s.ev)}</b>이에요. ${pts>=50?`100점 중 면접(실기 포함)이 ${pts}점으로 가장 큰 비중이니 연습할수록 유리해요.`:'면접과 함께 다른 평가 요소도 챙기세요.'}</p>
      ${s.tips.length?`<ul>${s.tips.slice(0,3).map(t=>`<li>${esc(t)}</li>`).join('')}</ul>`:''}`);
    if(!S.awaiting) idleChips();
  }
}
