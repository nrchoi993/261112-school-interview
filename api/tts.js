/* POST /api/tts : 면접관 목소리 만들기 (OpenAI POST /v1/audio/speech)
   body: { text, voice: 'female' | 'male' }  →  audio/mpeg
   낮고 차분한 목소리는 gpt-4o-mini-tts의 instructions로 정해요. */
import { handler, fail, readJson, requireSession, rateLimit } from '../server/util.js';
import { aiConf } from '../server/openai.js';

const STYLE = {
  female: '서울 특성화고 입학 면접의 여성 면접관이에요. 평소보다 낮고 차분한 중저음 목소리로, 또박또박 조금 천천히, 정중하고 따뜻하게 말해요. 표준 한국어 억양을 써요.',
  male: '서울 특성화고 입학 면접의 남성 면접관이에요. 낮고 안정적인 중저음 목소리로, 또박또박 조금 천천히, 정중하고 차분하게 말해요. 표준 한국어 억양을 써요.'
};

export default handler(async (req, res) => {
  const c = aiConf();
  if(!c.key || c.ttsOff) return fail(res, 503, 'nokey', '서버 음성 합성을 쓸 수 없어요.');
  const who = await requireSession(req);
  if(!who) return fail(res, 401, 'session', '로그인이 필요해요.');
  if(!(await rateLimit('tts:' + who.id, 300, 3600))) return fail(res, 429, 'rate_local', '음성 요청을 너무 많이 보냈어요.');

  const b = await readJson(req);
  const text = String(b.text || '').trim().slice(0, 600);
  if(!text) return fail(res, 400, 'empty', '읽을 문장이 없어요.');
  const gender = b.voice === 'male' ? 'male' : 'female';
  const payload = {
    model: c.ttsModel,
    voice: gender === 'male' ? c.voiceMale : c.voiceFemale,
    input: text,
    response_format: 'mp3'
  };
  if(!/^tts-1/.test(c.ttsModel)) payload.instructions = STYLE[gender];   // tts-1·tts-1-hd는 instructions를 받지 않아요

  let r;
  try{
    r = await fetch(c.base + '/audio/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.key}` },
      body: JSON.stringify(payload)
    });
  }catch(e){ return fail(res, 502, 'upstream_network', 'OpenAI에 연결하지 못했어요.', { raw: e.message }); }
  if(!r.ok){
    const j = await r.json().catch(() => null);
    return fail(res, r.status, 'upstream', (j && j.error && j.error.message) || `음성 합성 실패 (HTTP ${r.status})`);
  }
  const buf = Buffer.from(await r.arrayBuffer());
  res.statusCode = 200;
  res.setHeader('Content-Type', r.headers.get('content-type') || 'audio/mpeg');
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.end(buf);
});
