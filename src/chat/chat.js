/* 모의면접 채팅: 질문·답변·평가표·실전 모드(5문항)·인사말 */
import { API, renderApiPanel, sessionToken, STORE_LABEL } from '../ai/api.js';
import { groundNoteHTML, phHTML } from '../ai/grounding.js';
import { aiChat, aiFeedback } from '../ai/scoring.js';
import { ADV, CATS, FRAMES, Q } from '../data/questions.js';
import { SCHED } from '../data/schedule.js';
import { schoolTracks } from '../data/schools.js';
import { TRACKS } from '../data/tracks.js';
import { analyze, gradeOf } from '../feedback/rules.js';
import { $, esc, pick } from '../lib/dom.js';
import { statsOf } from '../records/records.js';
import { curSchool, fill, S, schoolName, trackName } from '../state.js';
import { AUTH, logEntry, LOGS, saveRemote } from '../student/auth.js';
import { ADMIN } from '../teacher/auth.js';

/* 로딩 표시와 중복 전송 방지 */
export function setBusy(on, label){
  S.busy=on;
  const sb=$('#sendBtn'); sb.disabled=on; sb.textContent=on?'기다리는 중':'보내기';
  $('#chips').classList.toggle('busy',on);
  $('#answer').setAttribute('aria-busy',String(on));
  if(on){
    if(S.typingEl) S.typingEl.remove();
    S.typingEl=bot(`<span class="typing" aria-hidden="true"><i></i><i></i><i></i></span><span class="typing-label">${esc(label||'답을 기다리고 있어요…')}</span>`);
    S.typingEl.classList.add('loading');
  }else if(S.typingEl){ S.typingEl.remove(); S.typingEl=null; }
  renderApiPanel();
}

/* 모델 답변(마크다운 일부)을 안전하게 HTML로 */
export function mdLite(t){
  const blocks=esc(t.trim()).split(/\n{2,}/);
  return blocks.map(b=>{
    const lines=b.split('\n');
    const fmt=s=>s.replace(/\*\*(.+?)\*\*/g,'<b>$1</b>');
    if(lines.every(l=>/^\s*([-*•]|\d+[.)])\s+/.test(l))) return `<ul>${lines.map(l=>`<li>${fmt(l.replace(/^\s*([-*•]|\d+[.)])\s+/,''))}</li>`).join('')}</ul>`;
    return `<p>${lines.map(fmt).join('<br>')}</p>`;
  }).join('');
}

/* =========================================================
   4. 채팅 UI
   ========================================================= */
export const chat=$('#chat');
export function addMsg(who, html){
  const el=document.createElement('div');
  el.className='msg '+(who==='bot'?'bot':'me');
  el.innerHTML=(who==='bot'?'<div class="ava" aria-hidden="true">면</div>':'')+`<div class="bubble">${html}</div>`;
  chat.appendChild(el);
  chat.scrollTop=chat.scrollHeight;
  return el;
}
export function bot(html){return addMsg('bot',html)}
export function me(text){return addMsg('me',esc(text))}

export function setChips(list){
  const box=$('#chips'); box.innerHTML='';
  list.forEach(([label,fn,alt])=>{
    const b=document.createElement('button'); b.type='button'; b.className='chip'+(alt?' alt':''); b.textContent=label;
    b.onclick=()=>{ if(S.busy) return; fn(); }; box.appendChild(b);
  });
}
export function idleChips(){
  setChips([
    ['질문 추천받기',()=>askQ(recommend())],
    ['실전 모드 5문항',startReal],
    ['유형별 질문 고르기',catChips],
    ['내 학교 정보',showSchoolMsg,true],
    ['전형 일정',showScheduleMsg,true]
  ]);
}
export function catChips(){
  setChips(CATS.map(c=>[c,()=>{const p=pool().filter(q=>q.cat===c); if(p.length) askQ(pick(p)); else bot('<p>이 계열에는 아직 해당 유형 질문이 없어요.</p>');}]).concat([['처음으로',idleChips,true]]));
}
export function awaitingChips(){
  if(S.mode==='real'){ setChips([['잘 모르겠어요 (힌트 보기)',giveHint,true],['실전 모드 그만하기',endReal,true]]); return; }
  setChips([['잘 모르겠어요 (힌트 보기)',giveHint,true],['다른 질문으로',()=>{stopTimer(); askQ(recommend(S.cur.id));},true]]);
}

export function pool(){return Q.filter(q=>q.track==='all'||q.track===S.profile.track)}
export function recommend(exclude){
  const p=pool().filter(q=>q.id!==exclude);
  const fresh=p.filter(q=>!S.answered.has(q.id));
  const hot=fresh.filter(q=>q.tag==='빈출');
  const mine=fresh.filter(q=>q.track===S.profile.track);
  // 빈출 공통 → 계열 전공 → 나머지 순으로, 약간의 무작위
  if(hot.length && (Math.random()<.65 || !mine.length)) return hot[0];
  if(mine.length) return pick(mine);
  if(fresh.length) return pick(fresh);
  return pick(p);
}

export function qCardHTML(q, idx){
  const tag=q.isFollow?'<span class="tag exp">꼬리질문</span>':`<span class="tag ${q.tag==='빈출'?'hot':'exp'}">${q.tag==='빈출'?'빈출 유형':'예상 질문'}</span>`;
  const prog=idx?`<span style="margin-left:auto">실전 ${idx}/5</span>`:'';
  return `<div class="qcard"><div class="qh">${tag}<span class="tag cat">${esc(q.cat)}</span>${q.track!=='all'?`<span>${esc(TRACKS[q.track].name)}</span>`:''}${prog}</div>
    <div class="qq">${esc(fill(q.q))}</div>
    <div class="qi">면접관이 보는 것: ${esc(q.intent)}</div></div>`;
}

export function askQ(q){
  if(!q) return;
  S.cur=q; S.awaiting=true; S.over=false;
  const idx=S.mode==='real'?(5-S.queue.length):0;
  bot(qCardHTML(q, idx));
  S.convo.push({role:'assistant', content:`[면접 질문] ${fill(q.q)}`});
  awaitingChips();
  $('#answer').focus();
  if(S.mode==='real'||$('#timerOn').checked) startTimer(); else $('#timer').textContent='';
}

export function giveHint(){
  if(!S.cur) return;
  const q=S.cur;
  const fr=FRAMES[q.cat]||FRAMES['인성'];
  bot(`<p>괜찮아요. 아래 순서대로 한 문장씩 떠올려 보세요.</p>
    <ol class="frame">${fr.map(f=>`<li>${esc(f)}</li>`).join('')}</ol>
    ${q.sample?`<details class="sample" style="padding:8px 0 0"><summary>예시 답변 보기</summary><div>${esc(q.sample)}</div></details>`:''}
    <p class="time-note">준비되면 같은 질문에 답을 적어 보내세요.</p>`);
}

export async function submit(){
  if(S.busy) return;                                   // 응답을 기다리는 동안 중복 전송 막기
  const ta=$('#answer'); const text=ta.value.trim();
  if(!text) return;
  ta.value=''; updateCount(); autoSize();
  me(text);
  if(!S.awaiting){
    logEntry({ type:'chat', role:'user', text });
    if(API.key && sessionToken()){ S.convo.push({role:'user', content:text}); await aiChat(); }  // 키가 있으면 AI 코치와 대화
    else intent(text);                                                           // 키가 없으면 규칙 기반 안내
    return;
  }
  if(/^(잘 ?)?모르겠|^패스|^몰라/.test(text) && text.length<15){ giveHint(); return; }
  const over=S.over; stopTimer();
  const q=S.cur;
  S.awaiting=false; S.answered.add(q.id);
  S.convo.push({role:'user', content:text});
  const local=analyze(text,q);                         // 규칙 기반 평가(키가 없거나 요청이 실패하면 이것을 보여 줘요)
  let res=local, ai=null;
  if(API.key && sessionToken()){
    const r=await aiFeedback(q, local);
    if(r){ res=r.res; ai=r.ai; }
    else bot('<p class="time-note">AI 평가를 받지 못해 규칙 기반 평가표를 대신 보여 드려요.</p>');
  }
  S.history.push({id:q.id,q:fill(q.q),total:res.total,crit:res.crit});
  if(S.mode==='real') S.realRes.push({q:fill(q.q),total:res.total,crit:res.crit});
  renderFeedback(res,q,over,ai);
  updateStats();
  logEntry(answerEntry(q, text, res, ai, { mode:'chat', over }));
  saveRemote();
}

/* 기록용 답변 항목: 서버에는 글자만 저장해요(화면 HTML은 저장하지 않아요) */
export function answerEntry(q, text, res, ai, extra){
  return {
    type:'answer', mode:extra.mode||'chat', qid:q.id, q:fill(q.q), cat:q.cat, follow:!!q.isFollow,
    answer:text, total:res.total, ai:!!ai, over:!!extra.over,
    summary: ai ? ai.summary : gradeOf(res.total).msg,
    crit: res.crit.map(c=>({name:c.name, score:c.score, comment: ai ? c.good : (c.score>=14?c.good:c.bad)})),
    good: ai ? ai.good : [...res.crit].sort((a,b)=>b.score-a.score).filter(c=>c.score>=14).slice(0,2).map(c=>c.good),
    fix: ai ? ai.fix : [...res.crit].sort((a,b)=>a.score-b.score).filter(c=>c.score<=13).slice(0,3).map(c=>`${c.name}: ${c.bad}`),
    improved: ai ? (ai.improved_answer||'') : '',
    flags: ai && ai.grounding ? ai.grounding.map(f=>`${f.orig} → ${f.label}`) : [],
    ...(extra.delivery ? { delivery: extra.delivery } : {})
  };
}

export function renderFeedback(res,q,over,ai){
  bot(sheetHTML(res,q,over,ai));
  const followAvail= ai ? !!ai.follow_up : ((q.follow&&q.follow.length)&&!q.isFollow);
  if(S.mode==='real'){
    if(S.queue.length){ setChips([[`다음 질문 (${6-S.queue.length}/5)`,()=>askQ(S.queue.shift())],['실전 모드 그만하기',endReal,true]]); }
    else { setChips([['결과 보기',endReal]]); }
    return;
  }
  const chips=[];
  if(followAvail) chips.push([ai?'꼬리질문 받기 (AI)':'꼬리질문 받기',()=>askFollow(q, ai&&ai.follow_up)]);
  chips.push(['같은 질문 다시 답하기',()=>askQ(q)]);
  chips.push(['다음 질문',()=>askQ(recommend(q.id))]);
  chips.push(['처음으로',idleChips,true]);
  setChips(chips);
}

/* 평가표 HTML (모의면접 채팅과 실전 면접에서 함께 써요) */
export function sheetHTML(res,q,over,ai){
  const g=gradeOf(res.total);
  const sorted=[...res.crit].sort((a,b)=>b.score-a.score);
  const goods=sorted.filter(c=>c.score>=14).slice(0,2);
  const fixes=[...res.crit].sort((a,b)=>a.score-b.score).filter(c=>c.score<=13).slice(0,3);
  const rows=res.crit.map(c=>{
    const f=Math.max(0,Math.min(5,Math.round(c.score/4)));
    const dots=Array.from({length:5},(_,i)=>`<i class="${i<f?'f':''}"></i>`).join('');
    return `<div class="crow"><span class="cn">${c.name}</span><span class="dots" aria-label="${c.score}점 / 20점">${dots}</span><span class="cc">${c.score>=14?esc(c.good):esc(c.bad)}</span></div>`;
  }).join('');
  const fr=FRAMES[q.cat]||FRAMES['인성'];
  const goodHTML = ai ? ai.good.map(t=>esc(t)) : goods.map(c=>esc(c.good));
  const fixHTML = ai ? ai.fix.map(t=>esc(t)) : fixes.map(c=>`<b>${c.name}</b>: ${esc(c.bad)}`);
  const html=`<div class="sheet">
    <div class="sheet-top">
      <div><h4>면접관 평가표${ai?`<span class="ai-tag solid">AI 평가${ADMIN.on?` · ${esc(API.model)}`:''}</span>`:'<span class="ai-tag">규칙 기반</span>'}</h4><p>${esc(ai?ai.summary:g.msg)}</p><p>${res.n}자${over?' · <b style="color:var(--coral)">답변 시간 초과</b>':''}</p></div>
      <div class="stamp ${g.cls} anim" role="img" aria-label="총점 ${res.total}점, ${g.label}"><div><b>${res.total}</b><span>${g.label}</span></div></div>
    </div>
    <div class="crit">${rows}</div>
    ${res.warns.length?`<div class="warn">답변에 ${res.warns.join(', ')}이(가) 들어 있어요. 학교에 따라 면접에서 언급을 금지하니 요강의 유의사항을 확인하고 빼는 것을 권해요.</div>`:''}
    ${goodHTML.length?`<div class="fb-sec fb-good"><h5>잘한 점</h5><ul>${goodHTML.map(h=>`<li>${h}</li>`).join('')}</ul></div>`:''}
    ${fixHTML.length?`<div class="fb-sec fb-fix"><h5>보완할 점</h5><ul>${fixHTML.map(h=>`<li>${h}</li>`).join('')}</ul></div>`:''}
    <div class="fb-sec"><h5>이 순서로 다시 구성해 보세요</h5><ol class="frame">${fr.map(f=>`<li>${esc(f)}</li>`).join('')}</ol></div>
    ${ai&&ai.improved_answer?`<details class="sample" open><summary>내 답변을 다듬은 예시 (AI)</summary>${groundNoteHTML(ai.grounding)}<div>${phHTML(ai.improved_answer)}</div><p class="time-note" style="margin:4px 0 0">[대괄호]는 내 경험으로 직접 채울 자리예요.</p></details>`:''}
    ${q.sample?`<details class="sample"><summary>예시 답변 보기</summary><div>${esc(q.sample)}</div></details>`:''}
  </div>`;
  return html;
}

export function askFollow(q, aiText){
  const text=aiText||pick(q.follow);
  const fq={id:q.id+'-f',cat:q.cat,track:q.track,tag:q.tag,q:text,isFollow:true,
    intent:'앞 답변을 바탕으로 더 깊이 생각하고 일관되게 답하는가',
    kw:[['때','경험','이유','왜냐하면','때문'],['저는','제가','생각'],['배웠','하겠습니다','노력','계획']],link:false,follow:[]};
  askQ(fq);
}

/* 실전 모드 */

/* 실제 면접 순서대로 질문 고르기: 자기소개 → 지원동기 → 학업계획·진로 → 전공 → 인성·상황 (+ 추가) */
export function pickSet(n){
  const p=pool();
  const byCat=c=>p.filter(q=>q.cat===c);
  const major=p.filter(q=>q.track===S.profile.track);
  const set=[
    pick(byCat('자기소개').filter(q=>q.id==='c1').concat(byCat('자기소개')).slice(0,1)),
    pick(byCat('지원동기')),
    pick(byCat('학업계획').concat(byCat('진로'))),
    major.length?pick(major):pick(byCat('진로')),
    pick(byCat('인성').concat(byCat('상황')))
  ];
  const rest=p.filter(q=>!set.includes(q)&&q.cat!=='자기소개');
  while(set.length<n && rest.length) set.splice(set.length-1,0,rest.splice(Math.floor(Math.random()*rest.length),1)[0]);
  if(n<5) return [set[0],set[1],set[3]].slice(0,n);
  return set.slice(0,n);
}
export function startReal(){
  const set=pickSet(5);
  S.mode='real'; S.realRes=[]; S.queue=set.slice(1);
  bot(`<p><b>실전 모드</b>를 시작할게요. 질문 5개를 차례로 드리고, 질문마다 1분 30초를 재요. 시간이 지나도 답을 보낼 수 있지만 평가표에 표시돼요.</p><p>${esc(schoolName()||'지원 학교')} ${esc(S.profile.dept||trackName())} 지원자로 진행합니다.</p>`);
  askQ(set[0]);
}
export function endReal(){
  stopTimer();
  const r=S.realRes; S.mode='free'; S.queue=[]; S.awaiting=false;
  if(!r.length){bot('<p>실전 모드를 마쳤어요. 언제든 다시 시작할 수 있어요.</p>'); idleChips(); return;}
  const avg=Math.round(r.reduce((a,x)=>a+x.total,0)/r.length);
  const per={}; r.forEach(x=>x.crit.forEach(c=>{const k=c.key; per[k]=per[k]||{name:c.name,sum:0}; per[k].sum+=c.score;}));
  const weakest=Object.values(per).sort((a,b)=>a.sum-b.sum)[0];
  const adv=ADV;
  const g=gradeOf(avg);
  bot(`<div class="sheet"><div class="sheet-top"><div><h4>실전 모드 결과</h4><p>${esc(g.msg)}</p></div>
    <div class="stamp ${g.cls} anim"><div><b>${avg}</b><span>평균</span></div></div></div>
    <div class="fb-sec"><table class="sum-table">${r.map((x,i)=>`<tr><td>${i+1}. ${esc(x.q)}</td><td>${x.total}점</td></tr>`).join('')}</table></div>
    <div class="fb-sec fb-fix"><h5>가장 보완이 필요한 항목: ${esc(weakest.name)}</h5><ul><li>${esc(adv[weakest.name]||'')}</li></ul></div></div>`);
  idleChips();
}

/* 대화 의도 */
export function intent(text){
  if(/일정|언제|원서|날짜/.test(text)) return showScheduleMsg();
  if(/실전/.test(text)) return startReal();
  if(/학교|학과|정보|자격증|진로/.test(text)) return showSchoolMsg();
  if(/질문|추천|연습|시작|면접/.test(text)) return askQ(recommend());
  bot('<p>저는 면접 질문을 드리고 답변에 피드백을 하는 연습 도우미예요. 아래 버튼을 누르거나 “질문 추천해 줘”, “실전 모드”, “전형 일정”, “학교 정보”처럼 입력해 보세요.</p>');
  idleChips();
}

export function schoolInfoHTML(s, compact){
  const tr=schoolTracks(s).map(k=>TRACKS[k].name).join(', ');
  return `<p><b>${esc(s.n)}</b> <span class="time-note">${esc(s.g==='남·여'?'남녀공학':s.g==='여'?'여학생 모집':'남학생 모집')} · 모집 지역 ${esc(s.rg)} · ${esc(tr)}</span></p>
    <p><b>학과(모집 정원)</b><br>${s.d.map(([n,c])=>`${esc(n)} ${c}명`).join(', ')}</p>
    <p><b>특별전형</b></p><ul>${s.sp.map(([n,ds])=>`<li><b>${esc(n)}</b>: ${esc(ds)}</li>`).join('')}</ul>
    <p><b>미래인재 특별전형 배점(100점)</b><br>${esc(s.ev)}</p>
    ${s.tips.length?`<p><b>면접 준비 포인트</b></p><ul>${s.tips.map(t=>`<li>${esc(t)}</li>`).join('')}</ul>`:''}
    <p class="time-note">출처: 2027학년도 특성화고 신입생 입학전형 요강(서울시교육청) ${esc(s.pg)}쪽${s.hp?` · <a href="${esc(s.hp)}" target="_blank" rel="noopener">학교 홈페이지</a>`:''}</p>`;
}
export function showSchoolMsg(){
  const t=TRACKS[S.profile.track];
  const s=curSchool();
  const trackPart=`<p><b>${esc(t.name)} 계열</b>에서는 ${esc(t.learn)}</p>
    <ul><li>관련 자격증: ${t.certs.map(esc).join(', ')}</li><li>진로 예시: ${t.jobs.map(esc).join(', ')}</li></ul>
    <p class="time-note">학과에서 배우는 내용·자격증을 지원동기와 학업계획 답변에 넣으면 ‘학교·학과 연계’ 점수가 올라가요.</p>`;
  if(s) bot(schoolInfoHTML(s)+trackPart);
  else bot(`<p>${schoolName()?`<b>${esc(schoolName())}</b>은(는) 서울 특성화고 67개교 목록에 없어요. 학교 이름을 다시 확인하거나 하이잡(high-job.sen.go.kr)에서 요강을 확인하세요.`:'수험표에서 지원 학교를 고르면 학과, 특별전형, 면접 배점을 함께 보여 드려요.'}</p>`+trackPart);
  if(!S.awaiting) idleChips();
}

export function showScheduleMsg(){
  bot(`<p>2027학년도 서울 특성화고 전형 일정이에요.</p><ul>${SCHED.map(x=>`<li><b>${x.t}</b>: ${x.s}</li>`).join('')}</ul>
    <p class="time-note">출처: 하이잡(서울시교육청), 서울진로진학정보센터. 학교별 세부 일정은 입학전형 요강을 확인하세요.</p>`);
  if(!S.awaiting) idleChips();
}

/* 타이머 */
export function startTimer(){
  stopTimer(); S.tLeft=90; S.over=false; renderTimer();
  S.timerId=setInterval(()=>{S.tLeft--; if(S.tLeft<0) S.over=true; renderTimer();},1000);
}
export function stopTimer(){ if(S.timerId){clearInterval(S.timerId); S.timerId=null;} $('#timer').textContent=''; $('#timer').classList.remove('over'); }
export function renderTimer(){
  const el=$('#timer'); const t=Math.abs(S.tLeft);
  const mm=Math.floor(t/60), ss=String(t%60).padStart(2,'0');
  el.textContent=(S.tLeft<0?'시간 초과 +':'남은 시간 ')+`${mm}:${ss}`;
  el.classList.toggle('over',S.tLeft<0);
}

/* 입력창 */
export const ta=$('#answer');
export function updateCount(){$('#charCount').textContent=ta.value.replace(/\s/g,'').length}
export function autoSize(){ta.style.height='auto'; ta.style.height=Math.min(180,ta.scrollHeight)+'px'}
/* 입력창·보내기 버튼·음성 입력 연결 */
export function initChat(){
ta.addEventListener('input',()=>{updateCount();autoSize();});
ta.addEventListener('keydown',e=>{ if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault(); submit();} });
$('#sendBtn').onclick=submit;
$('#timerOn').onchange=e=>{ if(S.awaiting&&e.target.checked) startTimer(); if(!e.target.checked&&S.mode!=='real') stopTimer(); };

/* 음성 입력 (지원 브라우저만) */
(function(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition; if(!SR) return;
  const btn=$('#micBtn'); btn.hidden=false;
  const rec=new SR(); rec.lang='ko-KR'; rec.interimResults=true; rec.continuous=true;
  let base='', on=false;
  rec.onresult=e=>{let txt=''; for(let i=e.resultIndex;i<e.results.length;i++){txt+=e.results[i][0].transcript;}
    if(e.results[e.results.length-1].isFinal){base+=txt+' '; ta.value=base;} else ta.value=base+txt; updateCount(); autoSize();};
  rec.onend=()=>{on=false; btn.setAttribute('aria-pressed','false');};
  btn.onclick=()=>{ if(on){rec.stop(); return;} base=ta.value?ta.value+' ':''; try{rec.start(); on=true; btn.setAttribute('aria-pressed','true');}catch(e){} };
})();
}

/* 통계 */
export function updateStats(){
  const h=S.history; $('#stCount').textContent=h.length;
  if(!h.length){ $('#stAvg').textContent='-'; $('#stBest').textContent='-'; $('#stWeak').style.display='none'; return; }
  const avg=Math.round(h.reduce((a,x)=>a+x.total,0)/h.length);
  $('#stAvg').textContent=avg; $('#stBest').textContent=Math.max(...h.map(x=>x.total));
  const per={}; h.forEach(x=>x.crit.forEach(c=>{per[c.name]=per[c.name]||{s:0,n:0}; per[c.name].s+=c.score; per[c.name].n++;}));
  const w=Object.entries(per).map(([k,v])=>[k,v.s/v.n]).sort((a,b)=>a[1]-b[1])[0];
  const box=$('#stWeak'); box.style.display='block';
  box.innerHTML=`가장 약한 항목: <b>${esc(w[0])}</b> (평균 ${w[1].toFixed(1)}/20)`;
}

export function greet(kind){
  const st=statsOf(LOGS);
  const who=AUTH.student?`<b>${esc(AUTH.student.name)}</b> 학생, `:'';
  const head = kind==='back'
    ? `<p>${who}다시 왔네요! ${st.count?`지금까지 답변 <b>${st.count}개</b>, 평균 <b>${st.avg}점</b>이에요. 지난 기록은 <b>내 기록</b> 탭에서 볼 수 있어요.`:'지난번 수험표 정보를 불러왔어요.'}</p>`
    : kind==='new'
    ? `<p>${who}반가워요! 내 기록을 새로 만들었어요. 이제 어느 기기에서든 같은 학번·이름·비밀번호로 들어오면 이어서 연습할 수 있어요.</p>`
    : '<p>안녕하세요! 오늘 모의면접을 맡은 면접관이에요.</p>';
  bot(`${head}
  <p><b>수험표</b>에 지원 학교와 학과를 적으면 그에 맞춘 질문을 드릴게요. 질문에 답을 보내면 <b>평가표</b>로 잘한 점과 고칠 점을 알려 드려요. 실제처럼 말로 연습하려면 <b>실전 면접</b> 탭으로 가 보세요.</p>
  ${API.key&&sessionToken()
    ? '<p class="time-note">답변은 AI 면접관이 평가하고, 질문이 아닌 메시지에는 AI 코치가 답해요. 앞서 나눈 대화도 기억해요.</p>'
    : '<p class="time-note">지금은 기본 평가 모드로 동작해요.</p>'}
  ${AUTH.guest?'<p class="time-note">저장 없이 둘러보는 중이라 기록이 남지 않아요.</p>':''}
  ${ADMIN.on ? `<p class="time-note">교사: 모델 <code>${esc(API.model)}</code> · ${API.key?'서버에 API 키 있음':'서버에 API 키 없음(Vercel 환경 변수 <code>OPENAI_API_KEY</code>)'} · 저장소 ${esc(STORE_LABEL[API.srv&&API.srv.storage]||'-')}</p>` : ''}
  <p class="time-note">실제 면접처럼 ‘~습니다’ 말투로, 1분 안팎(250~350자)으로 답해 보세요.</p>`);
  idleChips();
}
export function resetChat(kind){
  if(S.abort) S.abort.abort();                          // 진행 중인 요청 취소
  setBusy(false); stopTimer();
  chat.innerHTML='';
  if(typeof kind!=='string'){ S.convo=[]; saveRemote(); }   // ‘대화 초기화’ 버튼: AI가 기억하는 대화도 지워요
  S.cur=null; S.awaiting=false; S.mode='free'; S.queue=[]; S.realRes=[];
  greet(typeof kind==='string'?kind:'');
  if($('#gate').hidden) $('#answer').focus();
}
