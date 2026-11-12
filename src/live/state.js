/* 실전 면접: 상태(LIVE)와 안내 문구·버튼 표시 */
import { API, sessionToken } from '../ai/api.js';
import { $, esc } from '../lib/dom.js';
import { IV_NAME } from './interviewers.js';

/* ---------- 상태 ---------- */
export const LIVE={
  state:'idle', qs:[], idx:0, main:0, results:[], cur:null, abort:false,
  ctx:null, src:null, stream:null, micAn:null, micBuf:null, meterRaf:0, noise:0.01,
  vRec:null, aRec:null, vChunks:[], aChunks:[], t0:0, tick:null, limit:90,
  voiced:0, firstAt:null, lastT:0, sr:null, srText:'', ttsCache:new Map(), ttsFails:0, urls:[]
};
export const FILLER_RE=/(^|[\s,.!?…~])(음+|으음+|어+|으+|아+|에+|저기|뭐지|뭐랄까|그니까)(?=[\s,.!?…~]|$)/g;
export function countFillers(t){ return (String(t).match(FILLER_RE)||[]).length; }
export const voiceFor=i=>{ const m=$('#lvVoice').value; return m==='alt'?(i%2===0?'female':'male'):m; };
export function liveStatus(t, sub){ $('#liveStatus').innerHTML=`${esc(t)}${sub?`<small>${esc(sub)}</small>`:''}`; }
export function liveSub(text, voice, dim){
  const el=$('#liveSub'), show=$('#lvSub').value==='on';
  el.classList.toggle('dim', !!dim || !show);
  if(dim) el.textContent=text;
  else if(!show) el.innerHTML=`<span class="who-says">${esc(IV_NAME[voice]||'')}</span>(자막 꺼짐) 귀 기울여 들어 보세요.`;
  else el.innerHTML=`<span class="who-says">${esc(IV_NAME[voice]||'')}</span>${esc(text)}`;
}
export function liveButtons(main, side){
  const m=$('#liveMain'), s=$('#liveSide');
  m.hidden=!main; if(main){ m.textContent=main.label; m.className='btn lg'+(main.rec?' rec':''); m.disabled=!!main.disabled; m.onclick=main.fn; }
  s.hidden=!side; if(side){ s.textContent=side.label; s.onclick=side.fn; }
}
export function renderLiveEnv(){
  const v=API.srv||{}, logged=!!sessionToken();
  const tts = v.tts&&v.tts.enabled&&logged ? 'AI 음성' : '브라우저 기본 음성';
  const SRok=!!(window.SpeechRecognition||window.webkitSpeechRecognition);
  const stt = v.stt&&v.stt.enabled&&logged ? 'AI 받아쓰기' : SRok ? '브라우저 음성 인식' : '직접 입력';
  const score = API.key&&logged ? 'AI 면접관' : '기본(규칙) 평가';
  $('#liveEnvNote').textContent=`지금 설정: 면접관 목소리 ${tts} · 받아쓰기 ${stt} · 채점 ${score}.`;
}
