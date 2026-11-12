/* 학생 기록 구조와 정리(검증) 규칙
   저장 키
     stu:<id>        학생 정보 {id, sid, name, salt, hash, temp, createdAt, lastAt, profile, answered, convo, sessions}
     log:<id>        활동 기록 목록(답변·평가, 코치 대화, 실전 면접 결과). 최근 1500개까지
     students        교사 대시보드용 요약 {id → {sid, name, school, dept, count, sum, best, recent, crit, live, chats, lastAt, temp}}
     sess:<token>    학생 로그인 세션 → id (30일)
     tsess:<token>   교사 로그인 세션 → {mustChange} (12시간)
     cfg:teacher     교사 비밀번호 {salt, hash, at}
   id는 '학번|이름' 형태예요. */
import { clean, clip } from './util.js';

export const LOG_KEEP = 1500;

export function makeId(sid, name){
  const s = clean(sid, 12).replace(/\s/g, ''), n = clean(name, 20).replace(/\s/g, '');
  if(!s || !n) return null;
  return `${s}|${n}`;
}

export function publicState(rec){
  return {
    id: rec.id, sid: rec.sid, name: rec.name, temp: !!rec.temp,
    profile: rec.profile || null, answered: rec.answered || [], convo: rec.convo || [],
    createdAt: rec.createdAt, lastAt: rec.lastAt
  };
}

const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : null; };
const strArr = (a, n, len) => Array.isArray(a) ? a.slice(0, n).map(x => clip(x, len)) : [];

export function cleanProfile(p){
  if(!p || typeof p !== 'object') return null;
  return {
    schoolIdx: clip(p.schoolIdx ?? '', 8), custom: clean(p.custom, 40), track: clip(p.track || 'it', 12),
    dept: clean(p.dept, 40), type: p.type === '일반' ? '일반' : '특별', trackManual: !!p.trackManual,
    schoolName: clean(p.schoolName, 40)
  };
}
export function cleanConvo(c){
  return Array.isArray(c) ? c.slice(-30).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: clip(m.content, 4000) })) : [];
}

export function cleanEntry(e){
  if(!e || typeof e !== 'object') return null;
  const at = clip(e.at || new Date().toISOString(), 30);
  if(e.type === 'chat'){
    const text = clip(e.text, 4000).trim();
    if(!text) return null;
    return { type: 'chat', at, role: e.role === 'assistant' ? 'assistant' : 'user', ai: !!e.ai, text };
  }
  if(e.type === 'answer'){
    const d = e.delivery && typeof e.delivery === 'object' ? {
      sec: num(e.delivery.sec, 0, 3600), latency: num(e.delivery.latency, 0, 600), cpm: num(e.delivery.cpm, 0, 2000),
      fillers: num(e.delivery.fillers, 0, 999), voiced: num(e.delivery.voiced, 0, 1), limit: num(e.delivery.limit, 0, 3600),
      stt: clip(e.delivery.stt, 20)
    } : null;
    return {
      type: 'answer', at, mode: e.mode === 'live' ? 'live' : 'chat',
      qid: clip(e.qid, 30), q: clip(e.q, 400), cat: clip(e.cat, 20), follow: !!e.follow,
      answer: clip(e.answer, 4000), total: num(e.total, 0, 100) ?? 0, ai: !!e.ai, over: !!e.over,
      summary: clip(e.summary, 600),
      crit: Array.isArray(e.crit) ? e.crit.slice(0, 6).map(c => ({ name: clip(c.name, 20), score: num(c.score, 0, 20) ?? 0, comment: clip(c.comment, 400) })) : [],
      good: strArr(e.good, 3, 400), fix: strArr(e.fix, 4, 400), improved: clip(e.improved, 1500), flags: strArr(e.flags, 12, 120),
      ...(d ? { delivery: d } : {})
    };
  }
  if(e.type === 'live'){
    return {
      type: 'live', at, count: num(e.count, 0, 50) ?? 0, avg: num(e.avg, 0, 100) ?? 0,
      items: Array.isArray(e.items) ? e.items.slice(0, 20).map(x => ({ q: clip(x.q, 300), total: num(x.total, 0, 100) ?? 0 })) : []
    };
  }
  return null;
}

/* 요약 갱신: 대시보드 목록을 빠르게 그리려고 학생별 합계를 따로 들고 있어요 */
export function emptySummary(rec){
  return { sid: rec.sid, name: rec.name, virtual: !!rec.virtual, school: '', dept: '', count: 0, sum: 0, best: 0, recent: [], crit: {}, live: 0, liveAnswers: 0, chats: 0, lastAt: rec.lastAt || rec.createdAt, createdAt: rec.createdAt, temp: !!rec.temp };
}
export function applyToSummary(sum, entries){
  for(const e of entries){
    if(e.type === 'answer'){
      sum.count++; sum.sum += e.total; sum.best = Math.max(sum.best, e.total);
      sum.recent = [...(sum.recent || []), e.total].slice(-20);
      if(e.mode === 'live') sum.liveAnswers = (sum.liveAnswers || 0) + 1;
      for(const c of e.crit){ const k = c.name; sum.crit[k] = sum.crit[k] || { s: 0, n: 0 }; sum.crit[k].s += c.score; sum.crit[k].n++; }
    }else if(e.type === 'chat' && e.role === 'user') sum.chats++;
    else if(e.type === 'live') sum.live++;
  }
  return sum;
}
