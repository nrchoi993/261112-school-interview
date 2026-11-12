/* 공용 상태(S)와 수험표 정보(지원 학교·학과) 도우미 */
import { SCHOOLS } from './data/schools.js';
import { TRACKS } from './data/tracks.js';
import { saveRemote } from './student/auth.js';

export function curSchool(){ const i=S.profile.schoolIdx; return (i!==''&&i!=='custom')?SCHOOLS[+i]:null; }

/* =========================================================
   2. 상태
   ========================================================= */
export const DEFAULT_PROFILE = {schoolIdx:'', custom:'', track:'it', dept:'', type:'특별', trackManual:false};
export const S = {
  profile:{...DEFAULT_PROFILE},
  cur:null, awaiting:false, mode:'free', queue:[], realRes:[], history:[],
  answered:new Set(), timerId:null, tLeft:90, over:false, lastFollow:null,
  convo:[], busy:false, abort:null, typingEl:null   // convo: Responses API input으로 보낼 대화 기록
};
try{const p=JSON.parse(localStorage.getItem('hsInterviewProfile3')||'null'); if(p) Object.assign(S.profile,p);}catch(e){}
export function saveProfile(){
  try{localStorage.setItem('hsInterviewProfile3',JSON.stringify(S.profile));}catch(e){}
  saveRemote();                                       // 로그인한 학생이면 서버에도 저장(잠깐 모았다가 한 번에)
}

export function schoolName(){
  if(S.profile.schoolIdx==='custom') return S.profile.custom.trim();
  if(S.profile.schoolIdx==='') return '';
  return SCHOOLS[+S.profile.schoolIdx]?.n||'';
}
export function trackName(){return TRACKS[S.profile.track].name}
export function fill(t){
  return t.replace('{school}', schoolName()||'우리 학교').replace('{dept}', S.profile.dept.trim()||'지원 학과');
}
