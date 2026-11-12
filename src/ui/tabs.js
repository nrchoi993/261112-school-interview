/* 탭 전환, 질문 은행, 학교·학과 정보, 전형 일정·D-day */
import { askQ } from '../chat/chat.js';
import { CATS, Q } from '../data/questions.js';
import { SCHED } from '../data/schedule.js';
import { SCHOOLS, schoolTracks } from '../data/schools.js';
import { TRACKS } from '../data/tracks.js';
import { $, esc } from '../lib/dom.js';
import { renderLiveEnv } from '../live/state.js';
import { renderMyRecords } from '../records/records.js';
import { fill, S, saveProfile } from '../state.js';
import { renderTrackBadge, setSchool } from './ticket.js';

export function switchTab(name){
  document.querySelectorAll('.tabs button').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===name)));
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('on',t.id==='tab-'+name));
  if(name==='records') renderMyRecords();
  if(name==='live') renderLiveEnv();
}
export function initTabs(){ document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab)); }

/* 질문 은행 */
export function initBank(){
  $('#fCat').innerHTML='<option value="">유형 전체</option>'+CATS.map(c=>`<option>${c}</option>`).join('');
  $('#fTrack').innerHTML='<option value="mine">공통 + 내 계열</option><option value="">모든 계열</option><option value="all">공통 질문만</option>'+Object.entries(TRACKS).map(([k,t])=>`<option value="${k}">${esc(t.name)}</option>`).join('');
  ['#fCat','#fTrack','#fTag'].forEach(s=>$(s).onchange=renderBank);
}
export function renderBank(){
  const c=$('#fCat').value, tr=$('#fTrack').value, tg=$('#fTag').value;
  const list=Q.filter(q=>(!c||q.cat===c)&&(!tg||q.tag===tg)&&(
    tr===''?true: tr==='mine'?(q.track==='all'||q.track===S.profile.track): q.track===tr));
  $('#bankCount').textContent=`${list.length}개 질문`;
  $('#bankList').innerHTML=list.map(q=>`<div class="qitem">
    <div class="tags"><span class="tag ${q.tag==='빈출'?'hot':'exp'}">${q.tag==='빈출'?'빈출 유형':'예상 질문'}</span><span class="tag cat">${esc(q.cat)}</span>${q.track!=='all'?`<span class="tag exp">${esc(TRACKS[q.track].name)}</span>`:''}${S.answered.has(q.id)?'<span class="tag cat">연습함</span>':''}</div>
    <div class="t">${esc(fill(q.q))}</div>
    <div class="d">면접관이 보는 것: ${esc(q.intent)}</div>
    <button class="btn" data-q="${q.id}">이 질문으로 연습</button></div>`).join('');
  $('#bankList').querySelectorAll('button').forEach(b=>b.onclick=()=>{
    const q=Q.find(x=>x.id===b.dataset.q);
    if(q.track!=='all'&&q.track!==S.profile.track){S.profile.track=q.track; S.profile.trackManual=true; renderTrackBadge(); saveProfile(); renderSchoolTab();}
    switchTab('chat'); if(S.mode==='real'){S.mode='free'; S.queue=[];} askQ(q);
  });
}

/* 학교·학과 탭 */
export function initSchoolFilters(){
  $('#sTrack').innerHTML='<option value="">모든 계열</option>'+Object.entries(TRACKS).map(([k,t])=>`<option value="${k}">${esc(t.name)}</option>`).join('');
  $('#sGender').innerHTML='<option value="">남녀 모두</option><option value="남·여">남녀공학</option><option value="여">여학생 모집</option><option value="남">남학생 모집</option>';
  $('#sQuery').oninput=renderSchoolList; $('#sTrack').onchange=renderSchoolList; $('#sGender').onchange=renderSchoolList;
}
export function renderSchoolTab(){
  $('#trackGrid').innerHTML=Object.entries(TRACKS).map(([k,t])=>{
    const n=SCHOOLS.filter(s=>schoolTracks(s).includes(k)).length;
    return `<div class="trk ${k===S.profile.track?'sel':''}">
    <h4>${esc(t.name)} <span class="time-note">${n}개교</span></h4><p>${esc(t.learn)}</p>
    <dl><dt>관련 자격증</dt><dd>${t.certs.map(esc).join(', ')}</dd><dt>진로 예시</dt><dd>${t.jobs.map(esc).join(', ')}</dd></dl></div>`;}).join('');
  renderSchoolList();
}
export function renderSchoolList(){
  const q=($('#sQuery').value||'').trim(), tk=$('#sTrack').value, g=$('#sGender').value;
  const list=SCHOOLS.map((s,i)=>[s,i]).filter(([s])=>
    (!q || s.n.includes(q) || s.d.some(([d])=>d.includes(q))) &&
    (!tk || schoolTracks(s).includes(tk)) && (!g || s.g===g));
  $('#schCount').textContent=`${list.length}개교`;
  $('#schList').innerHTML=list.length?list.map(([s,i])=>{
    const on=String(i)===S.profile.schoolIdx;
    return `<div class="sch ${on?'on':''}">
    <div class="grow"><div class="nm">${esc(s.n)}<span class="ar">${esc(s.g==='남·여'?'남녀공학':s.g==='여'?'여학생':'남학생')} · ${esc(s.rg)}</span></div>
    <div class="dp">${s.d.map(([d,c])=>`<button type="button" class="dchip${q&&d.includes(q)?' hit':''}${on&&d===S.profile.dept?' cur':''}" data-i="${i}" data-d="${esc(d)}" title="${esc(d)}를 지원 학과로 설정">${esc(d)} <small>${c}명</small></button>`).join('')}</div>
    <p class="nt"><b>미래인재 배점</b> ${esc(s.ev)}</p>
    <details class="more"><summary>특별전형·면접 포인트</summary>
      <ul>${s.sp.map(([n,ds])=>`<li><b>${esc(n)}</b>: ${esc(ds)}</li>`).join('')}${s.tips.map(t=>`<li>${esc(t)}</li>`).join('')}</ul>
      <span class="src">요강 ${esc(s.pg)}쪽${s.hp?` · <a href="${esc(s.hp)}" target="_blank" rel="noopener">홈페이지</a>`:''}</span></details></div>
    <button class="btn ${on?'':'ghost'}" data-i="${i}">${on?'지원 학교로 설정됨':'지원 학교로 설정'}</button></div>`;}).join('')
    :'<p class="lead">조건에 맞는 학교가 없어요. 검색어를 줄이거나 필터를 바꿔 보세요.</p>';
  $('#schList').querySelectorAll('button.btn[data-i]').forEach(b=>b.onclick=()=>setSchool(b.dataset.i,true));
  $('#schList').querySelectorAll('button.dchip').forEach(b=>b.onclick=()=>setSchool(b.dataset.i,true,b.dataset.d));
}

/* 일정 탭 + D-day */
export function today(){const n=new Date(); return new Date(n.getFullYear(),n.getMonth(),n.getDate());}
export function parse(d){const [y,m,dd]=d.split('-').map(Number); return new Date(y,m-1,dd);}
export function renderGuide(){
  const t=today();
  let nowIdx=SCHED.findIndex(x=>parse(x.e)>=t);
  $('#timeline').innerHTML=SCHED.map((x,i)=>`<li class="${i===nowIdx?'now':''}"><b>${x.t}</b><span>${x.s}</span></li>`).join('');
  const target=S.profile.type==='일반'?SCHED[3]:SCHED[1];
  const diff=Math.round((parse(target.d)-t)/86400000);
  const box=$('#dday');
  if(diff>0) box.innerHTML=`<b>D-${diff}</b><span>${target.t}까지<em>${target.s.split(',')[0]}</em></span>`;
  else if(parse(target.e)>=t) box.innerHTML=`<b>D-DAY</b><span>${target.t} 기간<em>${target.s.split(',')[0]}</em></span>`;
  else box.innerHTML=`<b>완료</b><span>2027학년도 ${target.t}<em>일정이 끝났어요</em></span>`;
}
