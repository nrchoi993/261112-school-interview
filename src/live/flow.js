/* 실전 면접: 진행 순서, 채점, 결과 카드, 마무리 */
import { API, ERR_LABEL, sessionToken, setApiStatus } from '../ai/api.js';
import { scoreWithAI } from '../ai/scoring.js';
import { answerEntry, pickSet, sheetHTML, updateStats } from '../chat/chat.js';
import { ADV } from '../data/questions.js';
import { analyze, gradeOf } from '../feedback/rules.js';
import { $, esc, pick } from '../lib/dom.js';
import { IV_NAME, setSpeaking } from './interviewers.js';
import { closeMedia, openMedia, serverSTT, startBrowserSR, startRecording, stopBrowserSR, stopRec, transcribe } from './media.js';
import { countFillers, LIVE, liveButtons, liveStatus, liveSub, voiceFor } from './state.js';
import { beep, ensureAudio, fetchTTS, speak, stopSpeaking } from './voice.js';
import { deliveryHTML, fillerMark, fmtSec } from '../records/records.js';
import { fill, S, schoolName } from '../state.js';
import { logEntry, saveRemote } from '../student/auth.js';
import { ADMIN } from '../teacher/auth.js';

/* ---------- 진행 ---------- */
export async function liveStart(){
  if(!['idle','done'].includes(LIVE.state)) return;
  LIVE.abort=false; LIVE.ttsFails=0;
  await ensureAudio();                                   // 버튼을 누른 순간에 소리 재생을 허락받아요(자동 재생 제한)
  LIVE.urls.forEach(u=>URL.revokeObjectURL(u)); LIVE.urls=[];
  LIVE.limit=+$('#lvLimit').value; LIVE.main=+$('#lvCount').value;
  LIVE.qs=pickSet(LIVE.main).map(q=>({...q})); LIVE.idx=0; LIVE.results=[];
  $('#liveRes').innerHTML=''; $('#liveRes').hidden=$('#lvShow').value==='end'; $('#liveSetup').hidden=true; $('#liveType').hidden=true;
  LIVE.state='intro';
  liveButtons(null,{label:'그만하기',fn:()=>liveStop(false)});
  liveStatus('카메라와 마이크를 켜고 있어요…','브라우저가 권한을 물으면 ‘허용’을 눌러 주세요.');
  const note=await openMedia();
  if(LIVE.abort) return;
  if(note) liveStatus('면접을 시작해요', note); else liveStatus('면접을 시작해요','면접관의 인사를 들어 보세요.');
  const first=voiceFor(0);
  fetchTTS(fill(LIVE.qs[0].q), voiceFor(0)).catch(()=>{});
  const sch=schoolName(), dept=S.profile.dept;
  await speak(`안녕하세요. 지금부터 ${sch?sch+' ':''}${dept?dept+' ':''}면접을 시작하겠습니다. 질문은 모두 ${LIVE.main}개입니다. 긴장하지 말고 편안하게 답변해 주세요.`, first);
  if(LIVE.abort) return;
  askLive();
}
export function progText(){
  const q=LIVE.qs[LIVE.idx]; const n=LIVE.qs.slice(0,LIVE.idx+1).filter(x=>!x.isFollow).length;
  return q&&q.isFollow?`꼬리질문 (${n}/${LIVE.main})`:`질문 ${n} / ${LIVE.main}`;
}
export async function askLive(){
  const q=LIVE.cur=LIVE.qs[LIVE.idx]; if(!q) return liveEnd();
  const voice=q.voice||voiceFor(LIVE.idx);
  q.voice=voice;
  LIVE.state='asking';
  $('#stageProg').textContent=progText();
  liveStatus(`${IV_NAME[voice]}가 질문하고 있어요`,'질문이 끝나면 ‘삐’ 소리와 함께 녹화가 시작돼요.');
  liveButtons({label:'질문 듣는 중…',disabled:true,fn:()=>{}},{label:'그만하기',fn:()=>liveStop(false)});
  const next=LIVE.qs[LIVE.idx+1]; if(next) fetchTTS(fill(next.q), next.voice||voiceFor(LIVE.idx+1)).catch(()=>{});
  await speak(fill(q.q), voice);
  if(LIVE.abort) return;
  beginAnswer();
}
export function beginAnswer(){
  LIVE.state='answering'; beep();
  LIVE.t0=performance.now(); LIVE.voiced=0; LIVE.firstAt=null; LIVE.lastT=0;
  const q=LIVE.cur;
  liveSub(fill(q.q), q.voice);
  const recording = startRecording();
  if(!serverSTT()) startBrowserSR();
  LIVE.typed = !recording;
  if(!recording){ $('#liveType').hidden=false; $('#liveTypeIn').value=''; $('#liveTypeIn').focus(); }
  $('#selfcam').classList.toggle('rec', recording);
  liveStatus(recording?'답변하세요 · 녹화 중':'답변을 글로 적어 주세요', recording?'다 말했으면 ‘답변 마치기’를 누르세요. 제한 시간이 지나면 자동으로 끝나요.':'마이크를 쓸 수 없어 글로 답해요.');
  liveButtons({label:'답변 마치기',rec:true,fn:()=>finishAnswer(false)},{label:'그만하기',fn:()=>liveStop(false)});
  const tm=$('#liveTimer');
  clearInterval(LIVE.tick);
  LIVE.tick=setInterval(()=>{
    const el=(performance.now()-LIVE.t0)/1000, left=Math.max(0,LIVE.limit-el);
    tm.textContent=fmtSec(Math.ceil(left)); tm.classList.toggle('warn',left<=10);
    $('#recTime').textContent=fmtSec(el);
    if(left<=0) finishAnswer(true);
  },200);
}
export async function finishAnswer(timeout){
  if(LIVE.state!=='answering') return;
  LIVE.state='processing';
  clearInterval(LIVE.tick); $('#liveTimer').textContent=''; $('#liveTimer').classList.remove('warn');
  $('#selfcam').classList.remove('rec');
  const sec=Math.min(LIVE.limit,(performance.now()-LIVE.t0)/1000);
  const latency=LIVE.firstAt?(LIVE.firstAt-LIVE.t0)/1000:null;
  const voicedRatio=sec?Math.min(1,LIVE.voiced/1000/sec):0;
  const [video,audio]=await Promise.all([stopRec(LIVE.vRec,LIVE.vChunks),stopRec(LIVE.aRec,LIVE.aChunks)]);
  const srText=LIVE.sr?await stopBrowserSR():'';
  const typed=LIVE.typed?$('#liveTypeIn').value.trim():null;
  $('#liveType').hidden=true;
  const q=LIVE.cur;
  const r={ i:LIVE.results.length, q, voice:q.voice, sec, latency, voiced:voicedRatio, over:!!timeout, typed, srText,
    media: video||audio, mediaKind: video?'video':'audio', done:false };
  if(r.media){ r.url=URL.createObjectURL(r.media); LIVE.urls.push(r.url); }
  LIVE.results.push(r);
  mountCard(r);
  r.promise=processAnswer(r, audio);
  const showEach=$('#lvShow').value==='each';
  if(timeout) liveStatus('시간이 다 됐어요','답변 시간이 끝나서 녹화를 멈췄어요.');
  if(showEach){
    liveStatus('받아쓰고 채점하는 중이에요…','잠시만 기다려 주세요.');
    liveButtons({label:'채점 중…',disabled:true,fn:()=>{}},{label:'그만하기',fn:()=>liveStop(false)});
    await r.promise;
    if(LIVE.abort) return;
    reviewStep(r);
  }else{
    await speak(pick(['네, 잘 들었습니다.','네, 알겠습니다.','네, 좋습니다.']), q.voice);
    if(LIVE.abort) return;
    nextLive();
  }
}
export function reviewStep(r){
  LIVE.state='review';
  const isLast=LIVE.idx>=LIVE.qs.length-1;
  liveStatus(`${r.res?r.res.total+'점':'채점 결과'}이 나왔어요`,'아래 평가표를 확인하고 다음 질문으로 넘어가세요.');
  liveSub('평가표를 확인하세요. 준비되면 다음 질문을 들려 드릴게요.', null, true);
  liveButtons({label:isLast?'면접 마치기':'다음 질문',fn:nextLive},{label:'그만하기',fn:()=>liveStop(false)});
}
export function nextLive(){
  if(LIVE.abort) return;
  LIVE.idx++;
  if(LIVE.idx<LIVE.qs.length) askLive(); else liveEnd();
}
export function addLiveFollow(r){
  const text=r.ai&&r.ai.follow_up; if(!text) return;
  if(LIVE.qs.some(x=>x.parent===r.i)) return;
  const fq={id:r.q.id+'-f',cat:r.q.cat,track:r.q.track,tag:r.q.tag,q:text,isFollow:true,parent:r.i,
    voice:r.voice==='female'?'male':'female',
    intent:'앞 답변을 바탕으로 더 깊이 생각하고 일관되게 답하는가',
    kw:[['때','경험','이유','왜냐하면','때문'],['저는','제가','생각'],['배웠','하겠습니다','노력','계획']],link:false,follow:[]};
  LIVE.qs.splice(LIVE.idx+1,0,fq);
  const b=document.querySelector(`#ans-${r.i} [data-follow]`); if(b){ b.disabled=true; b.textContent='꼬리질문을 다음에 들려 드려요'; }
  if(LIVE.state==='review') liveButtons({label:'꼬리질문 듣기',fn:nextLive},{label:'그만하기',fn:()=>liveStop(false)});
}

/* ---------- 받아쓰기 + 채점 ---------- */
export async function processAnswer(r, audio){
  let text=r.typed, sttMode=r.typed!=null?'typed':'';
  if(text==null){
    if(serverSTT() && audio){
      setCardPending(r,'받아쓰는 중이에요…');
      try{ text=await transcribe(audio, fill(r.q.q)); sttMode='ai'; }
      catch(e){ r.sttErr=e.message; text=r.srText||''; sttMode=r.srText?'browser':''; }
    }else{ text=r.srText||''; sttMode=text?'browser':''; }
  }
  r.stt=sttMode;
  if(!String(text||'').trim()){ r.needType=true; r.done=true; renderCard(r); return; }
  await scoreLive(r, text);
}
export function spokenExtra(d){
  return `[말하기 정보] 이 답변은 학생이 면접관 질문을 듣고 소리 내어 말한 것을 받아쓴 글이야. 받아쓰기 과정에서 생긴 띄어쓰기·문장부호·맞춤법 오류는 평가하지 마.
말한 시간 ${Math.round(d.sec)}초(제한 ${d.limit}초${d.over?', 제한 시간에 걸려 중간에 끊김':''}), 첫 마디까지 ${d.latency==null?'알 수 없음':d.latency.toFixed(1)+'초'}, 말 속도 분당 약 ${d.cpm}자, '음·어' 같은 말버릇 ${d.fillers}번.
expression(말투·분량)은 글자 수 대신 말한 시간(1분 안팎이 알맞음)과 말 속도(분당 250~350자가 알맞음), 말버릇을 반영하고, comments.expression에 이 수치를 근거로 구체적으로 적어.`;
}
export async function scoreLive(r, text){
  r.text=text;
  const chars=text.replace(/[\s.,!?…~"'“”‘’]/g,'').length;
  const speakSec=Math.max(1,r.sec-(r.latency||0));
  r.delivery={ sec:Math.round(r.sec*10)/10, latency:r.latency==null?null:Math.round(r.latency*10)/10, cpm:r.typed!=null?null:Math.round(chars/(speakSec/60)),
    fillers:r.typed!=null?null:countFillers(text), voiced:Math.round(r.voiced*100)/100, limit:LIVE.limit, stt:r.stt, over:r.over };
  setCardPending(r,'AI 면접관이 채점하는 중이에요…');
  const local=analyze(text, r.q);
  let res=local, ai=null;
  if(API.key&&sessionToken()){
    try{
      const out=await scoreWithAI(r.q, local, [{role:'assistant',content:`[면접 질문] ${fill(r.q.q)}`},{role:'user',content:text}],
        r.typed!=null?'[참고] 학생이 마이크를 쓸 수 없어 말할 내용을 글로 적었어.':spokenExtra(r.delivery));
      res=out.res; ai=out.ai;
    }catch(e){ r.aiErr = ADMIN.on ? `${ERR_LABEL[e.kind]||'오류'}: ${e.message}` : 'AI 채점을 받지 못해 기본 평가로 보여 드려요.'; if(e.kind) setApiStatus('error',e); }
  }
  r.res=res; r.ai=ai; r.done=true;
  S.answered.add(r.q.id);
  S.history.push({id:r.q.id,q:fill(r.q.q),total:res.total,crit:res.crit}); updateStats();
  const {stt,...d}=r.delivery; delete d.over;
  logEntry(answerEntry(r.q, text, res, ai, {mode:'live', over:r.over, delivery:{...d, stt}}));
  saveRemote();
  renderCard(r);
}

/* ---------- 결과 카드 ---------- */
export function mountCard(r){
  const el=document.createElement('article'); el.className='ans-card'; el.id='ans-'+r.i;
  $('#liveRes').prepend(el); renderCard(r); setCardPending(r,'녹화를 정리하는 중이에요…');
}
export function setCardPending(r, msg){
  const m=document.querySelector(`#ans-${r.i} .ans-main`);
  if(m) m.innerHTML=`<div class="pending"><span class="typing"><i></i><i></i><i></i></span>${esc(msg)}</div>`;
}
export function renderCard(r){
  const el=document.getElementById('ans-'+r.i); if(!el) return;
  const media = r.url ? (r.mediaKind==='video'?`<video src="${r.url}" controls playsinline preload="metadata"></video>`:`<audio src="${r.url}" controls preload="metadata" style="width:100%"></audio>`) : '<p class="time-note">녹화 파일이 없어요.</p>';
  const ext = r.media ? (/mp4/.test(r.media.type)?'mp4':/ogg/.test(r.media.type)?'ogg':'webm') : '';
  const dl = r.url ? `<a class="btn ghost sm" href="${r.url}" download="실전면접_${r.i+1}_${new Date().toISOString().slice(0,10)}.${ext}">녹화 파일 저장</a>` : '';
  const sttLabel={ai:'AI 받아쓰기',browser:'브라우저 음성 인식',typed:'직접 입력'}[r.stt]||'';
  let main='';
  if(!r.done) main='';
  else if(r.needType) main=`<p><b>말소리를 글로 옮기지 못했어요.</b>${r.sttErr?` <span class="time-note">(${esc(r.sttErr)})</span>`:''}</p>
      <p class="time-note">녹화를 다시 들어 보고, 말한 내용을 아래에 적으면 채점해 드려요.</p>
      <div class="live-type"><textarea data-typein placeholder="내가 말한 내용을 적어 주세요"></textarea><button class="btn" type="button" data-score>채점하기</button></div>`;
  else main=`<h5 style="margin:0 0 4px;font-size:13px">내 답변 <span class="time-note">${esc(sttLabel)}${r.delivery&&r.delivery.fillers?` · <mark style="background:var(--coral-soft)">표시</mark>는 말버릇`:''}</span></h5>
      <div class="transcript">${r.stt==='typed'?esc(r.text):fillerMark(r.text)}</div>
      ${r.aiErr?`<p class="time-note">${esc(r.aiErr)}</p>`:''}
      ${sheetHTML(r.res, r.q, r.over, r.ai)}
      ${r.ai&&r.ai.follow_up&&!r.q.isFollow&&LIVE.state!=='done'&&$('#lvShow').value==='each'?`<p style="margin:10px 0 0"><button class="btn ghost" type="button" data-follow>꼬리질문 받기: “${esc(r.ai.follow_up)}”</button></p>`:''}`;
  el.innerHTML=`<div class="ans-head"><span class="tag ${r.q.isFollow?'exp':'hot'}">${r.q.isFollow?'꼬리질문':'질문 '+(LIVE.qs.slice(0,LIVE.qs.indexOf(r.q)+1).filter(x=>!x.isFollow).length||r.i+1)}</span><span class="q">${esc(fill(r.q.q))}</span><span>${esc(IV_NAME[r.voice]||'')}</span></div>
    <div class="ans-body"><div class="ans-main">${main}</div>
      <div class="ans-side">${media}${dl}${r.delivery?deliveryHTML(r.delivery):`<div class="dl-grid"><div><b>${fmtSec(r.sec)}</b><span>답변 시간 / ${fmtSec(LIVE.limit)}</span></div><div><b>${r.latency==null?'-':r.latency.toFixed(1)+'초'}</b><span>첫 마디까지</span></div></div>`}</div></div>`;
  const sb=el.querySelector('[data-score]');
  if(sb) sb.onclick=async()=>{ const t=el.querySelector('[data-typein]').value.trim(); if(!t) return; r.needType=false; r.stt='typed'; r.typed=t; r.done=false; await scoreLive(r,t); if(LIVE.state==='review') reviewStep(r); };
  const fb=el.querySelector('[data-follow]');
  if(fb) fb.onclick=()=>addLiveFollow(r);
  if(r.done&&r.res){ const st=el.querySelector('.stamp'); if(st) st.classList.remove('anim'); }
}

/* ---------- 끝내기 ---------- */
export async function liveEnd(){
  LIVE.state='ending';
  liveButtons(null,null);
  liveStatus('면접이 끝났어요','채점 결과를 정리하고 있어요…');
  $('#stageProg').textContent='';
  const closing=speak('수고하셨습니다. 이상으로 면접을 모두 마치겠습니다.', voiceFor(0));
  await Promise.all([closing, ...LIVE.results.map(r=>r.promise)]);
  finishLive();
}
export function liveStop(silent){
  if(['idle','done','ending'].includes(LIVE.state)) return;
  LIVE.abort=true;
  stopSpeaking(); clearInterval(LIVE.tick); $('#liveTimer').textContent='';
  $('#selfcam').classList.remove('rec');
  if(LIVE.state==='answering'){ try{ LIVE.vRec&&LIVE.vRec.stop(); }catch(e){} try{ LIVE.aRec&&LIVE.aRec.stop(); }catch(e){} stopBrowserSR(); }
  $('#liveType').hidden=true;
  LIVE.state='ending';
  if(silent){ closeMedia(); LIVE.state='done'; $('#liveRes').hidden=false; return; }
  liveStatus('면접을 그만뒀어요','지금까지 답한 내용만 정리해요.');
  Promise.all(LIVE.results.map(r=>r.promise)).then(finishLive);
}
export function finishLive(){
  closeMedia(); setSpeaking(null);
  LIVE.state='done'; $('#liveRes').hidden=false;
  const done=LIVE.results.filter(r=>r.res);
  $('#liveSetup').hidden=false;
  liveSub('수고했어요! 아래 결과를 확인하고, 다시 해 보려면 ‘다시 하기’를 누르세요.', null, true);
  liveButtons({label:'다시 하기',fn:liveStart},null);
  LIVE.results.forEach(r=>renderCard(r));
  if(!done.length){ liveStatus('채점된 답변이 없어요','다시 시작해 보세요.'); return; }
  const avg=Math.round(done.reduce((t,r)=>t+r.res.total,0)/done.length);
  const per={}; done.forEach(r=>r.res.crit.forEach(c=>{ per[c.name]=per[c.name]||{name:c.name,sum:0,n:0}; per[c.name].sum+=c.score; per[c.name].n++; }));
  const weakest=Object.values(per).sort((a,b)=>a.sum/a.n-b.sum/b.n)[0];
  const sp=done.filter(r=>r.delivery&&r.delivery.cpm!=null);
  const avgCpm=sp.length?Math.round(sp.reduce((t,r)=>t+r.delivery.cpm,0)/sp.length):null;
  const fil=sp.reduce((t,r)=>t+(r.delivery.fillers||0),0);
  const g=gradeOf(avg);
  const box=document.createElement('div');
  box.className='sheet'; box.style.minWidth='0';
  box.innerHTML=`<div class="sheet-top"><div><h4>실전 면접 결과</h4><p>${esc(g.msg)}</p>
      <p>답변 ${done.length}개${avgCpm!=null?` · 평균 말 속도 분당 ${avgCpm}자 (${avgCpm<200?'조금 느려요':avgCpm>380?'조금 빨라요':'알맞아요'})`:''}${sp.length?` · 말버릇 모두 ${fil}번`:''}</p></div>
    <div class="stamp ${g.cls} anim"><div><b>${avg}</b><span>평균</span></div></div></div>
    <div class="fb-sec"><table class="sum-table">${done.map((r,i)=>`<tr><td>${r.q.isFollow?'↳ ':''}${esc(fill(r.q.q))}</td><td>${r.res.total}점</td></tr>`).join('')}</table></div>
    <div class="fb-sec fb-fix"><h5>가장 보완이 필요한 항목: ${esc(weakest.name)}</h5><ul><li>${esc(ADV[weakest.name]||'')}</li>${fil>=done.length*4?'<li>‘음, 어’가 많이 나왔어요. 말을 시작하기 전에 1초 숨을 고르고, 머뭇거릴 때는 소리 대신 잠깐 멈추는 연습을 해 보세요.</li>':''}</ul></div>`;
  $('#liveRes').prepend(box);
  liveStatus(`실전 면접을 마쳤어요 · 평균 ${avg}점`,'녹화 영상은 이 화면을 닫으면 사라져요. 필요하면 ‘녹화 파일 저장’을 누르세요.');
  logEntry({type:'live', count:done.length, avg, items:done.map(r=>({q:fill(r.q.q), total:r.res.total}))});
  box.scrollIntoView({behavior:'smooth',block:'nearest'});
}
export function initLive(){
  $('#liveMain').onclick=liveStart;
  $('#liveTypeBtn').onclick=()=>finishAnswer(false);
  $('#lvSub').onchange=()=>{ if(LIVE.cur&&['asking','answering'].includes(LIVE.state)) liveSub(fill(LIVE.cur.q), LIVE.cur.voice); };
  if('speechSynthesis' in window) speechSynthesis.getVoices();   // 목소리 목록 미리 불러오기
}
