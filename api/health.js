/* GET /api/health : 저장소·AI 연결 상태 (키 값은 절대 보내지 않아요) */
import { handler, send } from '../server/util.js';
import { storeMode } from '../server/store.js';
import { aiConf } from '../server/openai.js';

export default handler(async (req, res) => {
  const c = aiConf();
  send(res, 200, {
    ok: true,
    storage: storeMode(),                 // redis | memory(로컬 개발) | none(배포됐지만 저장소 미연결)
    ai: !!c.key,
    model: c.model,
    tts: { enabled: !!c.key && !c.ttsOff, model: c.ttsModel, female: c.voiceFemale, male: c.voiceMale },
    stt: { enabled: !!c.key, model: c.sttModel },
    teacherPwFromEnv: !!process.env.TEACHER_PASSWORD
  });
}, { methods: ['GET'] });
