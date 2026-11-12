/* 실전 면접: 시선·자세·표정 분석 (학생 기기 안에서만)
   - Google MediaPipe Face Landmarker(@mediapipe/tasks-vision)로 카메라 영상에서 얼굴 점과 표정 값을 뽑아요.
   - 영상은 기기 밖으로 나가지 않아요. 기록에는 "화면을 본 시간 82%" 같은 숫자만 저장해요.
   - 실행 파일(wasm)은 이 사이트의 /mediapipe/wasm/에서(설치·빌드할 때 자동 복사), 얼굴 모델은
     /mediapipe/face_landmarker.task가 있으면 그것을, 없으면 Google 공식 주소에서 받아요.
   - 시작할 때 2초 동안 화면을 바라보게 해서 '기준'을 잡고, 답하는 동안 기준에서 얼마나 벗어나는지 재요.
     (학생은 카메라 렌즈가 아니라 화면을 보니까, 기준 없이 재면 늘 아래를 보는 것처럼 나와요) */
const WASM_BASE='/mediapipe/wasm';
const MODEL_LOCAL='/mediapipe/face_landmarker.task';
const MODEL_REMOTE='https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const EVERY_MS=110;                        // 1초에 약 9번만 분석해요(오래된 휴대폰도 버틸 수 있게)

export const FACE={ lm:null, loading:null, state:'idle', err:'', base:null, samples:[], timer:0, lastTs:0, video:null };

export function faceSupported(){ return typeof WebAssembly==='object' && typeof requestAnimationFrame==='function'; }

/* 라이브러리·모델 준비(처음 한 번 약 17MB를 받아요. 다음부터는 브라우저에 저장된 것을 써요) */
export function preloadFace(){
  if(FACE.loading) return FACE.loading;
  FACE.state='loading';
  FACE.loading=(async()=>{
    const { FilesetResolver, FaceLandmarker } = await import('@mediapipe/tasks-vision');
    const files=await FilesetResolver.forVisionTasks(WASM_BASE);
    const local=await fetch(MODEL_LOCAL,{method:'HEAD'}).then(r=>r.ok && !/text\/html/.test(r.headers.get('content-type')||'')).catch(()=>false);
    const opts=delegate=>({ baseOptions:{ modelAssetPath: local?MODEL_LOCAL:MODEL_REMOTE, delegate },
      runningMode:'VIDEO', numFaces:1, outputFaceBlendshapes:true,
      minFaceDetectionConfidence:0.5, minFacePresenceConfidence:0.5, minTrackingConfidence:0.5 });
    try{ FACE.lm=await FaceLandmarker.createFromOptions(files, opts('GPU')); }
    catch(e){ FACE.lm=await FaceLandmarker.createFromOptions(files, opts('CPU')); }   // GPU를 못 쓰는 기기
    FACE.state='ready';
  })().catch(e=>{ FACE.state='error'; FACE.err=String(e&&e.message||e); console.warn('[얼굴 분석]', e); });
  return FACE.loading;
}
export async function faceReady(timeoutMs){
  if(FACE.state==='ready') return true;
  if(FACE.state==='idle') preloadFace();
  await Promise.race([FACE.loading, new Promise(r=>setTimeout(r,timeoutMs))]);
  return FACE.state==='ready';
}

/* ---------- 한 장면 분석 ---------- */
const bs=(list,name)=>{ const c=list.find(x=>x.categoryName===name); return c?c.score:0; };
function measure(res){
  const lm=res.faceLandmarks&&res.faceLandmarks[0];
  if(!lm) return { face:false };
  const b=(res.faceBlendshapes&&res.faceBlendshapes[0]&&res.faceBlendshapes[0].categories)||[];
  const nose=lm[1], L=lm[234], R=lm[454], eyeL=lm[33], eyeR=lm[263], mU=lm[13], mD=lm[14];
  const w=Math.hypot(R.x-L.x, R.y-L.y)||0.001;
  const eyeY=(eyeL.y+eyeR.y)/2, mouthY=(mU.y+mD.y)/2;
  return {
    face:true,
    yaw:(nose.x-L.x)/((R.x-L.x)||0.001)-0.5,                 // 고개 좌우: 코가 양 볼 사이 어디에 있는지(정면이면 0 근처)
    pitch:(nose.y-eyeY)/((mouthY-eyeY)||0.001),              // 고개 위아래: 코가 눈과 입 사이 어디에 있는지(숙이면 커져요)
    gx:((bs(b,'eyeLookOutLeft')-bs(b,'eyeLookInLeft'))-(bs(b,'eyeLookOutRight')-bs(b,'eyeLookInRight')))/2,   // 눈동자 좌우
    gy:(bs(b,'eyeLookDownLeft')+bs(b,'eyeLookDownRight'))/2-(bs(b,'eyeLookUpLeft')+bs(b,'eyeLookUpRight'))/2, // 눈동자 위아래(아래가 +)
    blink:(bs(b,'eyeBlinkLeft')+bs(b,'eyeBlinkRight'))/2,
    smile:(bs(b,'mouthSmileLeft')+bs(b,'mouthSmileRight'))/2,
    x:nose.x, y:nose.y, w
  };
}

/* ---------- 측정 시작·끝 ---------- */
export function startFace(video){
  stopFace();
  if(FACE.state!=='ready'||!video) return false;
  FACE.video=video; FACE.samples=[];
  const tick=()=>{
    const v=FACE.video;
    if(v && v.readyState>=2 && v.videoWidth){
      const ts=Math.max(performance.now(), FACE.lastTs+1); FACE.lastTs=ts;
      try{ const m=measure(FACE.lm.detectForVideo(v, ts)); m.t=ts; FACE.samples.push(m); }catch(e){ /* 한 장면 실패는 건너뛰어요 */ }
    }
    FACE.timer=setTimeout(tick, EVERY_MS);
  };
  tick();
  return true;
}
export function stopFace(){ clearTimeout(FACE.timer); FACE.timer=0; const s=FACE.samples; FACE.samples=[]; return s; }

const median=a=>{ if(!a.length) return 0; const s=[...a].sort((x,y)=>x-y); return s[Math.floor(s.length/2)]; };
function baseOf(samples){
  const f=samples.filter(s=>s.face && s.blink<0.5);
  if(f.length<5) return null;
  const k=n=>median(f.map(s=>s[n]));
  return { yaw:k('yaw'), pitch:k('pitch'), gx:k('gx'), gy:k('gy'), x:k('x'), y:k('y') };
}
/* 2초 동안 화면을 바라보게 해서 기준 잡기 */
export async function calibrate(video, ms=2000){
  if(!startFace(video)) return { ok:false, reason:'notready' };
  await new Promise(r=>setTimeout(r, ms));
  const s=stopFace();
  const faceRate=s.length?s.filter(x=>x.face).length/s.length:0;
  FACE.base=baseOf(s);
  return { ok:!!FACE.base, faceRate, n:s.length };
}

/* ---------- 답변 하나 요약 ---------- */
export function summarizeFace(samples){
  if(!samples||samples.length<8) return null;
  const base=FACE.base||baseOf(samples.slice(0,12));        // 기준이 없으면 답변 첫 1초를 기준으로
  if(!base) return { n:samples.length, miss:100, look:0, down:0, side:0, move:null, center:0, smile:0 };
  let look=0, down=0, side=0, miss=0, center=0, smile=0, path=0, prev=null;
  for(const s of samples){
    if(!s.face){ miss++; prev=null; continue; }
    if(s.x>0.25&&s.x<0.75&&s.y>0.2&&s.y<0.8) center++;
    if(s.smile>0.3) smile++;
    if(prev) path+=Math.hypot(s.x-prev.x, s.y-prev.y)/(s.w||0.2);
    prev=s;
    if(s.blink>0.5){ look++; continue; }                      // 눈을 감은 순간은 시선 판단에서 빼요(보는 것으로 셈)
    const dYaw=s.yaw-base.yaw, dPitch=s.pitch-base.pitch, dgx=s.gx-base.gx, dgy=s.gy-base.gy;
    if(dPitch>0.16 || dgy>0.3) down++;                         // 고개를 숙이거나 눈이 아래로
    else if(Math.abs(dYaw)>0.12 || Math.abs(dgx)>0.35 || dPitch<-0.18 || dgy<-0.35) side++;   // 옆이나 위
    else look++;
  }
  const n=samples.length, faced=n-miss, secs=Math.max(1,(samples[n-1].t-samples[0].t)/1000);
  const pct=v=>Math.round(v/n*100);
  return { n, look:pct(look), down:pct(down), side:pct(side), miss:pct(miss),
    center:faced?Math.round(center/faced*100):0, smile:faced?Math.round(smile/faced*100):0,
    move:faced>4?Math.round(path/secs*100)/100:null };       // 1초에 얼굴 너비의 몇 배만큼 움직였는지
}
