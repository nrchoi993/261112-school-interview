/* 실전 면접: 면접관 목소리(서버 TTS → 브라우저 음성)
   휴대폰에서 소리가 '통화'로 잡혀 안 들리던 문제를 막으려고 이렇게 해요.
   - 면접관 목소리는 Web Audio가 아니라 하나의 <audio> 재생기(PLAYER)로 틀어요. 미디어 볼륨으로 나오고,
     iPhone 무음 스위치가 켜져 있어도 들려요.
   - 재생기는 '면접 시작'을 누른 순간 소리 없는 파일로 한 번 틀어서 열어 둬요(자동 재생 제한 풀기).
   - 마이크는 학생이 답하는 동안에만 켜요(media.js). 마이크가 켜져 있으면 휴대폰이 통화 모드로 바뀌기 때문이에요.
   - iPhone(Safari 17 이상)은 navigator.audioSession으로 '재생 모드'와 '녹음 모드'를 직접 바꿔요.
   - 입 모양·빛 움직임은 받은 음성 파일의 소리 크기를 미리 계산해 재생 위치에 맞춰 보여 줘요. */
import { API, sessionToken } from '../ai/api.js';
import { setMouth, setSpeaking } from './interviewers.js';
import { LIVE, liveSub } from './state.js';

/* ---------- 짧은 소리 파일 만들기 (무음, 삐 소리) ---------- */
function wavURL(seconds, freq, vol){
  const rate=22050, n=Math.round(rate*seconds), buf=new ArrayBuffer(44+n*2), v=new DataView(buf);
  const w=(o,s)=>{ for(let i=0;i<s.length;i++) v.setUint8(o+i,s.charCodeAt(i)); };
  w(0,'RIFF'); v.setUint32(4,36+n*2,true); w(8,'WAVE'); w(12,'fmt '); v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true);
  v.setUint32(24,rate,true); v.setUint32(28,rate*2,true); v.setUint16(32,2,true); v.setUint16(34,16,true); w(36,'data'); v.setUint32(40,n*2,true);
  for(let i=0;i<n;i++){
    const t=i/rate, env=freq?Math.min(1,t/0.01)*Math.min(1,(seconds-t)/0.06):0;
    v.setInt16(44+i*2, Math.round(Math.sin(2*Math.PI*freq*t)*env*vol*32767), true);
  }
  return URL.createObjectURL(new Blob([buf],{type:'audio/wav'}));
}
const SILENT=wavURL(0.15,0,0);
const BEEP=wavURL(0.25,880,0.35);
export const PLAYER=new Audio();
PLAYER.preload='auto'; PLAYER.setAttribute('playsinline',''); PLAYER.setAttribute('webkit-playsinline','');

/* iPhone 소리 모드: 'playback'(미디어 재생) ↔ 'play-and-record'(녹음) */
export function setAudioMode(kind){ try{ if(navigator.audioSession) navigator.audioSession.type=kind; }catch(e){} }

export async function ensureAudio(){
  if(!LIVE.ctx){ const AC=window.AudioContext||window.webkitAudioContext; if(AC) LIVE.ctx=new AC(); }
  if(LIVE.ctx && LIVE.ctx.state==='suspended') try{ await LIVE.ctx.resume(); }catch(e){}
}
/* 반드시 버튼을 누른 직후(사용자 동작 안)에서 불러야 해요 */
export function unlockAudio(){
  setAudioMode('playback');
  ensureAudio();
  try{ PLAYER.src=SILENT; PLAYER.play().catch(()=>{}); }catch(e){}
  try{ if('speechSynthesis' in window){ const u=new SpeechSynthesisUtterance(' '); u.volume=0; speechSynthesis.speak(u); } }catch(e){}
}
function playURL(url, onTick){
  return new Promise(resolve=>{
    let done=false, raf=0;
    const fin=ok=>{ if(done) return; done=true; cancelAnimationFrame(raf); PLAYER.onended=PLAYER.onerror=null; LIVE.stopClip=null; resolve(ok); };
    LIVE.stopClip=()=>{ try{ PLAYER.pause(); }catch(e){} fin(true); };
    PLAYER.onended=()=>fin(true); PLAYER.onerror=()=>fin(false);
    PLAYER.src=url;
    const p=PLAYER.play();
    const loop=()=>{ if(onTick) onTick(PLAYER.currentTime); raf=requestAnimationFrame(loop); };
    if(p&&p.then) p.then(loop, ()=>fin(false)); else loop();
    PLAYER.onloadedmetadata=()=>{ const d=PLAYER.duration; if(isFinite(d)) setTimeout(()=>fin(true),(d+3)*1000); };
  });
}
export async function beep(){ await playURL(BEEP); }

/* 서버 음성: {url, env(소리 크기 50칸/초)} */
export function fetchTTS(text, voice){
  const key=voice+'|'+text;
  if(LIVE.ttsCache.has(key)) return LIVE.ttsCache.get(key);
  const p=(async()=>{
    if(!(API.srv&&API.srv.tts&&API.srv.tts.enabled&&sessionToken()) || LIVE.ttsFails>=2) return null;   // 두 번 실패하면 이번 면접은 브라우저 음성으로
    const r=await fetch('/api/tts',{method:'POST',headers:{'Content-Type':'application/json','X-Session':sessionToken()},body:JSON.stringify({text,voice})});
    if(!r.ok){ LIVE.ttsFails++; throw new Error('tts '+r.status); }
    const buf=await r.arrayBuffer();
    const url=URL.createObjectURL(new Blob([buf],{type:r.headers.get('content-type')||'audio/mpeg'}));
    let env=null;
    try{
      if(LIVE.ctx){
        const ab=await LIVE.ctx.decodeAudioData(buf.slice(0));
        const ch=ab.getChannelData(0), step=Math.round(ab.sampleRate/50); env=new Float32Array(Math.ceil(ch.length/step));
        for(let k=0;k<env.length;k++){ let s=0; const e=Math.min(ch.length,(k+1)*step); for(let i=k*step;i<e;i++) s+=ch[i]*ch[i]; env[k]=Math.sqrt(s/step); }
      }
    }catch(e){ env=null; }
    return { url, env };
  })();
  LIVE.ttsCache.set(key,p);
  p.catch(()=>LIVE.ttsCache.delete(key));
  return p;
}
async function playClip(clip, voice){
  let lvl=0;
  const ok=await playURL(clip.url, t=>{
    const raw = clip.env ? (clip.env[Math.floor(t*50)]||0) : 0.12+0.1*Math.abs(Math.sin(t*9));
    lvl=lvl*0.55+Math.min(1,raw*7)*0.45; setMouth(voice,lvl);
  });
  setMouth(voice,0);
  return ok;
}
export function pickVoice(g){
  if(!('speechSynthesis' in window)) return null;
  const vs=speechSynthesis.getVoices().filter(v=>/^ko/i.test(v.lang));
  const male=/(male|남|injoon|hyunsu|minsu|jinho|bong|gook|wonsik)/i, female=/(female|여|sunhi|yuna|heami|jimin|seoyeon|sora|google)/i;
  return vs.find(v=>(g==='male'?male:female).test(v.name)) || vs[0] || null;
}
export function browserSpeak(text, voice){
  return new Promise(resolve=>{
    let done=false, raf=0;
    const fin=()=>{ if(done) return; done=true; cancelAnimationFrame(raf); setMouth(voice,0); resolve(); };
    if(!('speechSynthesis' in window)){ const t0=performance.now(); const a=()=>{ const t=(performance.now()-t0)/1000; setMouth(voice,0.3+0.3*Math.abs(Math.sin(t*9))); raf=requestAnimationFrame(a); }; a(); setTimeout(fin, Math.min(9000,600+text.length*110)); return; }
    const u=new SpeechSynthesisUtterance(text); u.lang='ko-KR';
    const v=pickVoice(voice); if(v) u.voice=v;
    u.rate=0.95; u.pitch = voice==='male'?0.7:0.85;    // 낮은 목소리
    const t0=performance.now();
    const anim=()=>{ const t=(performance.now()-t0)/1000; setMouth(voice,0.25+0.45*Math.abs(Math.sin(t*8.5))*Math.abs(Math.sin(t*2.7+0.6))); raf=requestAnimationFrame(anim); };
    u.onstart=anim; u.onend=fin; u.onerror=fin;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
    setTimeout(()=>{ if(!done&&!speechSynthesis.speaking) fin(); },1500);
    setTimeout(fin, 4000+text.length*260);              // 일부 브라우저에서 onend가 오지 않을 때 대비
  });
}
export async function speak(text, voice){
  if(LIVE.abort) return;
  // 마이크를 막 끈 직후에는 휴대폰이 미디어 모드로 돌아갈 시간을 잠깐 줘요
  const since=performance.now()-(LIVE.micClosedAt||0);
  if(since<400) await new Promise(r=>setTimeout(r,400-since));
  setAudioMode('playback');
  liveSub(text, voice);
  setSpeaking(voice);
  try{
    let clip=null;
    try{ clip=await fetchTTS(text, voice); }catch(e){ clip=null; }
    if(LIVE.abort) return;
    const ok = clip ? await playClip(clip, voice) : false;
    if(!ok && !LIVE.abort) await browserSpeak(text, voice);
  }finally{ setSpeaking(null); }
}
export function stopSpeaking(){
  try{ if(LIVE.stopClip) LIVE.stopClip(); else PLAYER.pause(); }catch(e){}
  try{ if('speechSynthesis' in window) speechSynthesis.cancel(); }catch(e){}
  setSpeaking(null);
}
