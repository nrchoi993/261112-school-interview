/* 서버 함수(/api/ai) 호출, 오류 설명, AI 연결 상태 표시 */
import { bot } from '../chat/chat.js';
import { $, esc } from '../lib/dom.js';
import { S } from '../state.js';
import { AUTH } from '../student/auth.js';
import { ADMIN, TEACHER } from '../teacher/auth.js';

/* =========================================================
   0. OpenAI Responses API (서버 함수를 거쳐 호출)
   - 브라우저 → POST /api/ai (이 사이트의 Vercel 서버 함수) → POST https://api.openai.com/v1/responses
   - API 키는 Vercel 환경 변수 OPENAI_API_KEY에만 있어요. 브라우저 코드에는 키가 없어요.
   - 서버 함수는 로그인한 학생·교사의 요청만 받아요(요청 헤더 X-Session).
   ========================================================= */
export const API = {
  key: false,                                  // 서버에 키가 있는지(true/false)만 알아요. /api/health로 확인
  model: 'gpt-6.1-terra',
  endpoint: '/api/ai', upstream: 'https://api.openai.com/v1/responses',
  status: 'nokey', err: null, keyHint: '',
  srv: null,                                   // /api/health 응답: 저장소·음성 기능 상태
  lastReq: null, lastRes: null, lastAt: null, lastMs: null, usage: null
};
export async function loadHealth(){
  try{
    const r = await fetch('/api/health', { cache:'no-store' });
    const j = await r.json();
    if(!j || !j.ok) throw new Error('bad');
    API.srv = j; API.key = !!j.ai; API.model = j.model || API.model;
  }catch(e){
    API.srv = { storage:'none', ai:false, tts:{enabled:false}, stt:{enabled:false}, offline:true };   // 정적 파일만 열었거나 서버 함수가 없을 때
    API.key = false;
  }
  API.status = API.key ? 'unverified' : 'nokey';  // 키가 있어도 실제 요청 전에는 '연결 미확인'
}
export function sessionToken(){ return (AUTH.student && AUTH.student.token) || TEACHER.token || ''; }

export const API_LABEL = {nokey:'키 미설정', unverified:'연결 미확인', pending:'요청 중', ok:'요청 성공', error:'요청 실패'};
export const ERR_LABEL = {auth:'키 오류', forbidden:'권한 없음', model:'모델 오류', quota:'크레딧·한도 부족', rate:'요청 과다',
  bad:'요청 형식 오류', server:'서버 오류', network:'네트워크 오류', incomplete:'응답 잘림', refusal:'응답 거부',
  failed:'응답 생성 실패', empty:'빈 응답', parse:'응답 해석 실패', http:'HTTP 오류', nokey:'키 미설정'};

export class ApiError extends Error{
  constructor(kind, message, raw){ super(message); this.kind=kind; this.raw=raw||''; }
}

/* HTTP 상태·오류 코드를 학생이 이해하기 쉬운 문장으로 바꿔요 (OpenAI Error codes 문서 기준) */
export function explainHttp(st, err){
  const code=String(err?.code||''), type=String(err?.type||''), raw=err?.message||'';
  if(code==='model_not_found' || st===404)
    return new ApiError('model',`모델 '${API.model}'을 찾을 수 없거나 이 프로젝트에서 쓸 수 없어요. Vercel 환경 변수 OPENAI_MODEL 값과 프로젝트의 모델 권한을 확인하세요.`,raw);
  if(code==='session') return new ApiError('session','로그인이 끝났어요. 새로고침한 뒤 다시 로그인하세요.',raw);
  if(code==='nokey') return new ApiError('nokey','서버에 OpenAI API 키가 없어요. Vercel → Settings → Environment Variables에 OPENAI_API_KEY를 넣고 다시 배포(Redeploy)하세요.',raw);
  if(code==='rate_local') return new ApiError('rate',err.message||'요청을 너무 많이 보냈어요.',raw);
  if(code==='upstream_network') return new ApiError('network','Vercel 서버에서 OpenAI에 연결하지 못했어요. 잠시 뒤 다시 시도하세요.',raw);
  if(st===401) return new ApiError('auth','API 키가 올바르지 않거나 비활성화됐어요. Vercel 환경 변수 OPENAI_API_KEY 값을 확인한 뒤 다시 배포(Redeploy)하세요.',raw);
  if(st===403) return new ApiError('forbidden','이 계정·프로젝트 또는 접속 지역에서는 요청이 허용되지 않아요. 프로젝트 권한과 지원 국가를 확인하세요.',raw);
  if(st===429){
    if(/quota|credit|billing|limit_exceeded/.test(code+' '+type))
      return new ApiError('quota','크레딧이나 사용 한도가 부족해요. OpenAI 플랫폼의 Billing·Limits에서 잔액과 한도를 확인하세요. 다시 보내도 해결되지 않아요.',raw);
    return new ApiError('rate','요청을 너무 빨리 보냈어요. 잠시 기다렸다가 다시 보내세요.',raw);
  }
  if(st===400) return new ApiError('bad',`요청 형식이 잘못됐어요${err?.param?` (문제 항목: ${err.param})`:''}. 아래 원문 메시지를 확인하세요.`,raw);
  if(st>=500) return new ApiError('server','OpenAI 서버에 일시적인 문제가 있어요. 잠시 뒤 다시 시도하세요.',raw);
  return new ApiError('http',`요청이 실패했어요 (HTTP ${st}).`,raw);
}

/* Responses API 호출: POST /v1/responses
   응답 텍스트는 output 배열 → type:"message" 항목 → content 중 type:"output_text"의 text를 모아요.
   (output[0]에 텍스트가 있다고 가정하면 안 돼요: 추론(reasoning) 항목이 먼저 올 수 있어요) */
export async function callResponses(body, signal, opts){
  if(!API.key) throw new ApiError('nokey','서버에 OpenAI API 키가 없어요. Vercel 환경 변수 OPENAI_API_KEY를 확인하세요.');
  const req = { model: API.model, store: false, reasoning: { effort: 'low' }, ...body };   // 화면 표시용(실제 값은 서버가 정해요)
  const quiet = opts && opts.quiet;            // 실전 면접 채점처럼 상태 표시를 덜 바꾸고 싶을 때
  API.lastReq = req; API.lastRes = null; API.lastAt = new Date(); API.usage = null; API.lastMs = null;
  const prev = API.status;
  if(!quiet) setApiStatus('pending');
  const t0 = performance.now();
  let res;
  try{
    res = await fetch(API.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session': sessionToken() },
      body: JSON.stringify({ request: body }), signal
    });
  }catch(e){
    if(e.name==='AbortError'){ setApiStatus(prev==='pending'?'unverified':prev, API.err); throw new ApiError('abort','요청을 취소했어요.'); }
    throw new ApiError('network','서버에 연결하지 못했어요. 인터넷 연결, 학교 방화벽, 광고 차단 확장 프로그램을 확인하세요.', e.message);
  }
  let wrap = null;
  try{ wrap = await res.json(); }catch(e){}
  const data = wrap && 'upstream' in wrap ? wrap.upstream : wrap;
  if(wrap && wrap.request) API.lastReq = wrap.request;               // 서버가 실제로 OpenAI에 보낸 요청
  API.lastMs = Math.round(performance.now()-t0);
  API.lastRes = { httpStatus: res.status, body: data };
  if(!res.ok) throw explainHttp(res.status, data && data.error);
  if(!data) throw new ApiError('parse','응답을 JSON으로 읽지 못했어요.');
  if(data.status==='failed') throw new ApiError('failed','모델이 응답을 만들지 못했어요.', data.error?.message);
  if(data.status==='incomplete'){
    const why=data.incomplete_details?.reason;
    throw new ApiError('incomplete', why==='max_output_tokens'
      ? '답변이 최대 길이(max_output_tokens)에 걸려 중간에 끊겼어요. 다시 보내거나 최대 길이를 늘려 보세요.'
      : `답변이 끝까지 만들어지지 않았어요 (이유: ${why||'알 수 없음'}).`);
  }
  const parts = (data.output||[]).filter(it=>it.type==='message').flatMap(it=>it.content||[]);
  const refusal = parts.find(p=>p.type==='refusal');
  if(refusal) throw new ApiError('refusal','모델이 이 요청에 답하지 않았어요.', refusal.refusal);
  const text = parts.filter(p=>p.type==='output_text').map(p=>p.text).join('');
  if(!text.trim()) throw new ApiError('empty','응답은 받았지만 텍스트가 비어 있어요.');
  API.usage = data.usage || null;
  setApiStatus('ok');                          // 실제 요청이 성공했을 때만 '요청 성공'
  return { text, data };
}

export function setApiStatus(st, err){
  API.status = st; API.err = st==='error' ? err : (st==='ok'||st==='unverified' ? null : API.err);
  renderApiPill(); renderApiPanel();
}
export function handleApiError(e){
  if(e.kind==='abort') return;
  if(e.kind==='parse' && API.lastRes && API.lastRes.httpStatus===200){ /* 요청 자체는 성공 */ }
  else setApiStatus('error', e);
  renderApiPanel();
  if(ADMIN.on) bot(`<div class="api-err"><b>AI 요청 실패 · ${esc(ERR_LABEL[e.kind]||'오류')}</b><p>${esc(e.message)}</p>${e.raw?`<p class="time-note">원문 메시지: ${esc(e.raw)}</p>`:''}</div>`);
  else bot('<div class="api-err"><b>AI 답변을 지금 받을 수 없어요</b><p>잠시 뒤 다시 시도해 보세요. 계속 안 되면 선생님께 알려 주세요.</p></div>');   // 학생에게는 기술 정보 숨김
}

export function maskKey(){ return API.key ? (API.keyHint ? `서버에 있음 · ${API.keyHint}` : '서버에 있음') : '없음'; }
export const STORE_LABEL = {redis:'Upstash Redis 연결됨', memory:'메모리(로컬 개발용 · 서버를 끄면 사라짐)', none:'연결 안 됨'};

export function renderApiPill(){
  const el=$('#apiPill'); if(!el) return;
  el.dataset.state = API.status;
  const reason = API.status==='error' && API.err ? (ERR_LABEL[API.err.kind]||'오류') : '';
  el.querySelector('.pill-label').textContent = API_LABEL[API.status] + (reason?` · ${reason}`:'');
  el.title = API.status==='error' && API.err ? API.err.message : `모델: ${API.model}`;
}

export function renderApiPanel(){
  const info=$('#apiInfo'); if(!info) return;
  const st = API_LABEL[API.status] + (API.status==='error'&&API.err?` · ${ERR_LABEL[API.err.kind]||''}`:'');
  const u = API.usage;
  info.innerHTML = `
    <div><dt>상태</dt><dd class="st" data-state="${API.status}">${esc(st)}</dd></div>
    <div><dt>모델</dt><dd><code>${esc(API.model)}</code></dd></div>
    <div><dt>API 키</dt><dd><code>${esc(maskKey())}</code></dd></div>
    <div><dt>엔드포인트</dt><dd><code>POST ${esc(API.endpoint)}</code> → <code>${esc(API.upstream)}</code></dd></div>
    <div><dt>마지막 요청</dt><dd>${API.lastAt?esc(API.lastAt.toLocaleTimeString('ko-KR'))+(API.lastMs!=null?` · ${API.lastMs.toLocaleString()}ms`:''):'아직 없음'}</dd></div>
    <div><dt>토큰 사용량</dt><dd>${u?`입력 ${(u.input_tokens??0).toLocaleString()} · 출력 ${(u.output_tokens??0).toLocaleString()}${u.output_tokens_details?.reasoning_tokens!=null?` (추론 ${u.output_tokens_details.reasoning_tokens.toLocaleString()})`:''}`:'-'}</dd></div>`;
  const err=$('#apiErrBox');
  if(API.status==='error'&&API.err){ err.hidden=false; err.innerHTML=`<b>왜 실패했나요?</b><p>${esc(API.err.message)}</p>${API.err.raw?`<p class="time-note">원문 메시지: ${esc(API.err.raw)}</p>`:''}`; }
  else err.hidden=true;
  $('#apiReq').textContent = API.lastReq
    ? `# 서버 함수가 OpenAI로 보낸 요청\nPOST ${API.upstream}\nContent-Type: application/json\nAuthorization: Bearer (서버의 OPENAI_API_KEY)\n\n` + JSON.stringify(API.lastReq, null, 2)
    : '아직 보낸 요청이 없어요. 위의 ‘연결 확인 요청 보내기’를 누르거나 모의면접에서 답변을 보내 보세요.';
  const si=$('#srvInfo');
  if(si && API.srv){
    const v=API.srv;
    si.innerHTML=`<div><dt>학생 기록 저장소</dt><dd>${esc(STORE_LABEL[v.storage]||v.storage)}</dd></div>
      <div><dt>면접관 음성(TTS)</dt><dd>${v.tts&&v.tts.enabled?`<code>${esc(v.tts.model)}</code> · 여 <code>${esc(v.tts.female)}</code> · 남 <code>${esc(v.tts.male)}</code>`:'브라우저 내장 음성'}</dd></div>
      <div><dt>받아쓰기(STT)</dt><dd>${v.stt&&v.stt.enabled?`<code>${esc(v.stt.model)}</code>`:'브라우저 음성 인식(지원 브라우저만)'}</dd></div>`;
  }
  if(API.lastRes){
    const s=JSON.stringify(API.lastRes.body, null, 2)||'(본문 없음)';
    $('#apiRes').textContent = `HTTP ${API.lastRes.httpStatus}\n\n` + (s.length>12000? s.slice(0,12000)+'\n… (길어서 일부만 표시)' : s);
  }else $('#apiRes').textContent = API.status==='pending' ? '응답을 기다리는 중이에요…' : '아직 받은 응답이 없어요.';
  const tb=$('#apiTestBtn'); if(tb) tb.disabled = !!S.busy || !API.key;
}
