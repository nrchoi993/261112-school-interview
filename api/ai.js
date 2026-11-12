/* POST /api/ai : 브라우저 대신 서버가 OpenAI Responses API(POST /v1/responses)를 호출해요.
   - 브라우저는 instructions·input·text·max_output_tokens만 보내고, 모델·키는 서버가 정해요.
   - 로그인한 학생·교사만 쓸 수 있고, 한 사람당 1시간에 150번까지예요. */
import { handler, send, fail, readJson, requireSession, rateLimit } from '../server/util.js';
import { aiConf } from '../server/openai.js';

export default handler(async (req, res) => {
  const c = aiConf();
  if(!c.key) return fail(res, 503, 'nokey', '서버에 OpenAI API 키(OPENAI_API_KEY)가 설정되지 않았어요.');
  const who = await requireSession(req);
  if(!who) return fail(res, 401, 'session', '로그인이 필요해요. 다시 로그인해 주세요.');
  if(!(await rateLimit('ai:' + who.id, 150, 3600))) return fail(res, 429, 'rate_local', 'AI 요청을 너무 많이 보냈어요. 잠시 뒤 다시 시도하세요.');

  const b = (await readJson(req)).request || {};
  const request = {
    model: c.model,
    store: false,
    reasoning: { effort: 'low' },
    instructions: String(b.instructions || '').slice(0, 20000),
    input: Array.isArray(b.input)
      ? b.input.slice(-30).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 6000) }))
      : String(b.input || '').slice(0, 6000),
    max_output_tokens: Math.min(8000, Math.max(16, Number(b.max_output_tokens) || 2000))
  };
  if(b.text && b.text.format) request.text = { format: b.text.format };

  const t0 = Date.now();
  let r;
  try{
    r = await fetch(c.base + '/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.key}` },
      body: JSON.stringify(request)
    });
  }catch(e){
    return fail(res, 502, 'upstream_network', 'Vercel 서버에서 OpenAI에 연결하지 못했어요.', { raw: e.message, request });
  }
  const body = await r.json().catch(() => null);
  // OpenAI의 HTTP 상태를 그대로 돌려줘서 브라우저가 같은 방식으로 오류를 설명하게 해요.
  send(res, r.status, { ok: r.ok, upstream: body, request, ms: Date.now() - t0 });
});
