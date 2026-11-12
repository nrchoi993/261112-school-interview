/* POST /api/teacher : 교사 로그인·학생 대시보드
   action
     login     {pw}                 → {token, mustChange}
     check     {token}
     changepw  {token, cur, pw}
     logout    {token}
     list      {token}              → 학생 요약 목록
     detail    {token, id}          → 학생 정보 + 활동 기록 전체
     resetpw   {token, id}          → 4자리 임시 비밀번호 발급(학생은 다음 로그인 때 새 비밀번호를 정해요)
     delete    {token, id}          → 학생 기록 삭제
   교사 비밀번호
     - 처음에는 Vercel 환경 변수 TEACHER_PASSWORD, 없으면 00000000이에요.
     - 00000000으로 들어오면 새 비밀번호를 정하기 전에는 대시보드를 볼 수 없어요.
     - 바꾼 비밀번호는 서버 저장소에 해시로 저장돼서 어느 기기에서나 같아요. */
import { handler, send, fail, readJson, hashPw, checkPw, newToken, tempPin, teacherFromToken, TCH_SESSION_SEC } from '../server/util.js';
import { db, storeMode } from '../server/store.js';
import { aiConf } from '../server/openai.js';
import { emptySummary } from '../server/records.js';

const DEFAULT_PW = '00000000';
const pwOk = pw => typeof pw === 'string' && pw.length >= 6 && pw.length <= 40 && !/\s/.test(pw);

async function stored(){ return await db.getJSON('cfg:teacher'); }
async function verify(pw){
  const st = await stored();
  if(st) return { ok: checkPw(pw, st), mustChange: false };
  const init = process.env.TEACHER_PASSWORD || DEFAULT_PW;
  return { ok: String(pw) === init, mustChange: !process.env.TEACHER_PASSWORD };
}

export default handler(async (req, res) => {
  const b = await readJson(req);
  const action = String(b.action || '');

  if(action === 'login'){
    const fails = Number(await db.get('rl:tfail') || 0);
    if(fails >= 8){
      const t = await db.ttl('rl:tfail');
      return fail(res, 429, 'locked', `비밀번호를 여러 번 틀렸어요. ${Math.max(1, t)}초 뒤에 다시 입력하세요.`);
    }
    const v = await verify(b.pw);
    if(!v.ok){
      const n = await db.incr('rl:tfail', 120);
      return fail(res, 401, 'badpw', `비밀번호가 맞지 않아요. (${n}/8)`);
    }
    await db.del('rl:tfail');
    const token = newToken();
    await db.setJSON('tsess:' + token, { mustChange: v.mustChange, at: new Date().toISOString() }, TCH_SESSION_SEC);
    return send(res, 200, { ok: true, token, mustChange: v.mustChange });
  }

  const t = await teacherFromToken(b.token);
  if(!t) return fail(res, 401, 'session', '교사 로그인이 끝났어요. 다시 로그인해 주세요.');

  if(action === 'check') return send(res, 200, { ok: true, mustChange: !!t.mustChange });

  if(action === 'changepw'){
    const v = await verify(b.cur);
    if(!v.ok) return fail(res, 401, 'badpw', '지금 비밀번호가 맞지 않아요.');
    if(!pwOk(b.pw)) return fail(res, 400, 'pwrule', '새 비밀번호는 공백 없이 6~40자로 정해 주세요.');
    if(b.pw === DEFAULT_PW) return fail(res, 400, 'pwrule', '기본 비밀번호와 다른 비밀번호로 정해 주세요.');
    await db.setJSON('cfg:teacher', { ...hashPw(b.pw), at: new Date().toISOString() });
    await db.setJSON('tsess:' + b.token, { mustChange: false, at: new Date().toISOString() }, TCH_SESSION_SEC);
    return send(res, 200, { ok: true });
  }

  if(action === 'logout'){ await db.del('tsess:' + b.token); return send(res, 200, { ok: true }); }

  if(t.mustChange) return fail(res, 403, 'mustchange', '기본 비밀번호를 먼저 바꿔 주세요.');

  if(action === 'list'){
    const all = await db.hgetallJSON('students');
    const students = Object.entries(all).filter(([, v]) => v).map(([id, v]) => ({ id, ...v }));
    const st = await stored();
    const c = aiConf();
    return send(res, 200, { ok: true, students, storage: storeMode(), pwChangedAt: st?.at || null,
      keyHint: c.key ? `${c.key.slice(0, 7)}…${c.key.slice(-4)} (${c.key.length}자)` : '' });
  }

  const id = String(b.id || '');
  if(!id) return fail(res, 400, 'input', '학생을 골라 주세요.');
  const rec = await db.getJSON('stu:' + id);

  if(action === 'detail'){
    if(!rec) return fail(res, 404, 'nostudent', '학생 정보를 찾을 수 없어요.');
    const logs = await db.lrangeJSON('log:' + id, 0, -1);
    const summary = (await db.hgetJSON('students', id)) || emptySummary(rec);
    const { salt, hash, sessions, ...pub } = rec;
    return send(res, 200, { ok: true, student: { ...pub, sessionCount: (sessions || []).length }, summary, logs });
  }

  if(action === 'resetpw'){
    if(!rec) return fail(res, 404, 'nostudent', '학생 정보를 찾을 수 없어요.');
    const pin = tempPin();
    for(const s of rec.sessions || []) await db.del('sess:' + s);   // 다른 기기의 로그인도 모두 끝내요
    Object.assign(rec, hashPw(pin), { temp: true, sessions: [], resetAt: new Date().toISOString() });
    await db.setJSON('stu:' + id, rec);
    await db.del('rl:lf:' + id);                                     // 잠금도 풀어요
    const sum = (await db.hgetJSON('students', id)) || emptySummary(rec);
    sum.temp = true; await db.hsetJSON('students', id, sum);
    return send(res, 200, { ok: true, temp: pin });
  }

  if(action === 'delete'){
    if(rec) for(const s of rec.sessions || []) await db.del('sess:' + s);
    await db.del('stu:' + id, 'log:' + id, 'rl:lf:' + id);
    await db.hdel('students', id);
    return send(res, 200, { ok: true });
  }

  fail(res, 400, 'action', '알 수 없는 요청이에요.');
});
