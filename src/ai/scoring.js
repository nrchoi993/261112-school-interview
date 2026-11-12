/* AI 채점·AI 코치 대화·연결 확인 */
import { API, ApiError, callResponses, handleApiError, setApiStatus } from './api.js';
import { groundImproved } from './grounding.js';
import { applicantContext, CHAT_INSTRUCTIONS, FEEDBACK_SCHEMA, feedbackInstructions, recentConvo } from './prompts.js';
import { bot, idleChips, mdLite, setBusy } from '../chat/chat.js';
import { esc } from '../lib/dom.js';
import { S } from '../state.js';
import { logEntry, saveRemote } from '../student/auth.js';

/* 답변 평가: 구조화 출력(text.format: json_schema)으로 평가표 데이터를 받아요 */
/* AI 채점의 핵심: 모의면접(채팅)과 실전 면접이 함께 써요.
   input: Responses API에 보낼 대화 기록, extra: instructions 뒤에 덧붙일 말(예: 말하기 정보) */
export async function scoreWithAI(q, local, input, extra, signal, opts){
  const linkName = local.crit[2].name;
  const { text } = await callResponses({
    instructions: feedbackInstructions(q, linkName) + (extra ? '\n\n' + extra : ''),
    input,
    max_output_tokens: 8000,
    text: { format: { type:'json_schema', name:'interview_feedback', strict:true, schema: FEEDBACK_SCHEMA } }
  }, signal, opts);
  let ai;
  try{ ai = JSON.parse(text); }catch(e){ throw new ApiError('parse','평가 결과(JSON)를 읽지 못했어요. 다시 보내 보세요.'); }
  const clamp=v=>Math.max(0,Math.min(20,Math.round(+v||0)));
  const keys=['fit','detail','link','structure','expression'];
  const crit = local.crit.map((c,i)=>({ key:c.key, name:c.name, score:clamp(ai.scores[keys[i]]), good:ai.comments[keys[i]], bad:ai.comments[keys[i]] }));
  const res = { total: crit.reduce((a,c)=>a+c.score,0), crit, n: local.n, warns: local.warns };
  ai.good=(ai.good||[]).slice(0,2); ai.fix=(ai.fix||[]).slice(0,3);
  // 자동 점검: 예시 답변에 학생이 말하지 않은 숫자·이름이 들어가면 대괄호로 바꿔요
  const said=[...input].reverse().find(m=>m.role==='user');
  const g=groundImproved(ai.improved_answer||'', said?said.content:'', q);
  ai.improved_answer=g.text; ai.grounding=g.flags;
  // 고칠 점의 '→ 예:' 문장도 같은 방식으로 점검해요
  ai.fix=ai.fix.map(t=>{ const i=t.indexOf('→'); if(i<0) return t; return t.slice(0,i)+groundImproved(t.slice(i), said?said.content:'', q).text; });
  return { res, ai };
}

export async function aiFeedback(q, local){
  const ctl=new AbortController(); S.abort=ctl;
  setBusy(true,'AI 면접관이 답변을 평가하고 있어요…');
  try{
    const r = await scoreWithAI(q, local, recentConvo(), '', ctl.signal);
    S.convo.push({ role:'assistant', content:`[평가] 총점 ${r.res.total}/100. ${r.ai.summary} 고칠 점: ${r.ai.fix.join(' ')}` });
    saveRemote();
    return r;
  }catch(e){
    handleApiError(e);
    return null;
  }finally{ setBusy(false); S.abort=null; }
}

/* 자유 대화: 질문에 답하는 중이 아닐 때 보낸 메시지는 AI 코치가 답해요 */
export async function aiChat(){
  const ctl=new AbortController(); S.abort=ctl;
  setBusy(true,'AI 면접 코치가 답을 쓰고 있어요…');
  try{
    const { text } = await callResponses({
      instructions: CHAT_INSTRUCTIONS + '\n\n[지원 정보]\n' + applicantContext(),
      input: recentConvo(),
      max_output_tokens: 4000
    }, ctl.signal);
    S.convo.push({ role:'assistant', content:text });
    logEntry({ type:'chat', role:'assistant', ai:true, text });
    saveRemote();
    bot(mdLite(text));
  }catch(e){ handleApiError(e); }
  finally{ setBusy(false); S.abort=null; }
  if(!S.awaiting) idleChips();
}

export async function testConnection(){
  if(S.busy) return;
  if(!API.key){ setApiStatus('nokey'); bot('<p>서버에 API 키가 없어요. Vercel → Settings → Environment Variables에 <code>OPENAI_API_KEY</code>를 넣고 다시 배포(Redeploy)하세요. 내 컴퓨터에서는 <code>.env.local</code>에 넣고 <code>npm run dev</code>를 다시 시작하세요.</p>'); return; }
  setBusy(true,'API 연결을 확인하고 있어요…');
  try{
    const { text } = await callResponses({
      instructions:'연결 확인용 요청이에요. 한국어로 아주 짧게 답하세요.',
      input:'연결 확인: “연결됐어요”라고만 답해 주세요.',
      max_output_tokens: 2000
    });
    bot(`<p>Responses API 요청에 성공했어요. 모델 <code>${esc(API.model)}</code>의 답: “${esc(text.trim())}”</p>`);
  }catch(e){ handleApiError(e); }
  finally{ setBusy(false); }
}
