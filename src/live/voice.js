/* 실전 면접: 면접관 목소리(서버 TTS → 브라우저 음성) */
import { API, sessionToken } from '../ai/api.js';
import { setMouth, setSpeaking } from './interviewers.js';
import { LIVE, liveSub } from './state.js';

/* ---------- 소리 ---------- */
export async function ensureAudio(){
  if(!LIVE.ctx){ const AC=window.AudioContext||window.webkitAudioContext; if(AC) LIVE.ctx=new AC(); }
  if(LIVE.ctx && LIVE.ctx.state==='suspended') try{ await LIVE.ctx.resume(); }catch(e){}
}
export function beep(){
  const c=LIVE.ctx; if(!c) return;
  const o=c.createOscillator(), g=c.createGain();
  o.frequency.value=880; g.gain.setValueAtTime(0.0001,c.currentTime); g.gain.exponentialRampToValueAtTime(0.12,c.currentTime+0.02); g.gain.exponentialRampToValueAtTime(0.0001,c.currentTime+0.25);
  o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime+0.27);
}
export function fetchTTS(text, voice){
  const key=voice+'|'+text;
  if(LIVE.ttsCache.has(key)) return LIVE.ttsCache.get(key);
  const p=(async()=>{
    if(!(API.srv&&API.srv.tts&&API.srv.tts.enabled&&sessionToken()&&LIVE.ctx) || LIVE.ttsFails>=2) return null;   // 두 번 실패하면 이번 면접은 브라우저 음성으로
    const r=await fetch('/api/tts',{method:'POST',headers:{'Content-Type':'application/json','X-Session':sessionToken()},body:JSON.stringify({text,voice})});
    if(!r.ok){ LIVE.ttsFails++; throw new Error('tts '+r.status); }
    const buf=await r.arrayBuffer();
    return await LIVE.ctx.decodeAudioData(buf);
  })();
  LIVE.ttsCache.set(key,p);
  p.catch(()=>LIVE.ttsCache.delete(key));
  return p;
}
export function playBuffer(buf, voice){
  return new Promise(resolve=>{
    const c=LIVE.ctx, src=c.createBufferSource(), an=c.createAnalyser();
    an.fftSize=1024; src.buffer=buf; src.connect(an); an.connect(c.destination);
    const data=new Float32Array(an.fftSize); let lvl=0, raf=0;
    const loop=()=>{ an.getFloatTimeDomainData(data); let s=0; for(let i=0;i<data.length;i++) s+=data[i]*data[i];
      const rms=Math.sqrt(s/data.length); lvl=lvl*0.55+Math.min(1,rms*7)*0.45; setMouth(voice,lvl); raf=requestAnimationFrame(loop); };
    src.onended=()=>{ cancelAnimationFrame(raf); setMouth(voice,0); LIVE.src=null; resolve(); };
    LIVE.src=src; src.start(); loop();
  });
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
export async function speak(text, voice, opts){
  if(LIVE.abort) return;
  liveSub(text, voice);
  setSpeaking(voice);
  try{
    let buf=null;
    try{ buf=await fetchTTS(text, voice); }catch(e){ buf=null; }
    if(LIVE.abort) return;
    if(buf) await playBuffer(buf, voice); else await browserSpeak(text, voice);
  }finally{ setSpeaking(null); }
}
export function stopSpeaking(){
  try{ if(LIVE.src) LIVE.src.stop(); }catch(e){}
  try{ if('speechSynthesis' in window) speechSynthesis.cancel(); }catch(e){}
  setSpeaking(null);
}
