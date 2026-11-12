/* POST /api/student : 학생 로그인·기록 저장
   action
     login     {sid, name, pw}          → 처음이면 {code:'new'}, 맞으면 {token, state, logs}
     register  {sid, name, pw}          → 새 학생 만들기
     me        {token}                  → 같은 브라우저 자동 로그인
     save      {token, profile?, answered?, convo?}
     log       {token, entries:[...]}   → 활동 기록 추가(답변·평가, 대화, 실전 면접)
     changepw  {token, cur?, pw}        → 임시 비밀번호(교사 초기화)일 때는 cur 없이 바꿀 수 있어요
     logout    {token} */
import { handler, send, fail, readJson, hashPw, checkPw, newToken, clean, studentFromToken, rateLimit, STU_SESSION_SEC } from '../server/util.js';
import { db } from '../server/store.js';
import { makeId, publicState, cleanProfile, cleanConvo, cleanEntry, emptySummary, applyToSummary, LOG_KEEP } from '../server/records.js';

const MAX_FAILS = 10, LOCK_SEC = 300;
const pwOk = pw => typeof pw === 'string' && pw.length >= 4 && pw.length <= 32 && !/\s/.test(pw);
const ip = req => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();

async function openSession(rec){
  const token = newToken();
  rec.sessions = [...(rec.sessions || []), token].slice(-10);
  rec.lastAt = new Date().toISOString();
  await db.set('sess:' + token, rec.id, STU_SESSION_SEC);
  await db.setJSON('stu:' + rec.id, rec);
  return token;
}
async function touchSummary(rec, patch){
  const sum = (await db.hgetJSON('students', rec.id)) || emptySummary(rec);
  Object.assign(sum, { sid: rec.sid, name: rec.name, temp: !!rec.temp, lastAt: rec.lastAt || sum.lastAt }, patch || {});
  await db.hsetJSON('students', rec.id, sum);
  return sum;
}
async function loadAll(rec){
  return { state: publicState(rec), logs: await db.lrangeJSON('log:' + rec.id, -400, -1) };
}

export default handler(async (req, res) => {
  const b = await readJson(req);
  const action = String(b.action || '');

  if(action === 'login' || action === 'register'){
    const sid = clean(b.sid, 12).replace(/\s/g, ''), name = clean(b.name, 20).replace(/\s/g, '');
    const id = makeId(sid, name);
    if(!id) return fail(res, 400, 'input', '학번과 이름을 모두 적어 주세요.');
    if(!pwOk(b.pw)) return fail(res, 400, 'pwrule', '비밀번호는 공백 없이 4~32자로 정해 주세요.');
    const lockKey = 'lf:' + id;
    const fails = Number(await db.get('rl:' + lockKey) || 0);
    if(fails >= MAX_FAILS){
      const t = await db.ttl('rl:' + lockKey);
      return fail(res, 429, 'locked', `비밀번호를 여러 번 틀렸어요. ${Math.max(1, Math.ceil(t / 60))}분 뒤에 다시 시도하거나 선생님께 비밀번호 초기화를 부탁하세요.`);
    }
    const rec = await db.getJSON('stu:' + id);

    if(action === 'login'){
      if(!rec) return send(res, 200, { ok: false, code: 'new', message: '처음 들어오는 학생이에요.' });
      if(!checkPw(b.pw, rec)){
        const n = await db.incr('rl:' + lockKey, LOCK_SEC);
        return fail(res, 401, 'badpw', `비밀번호가 맞지 않아요. (${n}/${MAX_FAILS})`, { left: Math.max(0, MAX_FAILS - n) });
      }
      await db.del('rl:' + lockKey);
      const token = await openSession(rec);
      await touchSummary(rec);
      return send(res, 200, { ok: true, token, ...(await loadAll(rec)) });
    }

    // register
    if(rec) return fail(res, 409, 'exists', '이미 있는 학생이에요. 비밀번호를 입력해 로그인하세요.');
    if(!(await rateLimit('reg:' + ip(req), 60, 3600))) return fail(res, 429, 'rate_local', '새 계정을 너무 많이 만들었어요. 잠시 뒤 다시 시도하세요.');
    const now = new Date().toISOString();
    const nrec = { id, sid, name, ...hashPw(b.pw), temp: false, createdAt: now, lastAt: now,
      profile: cleanProfile(b.profile), answered: [], convo: [], sessions: [] };
    const token = await openSession(nrec);
    await db.hsetJSON('students', id, { ...emptySummary(nrec), school: nrec.profile?.schoolName || '', dept: nrec.profile?.dept || '' });
    return send(res, 200, { ok: true, token, created: true, ...(await loadAll(nrec)) });
  }

  // ---------- 아래는 로그인이 필요해요 ----------
  const id = await studentFromToken(b.token);
  if(!id) return fail(res, 401, 'session', '로그인이 끝났어요. 다시 로그인해 주세요.');
  const rec = await db.getJSON('stu:' + id);
  if(!rec){ await db.del('sess:' + b.token); return fail(res, 401, 'session', '학생 정보를 찾을 수 없어요. 다시 로그인해 주세요.'); }

  if(action === 'me'){
    rec.lastAt = new Date().toISOString();
    await db.setJSON('stu:' + id, rec);
    await touchSummary(rec);
    return send(res, 200, { ok: true, ...(await loadAll(rec)) });
  }

  if(action === 'save'){
    if(b.profile) rec.profile = cleanProfile(b.profile);
    if(Array.isArray(b.answered)) rec.answered = b.answered.slice(-400).map(x => String(x).slice(0, 30));
    if(Array.isArray(b.convo)) rec.convo = cleanConvo(b.convo);
    rec.lastAt = new Date().toISOString();
    await db.setJSON('stu:' + id, rec);
    if(b.profile) await touchSummary(rec, { school: rec.profile?.schoolName || '', dept: rec.profile?.dept || '' });
    return send(res, 200, { ok: true });
  }

  if(action === 'log'){
    const entries = (Array.isArray(b.entries) ? b.entries.slice(0, 30) : []).map(cleanEntry).filter(Boolean);
    if(!entries.length) return send(res, 200, { ok: true, added: 0 });
    await db.rpushJSON('log:' + id, entries, LOG_KEEP);
    rec.lastAt = new Date().toISOString();
    const sum = (await db.hgetJSON('students', id)) || emptySummary(rec);
    applyToSummary(sum, entries);
    sum.lastAt = rec.lastAt;
    await db.hsetJSON('students', id, sum);
    await db.setJSON('stu:' + id, rec);
    return send(res, 200, { ok: true, added: entries.length });
  }

  if(action === 'changepw'){
    if(!rec.temp && !checkPw(b.cur, rec)) return fail(res, 401, 'badpw', '지금 비밀번호가 맞지 않아요.');
    if(!pwOk(b.pw)) return fail(res, 400, 'pwrule', '비밀번호는 공백 없이 4~32자로 정해 주세요.');
    Object.assign(rec, hashPw(b.pw), { temp: false, pwAt: new Date().toISOString() });
    await db.setJSON('stu:' + id, rec);
    await touchSummary(rec, { temp: false });
    return send(res, 200, { ok: true });
  }

  if(action === 'logout'){
    rec.sessions = (rec.sessions || []).filter(t => t !== b.token);
    await db.setJSON('stu:' + id, rec);
    await db.del('sess:' + b.token);
    return send(res, 200, { ok: true });
  }

  fail(res, 400, 'action', '알 수 없는 요청이에요.');
});
