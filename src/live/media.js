/* 실전 면접: 카메라·마이크, 녹화, 받아쓰기(STT) */
import { API, sessionToken } from '../ai/api.js';
import { $ } from '../lib/dom.js';
import { LIVE } from './state.js';

/* ---------- 카메라·마이크 ---------- */
export async function openMedia(){
  const wantCam=$('#lvCam').value==='on';
  const audio={echoCancellation:true,noiseSuppression:true,autoGainControl:true};
  let stream=null, note='';
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia) note='이 브라우저는 카메라·마이크를 쓸 수 없어요.';
  else{
    try{ stream=await navigator.mediaDevices.getUserMedia({audio, video:wantCam?{width:{ideal:640},height:{ideal:480},facingMode:'user'}:false}); }
    catch(e){
      if(wantCam){ try{ stream=await navigator.mediaDevices.getUserMedia({audio}); note='카메라를 쓸 수 없어 소리만 녹음해요.'; }catch(e2){ stream=null; } }
      if(!stream) note = e && e.name==='NotAllowedError' ? '마이크 사용을 허락하지 않았어요. 주소창의 자물쇠 아이콘에서 마이크를 허용할 수 있어요.' : '마이크를 찾지 못했어요.';
    }
  }
  LIVE.stream=stream;
  const v=$('#camVideo');
  if(stream && stream.getVideoTracks().length){ v.srcObject=stream; v.hidden=false; $('#camOff').hidden=true; try{ await v.play(); }catch(e){} }
  else{ v.hidden=true; $('#camOff').hidden=false; $('#camOff').innerHTML = stream ? '🎙️ 소리만 녹음 중' : '마이크 없음<br>글로 답해요'; }
  if(stream && LIVE.ctx){
    const srcNode=LIVE.ctx.createMediaStreamSource(stream);
    LIVE.micAn=LIVE.ctx.createAnalyser(); LIVE.micAn.fftSize=1024; srcNode.connect(LIVE.micAn);
    LIVE.micBuf=new Float32Array(LIVE.micAn.fftSize);
    meterLoop();
  }
  return note;
}
export function meterLoop(){
  cancelAnimationFrame(LIVE.meterRaf);
  const step=()=>{
    if(!LIVE.micAn) return;
    LIVE.micAn.getFloatTimeDomainData(LIVE.micBuf);
    let s=0; for(let i=0;i<LIVE.micBuf.length;i++) s+=LIVE.micBuf[i]*LIVE.micBuf[i];
    const rms=Math.sqrt(s/LIVE.micBuf.length), now=performance.now();
    $('#micLevel').style.width=Math.min(100,rms*600).toFixed(0)+'%';
    if(LIVE.state==='answering'){
      const dt=LIVE.lastT?now-LIVE.lastT:0;
      const on = rms > Math.max(0.012, LIVE.noise*3);
      if(on){ LIVE.voiced+=dt; if(!LIVE.firstAt && now-LIVE.t0>150) LIVE.firstAt=now; }
      else LIVE.noise = LIVE.noise*0.98 + rms*0.02;
    }else LIVE.noise = LIVE.noise*0.95 + Math.min(rms,0.05)*0.05;
    LIVE.lastT=now;
    LIVE.meterRaf=requestAnimationFrame(step);
  };
  step();
}
export function closeMedia(){
  cancelAnimationFrame(LIVE.meterRaf); LIVE.micAn=null;
  if(LIVE.stream) LIVE.stream.getTracks().forEach(t=>t.stop());
  LIVE.stream=null; $('#camVideo').srcObject=null; $('#camVideo').hidden=true;
  $('#camOff').hidden=false; $('#camOff').innerHTML='내 모습<br>(면접을 시작하면 켜져요)'; $('#micLevel').style.width='0';
}
export const pickMime=list=>window.MediaRecorder&&MediaRecorder.isTypeSupported ? (list.find(t=>MediaRecorder.isTypeSupported(t))||'') : '';
export function startRecording(){
  LIVE.vChunks=[]; LIVE.aChunks=[]; LIVE.vRec=LIVE.aRec=null;
  const st=LIVE.stream; if(!st||!window.MediaRecorder) return false;
  try{
    if(st.getVideoTracks().length){
      const mt=pickMime(['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4']);
      LIVE.vRec=new MediaRecorder(st, {...(mt?{mimeType:mt}:{}), videoBitsPerSecond:900000});
      LIVE.vRec.ondataavailable=e=>{ if(e.data&&e.data.size) LIVE.vChunks.push(e.data); };
      LIVE.vRec.start(1000);
    }
    const at=pickMime(['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg;codecs=opus']);
    LIVE.aRec=new MediaRecorder(new MediaStream(st.getAudioTracks()), {...(at?{mimeType:at}:{}), audioBitsPerSecond:48000});
    LIVE.aRec.ondataavailable=e=>{ if(e.data&&e.data.size) LIVE.aChunks.push(e.data); };
    LIVE.aRec.start(1000);
    return true;
  }catch(e){ console.warn(e); return false; }
}
export function stopRec(rec, chunks){
  return new Promise(res=>{
    if(!rec||rec.state==='inactive') return res(chunks.length?new Blob(chunks,{type:(rec&&rec.mimeType)||chunks[0].type}):null);
    rec.onstop=()=>res(chunks.length?new Blob(chunks,{type:rec.mimeType||chunks[0].type}):null);
    try{ rec.stop(); }catch(e){ res(null); }
  });
}
export function blobToB64(blob){
  return new Promise((res,rej)=>{ const fr=new FileReader(); fr.onload=()=>res(String(fr.result).split(',')[1]||''); fr.onerror=rej; fr.readAsDataURL(blob); });
}
export async function transcribe(blob, qText){
  if(blob.size>3_200_000) throw new Error('녹음 파일이 너무 커요(답변이 너무 길어요).');
  const r=await fetch('/api/stt',{method:'POST',headers:{'Content-Type':'application/json','X-Session':sessionToken()},
    body:JSON.stringify({audio:await blobToB64(blob), mime:blob.type, question:qText})});
  const j=await r.json().catch(()=>null);
  if(!r.ok||!j||!j.ok) throw new Error((j&&j.error&&j.error.message)||`받아쓰기 실패 (HTTP ${r.status})`);
  return j.text;
}
/* 서버 받아쓰기를 쓸 수 없을 때: 브라우저 음성 인식(크롬·엣지 등)으로 답하는 동안 받아 적어요 */
export function startBrowserSR(){
  LIVE.srText=''; LIVE.sr=null;
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition; if(!SR) return;
  const rec=new SR(); rec.lang='ko-KR'; rec.continuous=true; rec.interimResults=true;
  let finals='', interim='';
  rec.onresult=e=>{ interim=''; for(let i=e.resultIndex;i<e.results.length;i++){ const t=e.results[i][0].transcript; if(e.results[i].isFinal) finals+=t+' '; else interim+=t; } LIVE.srText=(finals+interim).trim(); };
  rec.onend=()=>{ if(LIVE.state==='answering'&&LIVE.sr===rec) try{ rec.start(); }catch(e){} };
  try{ rec.start(); LIVE.sr=rec; }catch(e){}
}
export function stopBrowserSR(){ const r=LIVE.sr; LIVE.sr=null; if(r) try{ r.stop(); }catch(e){} return new Promise(res=>setTimeout(()=>res(LIVE.srText),700)); }
export const serverSTT=()=>!!(API.srv&&API.srv.stt&&API.srv.stt.enabled&&sessionToken());
