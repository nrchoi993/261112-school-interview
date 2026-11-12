/* POST /api/stt : 녹음한 답변 받아쓰기 (OpenAI POST /v1/audio/transcriptions)
   body: { audio: base64, mime, question }  →  { text }
   영상은 서버로 보내지 않고, 소리(오디오)만 짧게 보내요. Vercel 요청 크기 한도(4.5MB) 안에서 쓰도록 브라우저가 3.2MB까지만 보내요. */
import { handler, send, fail, readJson, requireSession, rateLimit } from '../server/util.js';
import { aiConf } from '../server/openai.js';

const EXT = { 'audio/webm':'webm', 'video/webm':'webm', 'audio/ogg':'ogg', 'audio/mp4':'mp4', 'video/mp4':'mp4', 'audio/mpeg':'mp3', 'audio/wav':'wav', 'audio/x-m4a':'m4a', 'audio/aac':'m4a' };

export default handler(async (req, res) => {
  const c = aiConf();
  if(!c.key) return fail(res, 503, 'nokey', '서버 받아쓰기를 쓸 수 없어요.');
  const who = await requireSession(req);
  if(!who) return fail(res, 401, 'session', '로그인이 필요해요.');
  if(!(await rateLimit('stt:' + who.id, 80, 3600))) return fail(res, 429, 'rate_local', '받아쓰기 요청을 너무 많이 보냈어요.');

  const b = await readJson(req, 4_600_000);
  const audio = Buffer.from(String(b.audio || ''), 'base64');
  if(audio.length < 500) return fail(res, 400, 'empty', '녹음된 소리가 없어요.');
  const mime = String(b.mime || 'audio/webm').split(';')[0].trim().toLowerCase();
  const ext = EXT[mime] || 'webm';

  const fd = new FormData();
  fd.append('file', new Blob([audio], { type: mime }), 'answer.' + ext);
  fd.append('model', c.sttModel);
  if(/^gpt-transcribe/.test(c.sttModel)) fd.append('languages[]', 'ko');   // 최신 모델은 languages 배열
  else fd.append('language', 'ko');                                         // 예전 모델(gpt-4o-transcribe, whisper-1)
  const q = String(b.question || '').slice(0, 300);
  fd.append('prompt', `중학교 3학년 학생이 특성화고 입학 면접 질문에 한국어로 답한 녹음이에요. 질문: "${q}" 학생이 말한 그대로 적고, "음", "어" 같은 머뭇거림도 빼지 말고 적어 주세요. 문장 부호를 넣어 주세요.`);

  let r;
  try{
    r = await fetch(c.base + '/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${c.key}` }, body: fd });
  }catch(e){ return fail(res, 502, 'upstream_network', 'OpenAI에 연결하지 못했어요.', { raw: e.message }); }
  const j = await r.json().catch(() => null);
  if(!r.ok) return fail(res, r.status, 'upstream', (j && j.error && j.error.message) || `받아쓰기 실패 (HTTP ${r.status})`);
  send(res, 200, { ok: true, text: String((j && j.text) || '').trim(), model: c.sttModel });
});
