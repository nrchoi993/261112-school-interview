/* 교사 학생 대시보드: 목록·상세·비밀번호 초기화·삭제·CSV */
import { API, renderApiPanel } from '../ai/api.js';
import { bot } from '../chat/chat.js';
import { $, esc } from '../lib/dom.js';
import { fmtDate, mountRecords } from '../records/records.js';
import { renderPwInfo, setAdmin, teacherApi } from './auth.js';
import { enterVirtual } from './virtual.js';

/* =========================================================
   9. 교사: 학생 대시보드
   ========================================================= */
export const DASH={ list:[], sort:{k:'lastAt',dir:-1}, sel:null, temp:null, armed:{}, pwChangedAt:null };
export async function loadDash(){
  $('#dashKpis').innerHTML='<div class="kpi"><b>…</b><span>불러오는 중</span></div>';
  const r=await teacherApi('list');
  if(!r.ok){
    if(r.error.code==='session'){ setAdmin(false); bot('<p>교사 로그인이 끝났어요. 다시 로그인해 주세요.</p>'); return; }
    $('#dashKpis').innerHTML=`<div class="warn" style="margin:0">${esc(r.error.message)}</div>`; return;
  }
  DASH.list=r.students||[]; DASH.pwChangedAt=r.pwChangedAt; API.keyHint=r.keyHint||'';
  renderPwInfo(); renderApiPanel(); renderDash();
  if(DASH.sel) openDetail(DASH.sel, true);
}
export const DASH_COLS=[['sid','학번'],['name','이름'],['school','지원 학교·학과'],['count','답변','num'],['avg','평균','num'],['best','최고','num'],['liveAnswers','실전 답변','num'],['chats','코치 질문','num'],['lastAt','최근 접속']];
export function dashRows(){
  const q=($('#dashQuery').value||'').trim();
  const rows=DASH.list.map(s=>({...s, avg:s.count?Math.round(s.sum/s.count):null, liveAnswers:s.liveAnswers||0}))
    .filter(s=>!q||[s.sid,s.name,s.school,s.dept].some(v=>String(v||'').includes(q)));
  const {k,dir}=DASH.sort;
  rows.sort((a,b)=>{ const x=a[k]??-1, y=b[k]??-1; return (typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y),'ko',{numeric:true}))*dir; });
  return rows;
}
export function renderDash(){
  const L=DASH.list.filter(s=>!s.virtual), today=new Date().toDateString();
  const vs=DASH.list.filter(s=>s.virtual).sort((a,b)=>String(a.sid).localeCompare(String(b.sid),'ko',{numeric:true}));
  const vSel=$('#vSel'), keep=vSel.value;
  vSel.innerHTML=vs.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}${s.count?` (답변 ${s.count})`:''}</option>`).join('');
  if(vs.some(s=>s.id===keep)) vSel.value=keep;
  const tot=L.reduce((t,s)=>t+s.count,0), sum=L.reduce((t,s)=>t+s.sum,0);
  $('#dashKpis').innerHTML=`
    <div class="kpi"><b>${L.length}</b><span>등록 학생</span></div>
    <div class="kpi"><b>${L.filter(s=>s.lastAt&&new Date(s.lastAt).toDateString()===today).length}</b><span>오늘 접속</span></div>
    <div class="kpi"><b>${tot}</b><span>전체 답변</span></div>
    <div class="kpi"><b>${tot?Math.round(sum/tot):'-'}</b><span>전체 평균 점수</span></div>
    <div class="kpi"><b>${L.reduce((t,s)=>t+(s.liveAnswers||0),0)}</b><span>실전 면접 답변</span></div>
    <div class="kpi"><b>${L.filter(s=>s.temp).length}</b><span>임시 비밀번호 상태</span></div>`;
  renderHelp(L);
  const rows=dashRows();
  $('#dashTable').innerHTML=`<thead><tr>${DASH_COLS.map(([k,l,c])=>`<th class="${c||''}"><button type="button" data-k="${k}" ${DASH.sort.k===k?`data-dir="${DASH.sort.dir>0?'▲':'▼'}"`:''}>${l}</button></th>`).join('')}<th>관리</th></tr></thead>
    <tbody>${rows.length?rows.map(s=>`<tr class="${DASH.sel===s.id?'sel':''}">
      <td>${esc(s.sid)}</td><td><b>${esc(s.name)}</b> ${s.virtual?'<span class="pill virtual">가상</span> ':''}${s.temp?'<span class="pill temp" title="임시 비밀번호로 아직 바꾸지 않음">임시</span>':''}</td>
      <td>${esc([s.school,s.dept].filter(Boolean).join(' · ')||'-')}</td>
      <td class="num">${s.count}</td><td class="num">${s.avg??'-'}</td><td class="num">${s.count?s.best:'-'}</td><td class="num">${s.liveAnswers}</td><td class="num">${s.chats||0}</td>
      <td>${s.lastAt?fmtDate(s.lastAt):'-'}</td>
      <td><span class="acts"><button class="btn sm" type="button" data-open="${esc(s.id)}">기록 보기</button>${s.virtual?`<button class="btn sm ghost" type="button" data-as="${esc(s.id)}">학생 화면으로</button>`:`<button class="btn sm ghost" type="button" data-reset="${esc(s.id)}">${DASH.armed['r'+s.id]?'한 번 더 누르면 초기화':'비밀번호 초기화'}</button>`}<button class="btn sm ghost" type="button" data-del="${esc(s.id)}">${DASH.armed['d'+s.id]?'한 번 더 누르면 삭제':'삭제'}</button></span></td></tr>`).join('')
      :`<tr><td colspan="10" style="text-align:center;color:var(--muted);padding:24px">${L.length?'검색 결과가 없어요.':'아직 등록한 학생이 없어요. 학생이 학번·이름·비밀번호로 처음 들어오면 여기에 나타나요.'}</td></tr>`}</tbody>`;
  $('#dashTable').querySelectorAll('th button').forEach(b=>b.onclick=()=>{ const k=b.dataset.k; DASH.sort = DASH.sort.k===k?{k,dir:-DASH.sort.dir}:{k,dir:['count','avg','best','liveAnswers','chats','lastAt'].includes(k)?-1:1}; renderDash(); });
  $('#dashTable').querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>openDetail(b.dataset.open));
  $('#dashTable').querySelectorAll('[data-as]').forEach(b=>b.onclick=()=>enterVirtual(b.dataset.as));
  $('#dashTable').querySelectorAll('[data-reset]').forEach(b=>b.onclick=()=>armThen('r'+b.dataset.reset,()=>resetStudentPw(b.dataset.reset)));
  $('#dashTable').querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>armThen('d'+b.dataset.del,()=>deleteStudent(b.dataset.del)));
}
/* 도움이 필요한 학생: 오래 안 들어왔거나, 아직 답하지 않았거나, 평균이 낮거나, 같은 항목이 계속 낮은 학생 */
const DAY=86400000;
export function helpReasons(s, now=Date.now()){
  const r=[];
  const last=s.lastAt?Date.parse(s.lastAt):0, made=s.createdAt?Date.parse(s.createdAt):last;
  if(last && now-last>7*DAY) r.push({t:`${Math.floor((now-last)/DAY)}일째 접속 안 함`, w:2});
  if(!s.count && made && now-made>2*DAY) r.push({t:'아직 답변 없음', w:2});
  if(s.count>=3){
    const avg=s.sum/s.count;
    if(avg<60) r.push({t:`평균 ${Math.round(avg)}점`, w:3});
    const weak=Object.entries(s.crit||{}).filter(([,v])=>v.n>=3).map(([k,v])=>[k,v.s/v.n]).sort((a,b)=>a[1]-b[1])[0];
    if(weak && weak[1]<10) r.push({t:`‘${weak[0]}’ 평균 ${weak[1].toFixed(1)}점`, w:1});
  }
  return r;
}
function renderHelp(list){
  const box=$('#dashHelp');
  const need=list.map(s=>({s, r:helpReasons(s)})).filter(x=>x.r.length).sort((a,b)=>b.r.reduce((t,x)=>t+x.w,0)-a.r.reduce((t,x)=>t+x.w,0));
  if(!list.length){ box.hidden=true; return; }
  box.hidden=false;
  box.innerHTML = need.length
    ? `<h4>도움이 필요한 학생 <b>${need.length}명</b></h4><p class="help-note">7일 넘게 접속하지 않음 · 가입 후 답변 없음 · 평균 60점 미만(답변 3개 이상) · 한 항목 평균 10점 미만</p>
       <ul>${need.slice(0,12).map(({s,r})=>`<li><button class="linkish" type="button" data-help="${esc(s.id)}">${esc(s.sid)} ${esc(s.name)}</button>${r.map(x=>`<span class="pill">${esc(x.t)}</span>`).join('')}</li>`).join('')}</ul>${need.length>12?`<p class="help-note">외 ${need.length-12}명은 표를 정렬해서 확인하세요.</p>`:''}`
    : '<h4>도움이 필요한 학생 <b>0명</b></h4><p class="help-note">지금은 오래 쉬거나 점수가 낮은 학생이 없어요.</p>';
  box.querySelectorAll('[data-help]').forEach(b=>b.onclick=()=>openDetail(b.dataset.help));
}

/* 되돌릴 수 없는 작업은 두 번 눌러야 실행돼요 */
export function armThen(key, fn){
  if(DASH.armed[key]){ delete DASH.armed[key]; renderDash(); return fn(); }
  DASH.armed={[key]:true}; renderDash();
  setTimeout(()=>{ if(DASH.armed[key]){ delete DASH.armed[key]; renderDash(); } },4000);
}
export async function resetStudentPw(id){
  const r=await teacherApi('resetpw',{id});
  if(!r.ok) return alertDash(r.error.message);
  const s=DASH.list.find(x=>x.id===id); if(s) s.temp=true;
  DASH.temp={id, pin:r.temp};
  renderDash(); openDetail(id);
}
export async function deleteStudent(id){
  const r=await teacherApi('delete',{id});
  if(!r.ok) return alertDash(r.error.message);
  DASH.list=DASH.list.filter(x=>x.id!==id);
  if(DASH.sel===id){ DASH.sel=null; $('#dashDetail').innerHTML=''; }
  renderDash();
}
export function alertDash(t){ $('#dashDetail').innerHTML=`<div class="warn" style="margin:14px 0 0">${esc(t)}</div>`; }
export async function openDetail(id, keepScroll){
  DASH.sel=id; renderDash();
  const box=$('#dashDetail');
  box.innerHTML='<div class="detail"><div class="pending"><span class="typing"><i></i><i></i><i></i></span>기록을 불러오는 중…</div></div>';
  const r=await teacherApi('detail',{id});
  if(!r.ok){ box.innerHTML=`<div class="warn" style="margin:14px 0 0">${esc(r.error.message)}</div>`; return; }
  const st=r.student, p=st.profile||{};
  const school=p.schoolName||'', tmp=DASH.temp&&DASH.temp.id===id?DASH.temp.pin:null;
  box.innerHTML=`<section class="detail" aria-label="${esc(st.name)} 학생 기록">
    <div class="detail-head"><div><h4>${esc(st.sid)} ${esc(st.name)} ${st.temp?'<span class="pill temp">임시 비밀번호</span>':''}</h4>
      <p>${esc([school,p.dept,p.type?p.type+'전형':''].filter(Boolean).join(' · ')||'지원 정보 없음')} · 처음 ${fmtDate(st.createdAt)} · 최근 ${fmtDate(st.lastAt)}</p></div>
      <button class="btn ghost sm" type="button" id="detailClose">닫기</button></div>
    ${tmp?`<div class="temp-box">임시 비밀번호<b class="pin">${esc(tmp)}</b>${esc(st.name)} 학생에게 이 번호를 알려 주세요. 학생이 이 번호로 들어오면 바로 새 비밀번호를 정하게 돼요. 다른 기기의 로그인은 모두 끝났어요. (이 번호는 다시 볼 수 없어요)</div>`:''}
    <div id="detailLogs"></div></section>`;
  $('#detailClose').onclick=()=>{ DASH.sel=null; DASH.temp=null; box.innerHTML=''; renderDash(); };
  mountRecords($('#detailLogs'), r.logs||[], {empty:'이 학생은 아직 답변하거나 대화한 기록이 없어요.'});
  if(!keepScroll) box.querySelector('.detail').scrollIntoView({behavior:'smooth',block:'start'});
}
export function downloadCsv(){
  const rows=dashRows().filter(s=>!s.virtual);
  const head=['학번','이름','지원 학교','지원 학과','답변 수','평균','최고','실전 답변','코치 질문','최근 접속','임시 비밀번호'];
  const cell=v=>{ v=String(v??''); return /[",\n]/.test(v)?`"${v.replace(/"/g,'""')}"`:v; };
  const lines=[head, ...rows.map(s=>[s.sid,s.name,s.school,s.dept,s.count,s.avg??'',s.count?s.best:'',s.liveAnswers,s.chats||0,s.lastAt?new Date(s.lastAt).toLocaleString('ko-KR'):'',s.temp?'예':''])].map(r=>r.map(cell).join(','));
  const blob=new Blob(['﻿'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'});   // BOM: 엑셀에서 한글이 깨지지 않게
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=`면접연습_학생현황_${new Date().toISOString().slice(0,10)}.csv`; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),2000);
}
export function initDashboard(){
  $('#dashRefresh').onclick=loadDash;
  $('#vAdd').onclick=async()=>{ const r=await teacherApi('add-virtual'); if(r.ok){ await loadDash(); $('#vSel').value=r.student.id; } };
  $('#dashCsv').onclick=downloadCsv;
  $('#dashQuery').oninput=renderDash;
}
