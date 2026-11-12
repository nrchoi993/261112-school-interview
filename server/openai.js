/* OpenAI 설정: API 키는 서버(Vercel 환경 변수)에만 두고 브라우저에는 보내지 않아요. */
export function aiConf(){
  const key = String(process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY || '').trim();   // VITE_는 예전 .env.local 호환용
  return {
    key,
    base: String(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    model: String(process.env.OPENAI_MODEL || process.env.VITE_OPENAI_MODEL || '').trim() || 'gpt-6.1-terra',
    ttsModel: String(process.env.OPENAI_TTS_MODEL || '').trim() || 'gpt-4o-mini-tts',
    voiceFemale: String(process.env.OPENAI_TTS_VOICE_FEMALE || '').trim() || 'marin',
    voiceMale: String(process.env.OPENAI_TTS_VOICE_MALE || '').trim() || 'cedar',
    sttModel: String(process.env.OPENAI_STT_MODEL || '').trim() || 'gpt-transcribe',
    ttsOff: /^(1|true|yes)$/i.test(String(process.env.OPENAI_TTS_DISABLED || '')),
  };
}
