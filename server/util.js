/* 서버 함수 공통 도구: 요청 읽기, 응답 보내기, 비밀번호 해시, 세션 확인, 요청 횟수 제한 */
import { scryptSync, randomBytes, timingSafeEqual, randomInt } from 'node:crypto';
import { db, storeMode } from './store.js';

/* Vercel은 JSON 본문을 req.body로 미리 읽어 두고, 로컬 개발 서버는 읽지 않아요. 둘 다 처리해요. */
export async function readJson(req, limit = 4_000_000){
  if(req.body !== undefined && req.body !== null){
    if(typeof req.body === 'string') return JSON.parse(req.body || '{}');
    if(Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString('utf8') || '{}');
    return req.body;
  }
  const chunks = []; let size = 0;
  for await (const c of req){
    size += c.length;
    if(size > limit) throw Object.assign(new Error('요청이 너무 커요.'), { status:413 });
    chunks.push(c);
  }
  const s = Buffer.concat(chunks).toString('utf8');
  return s ? JSON.parse(s) : {};
}

export function send(res, status, obj){
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}
export function fail(res, status, code, message, extra){
  send(res, status, { ok:false, error:{ code, message, ...(extra||{}) } });
}

/* 요청 처리 틀: 메서드 확인 + 예외를 JSON 오류로 바꿔요 */
export function handler(fn, { methods = ['POST'] } = {}){
  return async (req, res) => {
    try{
      if(!methods.includes(req.method)){ res.setHeader('Allow', methods.join(', ')); return fail(res, 405, 'method', '허용되지 않은 요청 방식이에요.'); }
      await fn(req, res);
    }catch(e){
      if(e && e.code === 'nostore') return fail(res, 503, 'nostore', '저장소(Upstash Redis)가 연결되지 않았어요. Vercel 프로젝트의 Storage에서 Upstash Redis를 연결해 주세요.');
      if(e instanceof SyntaxError) return fail(res, 400, 'badjson', '요청 본문(JSON)을 읽지 못했어요.');
      console.error(e);
      fail(res, e && e.status || 500, 'server', (e && e.message) || '서버 오류가 났어요.');
    }
  };
}

/* ---------- 비밀번호 (솔트 + scrypt) ---------- */
export function hashPw(pw, salt = randomBytes(16).toString('hex')){
  return { salt, hash: scryptSync(String(pw), salt, 32).toString('hex') };
}
export function checkPw(pw, rec){
  if(!rec || !rec.salt || !rec.hash) return false;
  const a = Buffer.from(scryptSync(String(pw), rec.salt, 32).toString('hex'));
  const b = Buffer.from(rec.hash);
  return a.length === b.length && timingSafeEqual(a, b);
}
export const newToken = () => randomBytes(24).toString('base64url');
export const tempPin = () => String(randomInt(0, 10000)).padStart(4, '0');

/* ---------- 문자열 정리 ---------- */
export const clip = (s, n) => String(s ?? '').slice(0, n);
export const clean = (s, n) => clip(String(s ?? '').replace(/\s+/g, ' ').trim(), n);

/* ---------- 세션 ---------- */
export const STU_SESSION_SEC = 60 * 60 * 24 * 30;   // 학생: 30일 동안 자동 로그인
export const TCH_SESSION_SEC = 60 * 60 * 12;        // 교사: 12시간

export async function studentFromToken(token){
  if(!token || typeof token !== 'string' || token.length > 80) return null;
  const id = await db.get('sess:' + token);
  return id || null;
}
export async function teacherFromToken(token){
  if(!token || typeof token !== 'string' || token.length > 80) return null;
  return await db.getJSON('tsess:' + token);   // { mustChange }
}

/* AI·음성 요청은 로그인한 학생이나 교사만 쓸 수 있어요(아무나 내 API 크레딧을 쓰지 못하게).
   저장소가 없는 로컬 개발(메모리 모드도 아님)일 때만 예외예요. */
export async function requireSession(req){
  const token = String(req.headers['x-session'] || '');
  if(storeMode() === 'none') return null;   // 배포 환경인데 저장소가 없으면 아래에서 막아요
  const sid = await studentFromToken(token);
  if(sid) return { who:'student', id:sid, token };
  const t = await teacherFromToken(token);
  if(t && !t.mustChange) return { who:'teacher', id:'teacher', token };
  return null;
}

/* 고정 창(window) 방식의 간단한 요청 횟수 제한 */
export async function rateLimit(key, max, windowSec){
  const n = await db.incr('rl:' + key, windowSec);
  return n <= max;
}
