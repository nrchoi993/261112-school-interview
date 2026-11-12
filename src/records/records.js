/* 기록 보기(학생 ‘내 기록’·교사 상세 공용): 통계·점수 추이·대화 목록 */
import { groundNoteHTML, phHTML } from '../ai/grounding.js';
import { gradeOf } from '../feedback/rules.js';
import { $, esc } from '../lib/dom.js';
import { FILLER_RE } from '../live/state.js';
import { AUTH, LOGS } from '../student/auth.js';

/* =========================================================
   8. 기록 보기 (학생 ‘내 기록’ 탭과 교사 대시보드 학생 상세에서 함께 써요)
   ========================================================= */
export const fmtDate=s=>{ const d=new Date(s); return isNaN(d)?'':d.toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}); };
export const fmtSec=s=>{ s=Math.round(s||0); return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; };
export function statsOf(logs){
  const ans=logs.filter(e=>e.type==='answer');
  const per={};
  ans.forEach(a=>a.crit.forEach(c=>{ per[c.name]=per[c.name]||{s:0,n:0}; per[c.name].s+=c.score; per[c.name].n++; }));
  return {
    ans, count:ans.length,
    avg: ans.length?Math.round(ans.reduce((t,a)=>t+a.total,0)/ans.length):null,
    best: ans.length?Math.max(...ans.map(a=>a.total)):null,
    live: ans.filter(a=>a.mode==='live').length,
    chats: logs.filter(e=>e.type==='chat'&&e.role==='user').length,
    crit: Object.entries(per).map(([k,v])=>[k,v.s/v.n])
  };
}
/* 점수 추이: 한 계열(single series)이라 범례 없이 제목으로 이름을 붙이고, 마우스를 올리면 값이 보여요 */
export function trendSVG(ans){
  const pts=ans.slice(-20); if(pts.length<2) return '';
  const W=480,H=160,L=30,R=10,T=12,B=12, x=i=>L+(W-L-R)*(pts.length===1?0.5:i/(pts.length-1)), y=v=>T+(H-T-B)*(1-v/100);
  const grid=[0,50,100].map(v=>`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${L-6}" y="${y(v)+4}" text-anchor="end" font-size="12" fill="var(--muted)">${v}</text>`).join('');
  const d=pts.map((a,i)=>`${i?'L':'M'}${x(i).toFixed(1)} ${y(a.total).toFixed(1)}`).join(' ');
  const dots=pts.map((a,i)=>`<circle cx="${x(i).toFixed(1)}" cy="${y(a.total).toFixed(1)}" r="4" fill="var(--ink)" stroke="#fff" stroke-width="2"/>`).join('');
  const hits=pts.map((a,i)=>`<rect class="hit" x="${(x(i)-(W-L-R)/pts.length/2).toFixed(1)}" y="${T}" width="${((W-L-R)/pts.length).toFixed(1)}" height="${H-T-B}" fill="transparent" data-tip="${esc(`${fmtDate(a.at)} · ${a.total}점 · ${a.mode==='live'?'실전':'모의'}`)}" data-x="${x(i).toFixed(1)}" data-y="${y(a.total).toFixed(1)}"/>`).join('');
  return `<div class="chart-box"><h4>최근 답변 점수 추이 (최근 ${pts.length}개, 100점 만점)</h4>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="최근 답변 점수 추이">${grid}<path d="${d}" fill="none" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round"/>${dots}${hits}</svg><span class="chart-tip"></span></div>`;
}
export function wireTrend(root){
  const box=root.querySelector('.chart-box'); if(!box) return;
  const svg=box.querySelector('svg'), tip=box.querySelector('.chart-tip');
  box.querySelectorAll('.hit').forEach(h=>{
    h.addEventListener('mouseenter',()=>{
      const r=svg.getBoundingClientRect(), br=box.getBoundingClientRect(), k=r.width/480;
      tip.textContent=h.dataset.tip; tip.style.display='block';
      tip.style.left=(r.left-br.left+ +h.dataset.x*k)+'px'; tip.style.top=(r.top-br.top+ +h.dataset.y*k)+'px';
    });
    h.addEventListener('mouseleave',()=>{ tip.style.display='none'; });
  });
}
export function critBarsHTML(crit){
  if(!crit.length) return '';
  return `<div class="chart-box"><h4>평가 항목별 평균 (20점 만점)</h4><div class="bars">${crit.map(([k,v])=>
    `<div class="bar-row"><span>${esc(k)}</span><span class="tr"><i style="width:${(v/20*100).toFixed(1)}%"></i></span><b>${v.toFixed(1)}</b></div>`).join('')}</div></div>`;
}
export function fillerMark(text){
  return esc(text).replace(FILLER_RE,(m,pre,w)=>`${pre}<mark>${w}</mark>`);
}
export function deliveryHTML(d){
  if(!d) return '';
  const sp = d.cpm==null?'':d.cpm<200?'느린 편':d.cpm>380?'빠른 편':'알맞음';
  return `<div class="dl-grid">
    <div class="${d.limit&&d.sec>=d.limit?'bad':''}"><b>${fmtSec(d.sec)}</b><span>답변 시간${d.limit?` / ${fmtSec(d.limit)}`:''}</span></div>
    <div class="${d.latency>5?'bad':''}"><b>${d.latency==null?'-':d.latency.toFixed(1)+'초'}</b><span>첫 마디까지</span></div>
    <div class="${sp&&sp!=='알맞음'?'bad':''}"><b>${d.cpm==null?'-':d.cpm}</b><span>말 속도 (자/분) ${sp}</span></div>
    <div class="${d.fillers>=5?'bad':''}"><b>${d.fillers==null?'-':d.fillers+'번'}</b><span>‘음·어’ 말버릇</span></div>
  </div>`;
}
export function logItemHTML(e){
  if(e.type==='chat') return `<div class="log lchat ${e.role==='assistant'?'ai':''}"><div class="log-h"><b>${e.role==='assistant'?'AI 코치':'학생'}</b><span>${fmtDate(e.at)}</span></div><div class="log-a">${esc(e.text)}</div></div>`;
  if(e.type==='live') return `<div class="log live"><div class="log-h"><b>실전 면접 마침</b><span>${fmtDate(e.at)}</span><span class="score ${gradeOf(e.avg).cls}">평균 ${e.avg}점</span></div>
    <div class="log-a">${e.items.map((x,i)=>`${i+1}. ${esc(x.q)} — ${x.total}점`).join('\n')}</div></div>`;
  const g=gradeOf(e.total);
  return `<div class="log"><div class="log-h"><span class="tag ${e.mode==='live'?'hot':'exp'}">${e.mode==='live'?'실전 면접':'모의면접'}</span>${e.follow?'<span class="tag exp">꼬리질문</span>':''}<span class="tag cat">${esc(e.cat||'')}</span><span>${fmtDate(e.at)}</span><span>${e.ai?'AI 평가':'기본 평가'}</span><span class="score ${g.cls}">${e.total}점</span></div>
    <div class="log-q">${esc(e.q)}</div>
    <div class="log-a">${e.mode==='live'?fillerMark(e.answer):esc(e.answer)}</div>
    <details><summary>평가 자세히 보기</summary>
      ${e.delivery?deliveryHTML(e.delivery):''}
      <p style="margin:6px 0">${esc(e.summary||'')}</p>
      <div class="mini-crit">${e.crit.map(c=>`<span>${esc(c.name)} <b>${c.score}</b>/20</span>`).join('')}</div>
      ${e.good.length?`<b style="color:var(--mint)">잘한 점</b><ul>${e.good.map(t=>`<li>${esc(t)}</li>`).join('')}</ul>`:''}
      ${e.fix.length?`<b style="color:var(--coral)">보완할 점</b><ul>${e.fix.map(t=>`<li>${esc(t)}</li>`).join('')}</ul>`:''}
      ${e.improved?`<b>다듬은 예시 답변</b>${groundNoteHTML(e.flags)}<div class="transcript">${phHTML(e.improved)}</div>`:''}
    </details></div>`;
}
export const REC_FILTERS=[['all','전체'],['answer','답변·평가'],['live','실전 면접'],['chat','코치 대화']];
export function mountRecords(root, logs, opts){
  opts=opts||{};
  const st=statsOf(logs);
  let filter='all', shown=40;
  const kpis=`<div class="kpis">
    <div class="kpi"><b>${st.count}</b><span>답변 수</span></div>
    <div class="kpi"><b>${st.avg??'-'}</b><span>평균 점수</span></div>
    <div class="kpi"><b>${st.best??'-'}</b><span>최고 점수</span></div>
    <div class="kpi"><b>${st.live}</b><span>실전 면접 답변</span></div>
    <div class="kpi"><b>${st.chats}</b><span>코치에게 한 질문</span></div></div>`;
  const draw=()=>{
    const list=logs.filter(e=> filter==='all' || (filter==='answer'&&e.type==='answer') || (filter==='live'&&((e.type==='answer'&&e.mode==='live')||e.type==='live')) || (filter==='chat'&&e.type==='chat')).slice().reverse();
    const trend=trendSVG(st.ans)||(st.count?'<div class="chart-box"><h4>최근 답변 점수 추이</h4><p class="time-note" style="margin:0">답변이 2개 이상 쌓이면 점수 변화를 선으로 보여 줘요.</p></div>':'');
    root.innerHTML = (logs.length?kpis+`<div class="two-col"><div>${trend}</div><div>${critBarsHTML(st.crit)}</div></div>`:'')+
      `<div class="rec-filter" role="group" aria-label="기록 종류">${REC_FILTERS.map(([k,l])=>`<button type="button" data-f="${k}" aria-pressed="${k===filter}">${l}</button>`).join('')}</div>`+
      (list.length?`<div class="logs">${list.slice(0,shown).map(logItemHTML).join('')}</div>${list.length>shown?`<p style="text-align:center"><button class="btn ghost" type="button" data-more>더 보기 (${list.length-shown}개 남음)</button></p>`:''}`
        :`<div class="empty-note">${opts.empty||'아직 기록이 없어요. 모의면접이나 실전 면접에서 답해 보세요.'}</div>`);
    root.querySelectorAll('[data-f]').forEach(b=>b.onclick=()=>{ filter=b.dataset.f; shown=40; draw(); });
    const m=root.querySelector('[data-more]'); if(m) m.onclick=()=>{ shown+=40; draw(); };
    wireTrend(root);
  };
  draw();
}
export function renderMyRecords(){
  const el=$('#myRecords');
  if(!AUTH.student){
    el.innerHTML=`<div class="empty-note">${AUTH.guest?'저장 없이 둘러보는 중이라 이번 연습만 아래에 보여요.':'로그인하면 내 기록을 볼 수 있어요.'}</div>`;
    if(AUTH.guest&&LOGS.length){ const d=document.createElement('div'); el.appendChild(d); mountRecords(d,LOGS); }
    return;
  }
  mountRecords(el, LOGS);
}
