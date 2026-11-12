/* 실전 면접: 면접관 그림(SVG) 또는 사실적인 사진·영상, 말할 때의 움직임 */
import { $ } from '../lib/dom.js';

/* =========================================================
   10. 실전 면접: 면접관이 질문을 말하고(TTS) → 카메라·마이크로 답을 녹화 → 받아쓰기(STT) → 바로 채점
   - 면접관 목소리: 서버 /api/tts (OpenAI gpt-4o-mini-tts, 낮고 차분한 목소리)
                   쓸 수 없으면 브라우저 내장 음성(speechSynthesis)으로 바뀌어요.
   - 입 모양: 재생 중인 소리 크기(Web Audio AnalyserNode)에 맞춰 면접관 그림의 입이 움직여요.
   - 받아쓰기: 서버 /api/stt (OpenAI gpt-transcribe). 쓸 수 없으면 브라우저 음성 인식, 그것도 없으면 직접 입력.
   - 녹화 영상은 이 기기에만 남아요(서버로 보내지 않아요).
   ========================================================= */

/* ---------- 면접관 그림 (직접 그린 SVG, 실제 인물이 아니에요) ---------- */
export function ivSVG(kind){
  const F=kind==='f';
  const skin=F?'#F3C7A3':'#E9BA93', skin2=F?'#E6B38F':'#DCA67E', hair=F?'#2A2233':'#25222A';
  const body = F
    ? `<path d="M26 252 C28 214 52 196 88 188 L120 208 L152 188 C188 196 212 214 214 252 Z" fill="#46507E"/>
       <path d="M98 186 L120 226 L142 186 L131 181 L120 194 L109 181 Z" fill="#F6F1E9"/>
       <path d="M88 188 L106 183 L119 224 L106 234 Z" fill="#3A4370"/><path d="M152 188 L134 183 L121 224 L134 234 Z" fill="#3A4370"/>
       <circle cx="120" cy="214" r="2.2" fill="#C9CDE0"/>`
    : `<path d="M24 252 C26 212 50 194 88 186 L120 206 L152 186 C190 194 214 212 216 252 Z" fill="#30364A"/>
       <path d="M98 184 L120 232 L142 184 L131 180 L120 190 L109 180 Z" fill="#F7F7F4"/>
       <path d="M114 192 L126 192 L129 200 L124 236 L120 242 L116 236 L111 200 Z" fill="#9C3440"/><path d="M113 190 L127 190 L124 199 L116 199 Z" fill="#7E2833"/>
       <path d="M88 186 L106 180 L118 230 L104 240 Z" fill="#262B3C"/><path d="M152 186 L134 180 L122 230 L136 240 Z" fill="#262B3C"/>
       <rect x="146" y="206" width="16" height="3" rx="1.5" fill="#E7E9F2" opacity=".8"/>`;
  const backHair = F
    ? `<path d="M64 116 C56 62 86 34 120 34 C154 34 184 62 176 116 C180 142 176 168 162 180 C152 172 148 162 148 152 L92 152 C92 162 88 172 78 180 C64 168 60 142 64 116 Z" fill="${hair}"/>`
    : '';
  const face = F
    ? `<path d="M81 104 C81 71 99 55 120 55 C141 55 159 71 159 104 C159 136 141 160 120 160 C99 160 81 136 81 104 Z" fill="${skin}"/>`
    : `<path d="M79 102 C79 69 97 53 120 53 C143 53 161 69 161 102 C161 134 147 160 120 162 C93 160 79 134 79 102 Z" fill="${skin}"/>`;
  const frontHair = F
    ? `<path d="M73 116 C66 70 90 42 122 42 C154 42 176 68 167 116 C164 94 157 80 147 72 C133 84 106 88 84 85 C78 94 75 104 73 116 Z" fill="${hair}"/>
       <path d="M147 72 C152 80 158 92 160 104" stroke="#3A3046" stroke-width="2" fill="none" opacity=".6"/>`
    : `<path d="M77 104 C72 66 92 42 122 42 C150 42 170 62 164 104 C161 88 157 78 151 72 C135 78 104 77 86 70 C80 80 78 92 77 104 Z" fill="${hair}"/>
       <path d="M79 96 C80 90 82 86 84 82" stroke="#8C8A93" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M161 96 C160 90 158 86 156 82" stroke="#8C8A93" stroke-width="2.5" fill="none" stroke-linecap="round"/>`;
  const brows = F
    ? `<path d="M95 95 Q104 90 113 94" stroke="${hair}" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M127 94 Q136 90 145 95" stroke="${hair}" stroke-width="3" fill="none" stroke-linecap="round"/>`
    : `<path d="M93 93 L114 92" stroke="${hair}" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M126 92 L147 93" stroke="${hair}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  const eyes = `<g class="iv-eye"><ellipse cx="104" cy="107" rx="${F?4.3:3.9}" ry="${F?5:4.4}" fill="#221B29"/><circle cx="105.6" cy="105.4" r="1.3" fill="#fff"/></g>
    <g class="iv-eye"><ellipse cx="136" cy="107" rx="${F?4.3:3.9}" ry="${F?5:4.4}" fill="#221B29"/><circle cx="137.6" cy="105.4" r="1.3" fill="#fff"/></g>`
    + (F?`<path d="M98 101 L96 99 M142 101 L144 99" stroke="#221B29" stroke-width="1.6" stroke-linecap="round"/>`:'');
  const glasses = F ? '' : `<g fill="none" stroke="#1B2559" stroke-width="2.6"><rect x="91" y="97" width="26" height="19" rx="7"/><rect x="123" y="97" width="26" height="19" rx="7"/><path d="M117 105 Q120 102 123 105"/><path d="M91 103 L80 100"/><path d="M149 103 L160 100"/></g>
    <path d="M95 100 L101 99" stroke="#fff" stroke-width="1.5" opacity=".5" stroke-linecap="round"/>`;
  const extras = F
    ? `<ellipse cx="95" cy="128" rx="8" ry="4.5" fill="#E8907F" opacity=".35"/><ellipse cx="145" cy="128" rx="8" ry="4.5" fill="#E8907F" opacity=".35"/>
       <circle cx="81" cy="124" r="2.8" fill="#FFC83D"/><circle cx="159" cy="124" r="2.8" fill="#FFC83D"/>`
    : `<path d="M96 146 Q120 158 144 146" stroke="${skin2}" stroke-width="2" fill="none" opacity=".7"/>`;
  const lip = F?'#B4505B':'#9A5A55';
  return `<svg viewBox="0 0 240 252" role="img" aria-label="${F?'면접위원 A, 여성 면접관':'면접위원 B, 남성 면접관'}">
    ${backHair}${body}
    <path d="M104 146 L104 184 Q120 198 136 184 L136 146 Z" fill="${skin2}"/>
    <path d="M104 152 Q120 168 136 152 L136 146 L104 146 Z" fill="#000" opacity=".08"/>
    <g class="iv-head">
      <ellipse cx="${F?81:79}" cy="110" rx="7" ry="11" fill="${skin2}"/><ellipse cx="${F?159:161}" cy="110" rx="7" ry="11" fill="${skin2}"/>
      ${face}${frontHair}${extras}${brows}${eyes}${glasses}
      <path d="M120 111 Q116 123 121 126" stroke="#C3876A" stroke-width="2" fill="none" stroke-linecap="round"/>
      <g class="iv-mouth">
        <ellipse class="mo" cx="120" cy="140" rx="9" ry="0.01" fill="#6E2230"/>
        <ellipse class="teeth" cx="120" cy="137" rx="6" ry="0" fill="#fff" opacity=".9"/>
        <path class="lip" d="M110 139 Q120 ${F?145:143} 130 139" stroke="${lip}" stroke-width="3" fill="none" stroke-linecap="round"/>
      </g>
    </g>
  </svg>`;
}
/* ---------- 사실적인 면접관 사진·영상 (선택) ----------
   public/interviewers/ 폴더에 아래 이름으로 파일을 넣으면 그림 대신 사진·영상이 나와요.
   파일이 없으면 위의 그림(SVG)을 그대로 써요.
     female.jpg, male.jpg                  정지 사진 (이 파일이 있어야 사진 모드가 켜져요. .png, .webp도 돼요)
     female-talk.mp4, male-talk.mp4        말하는 동안 반복 재생할 짧은 영상 (선택. .webm도 돼요)
     female-idle.mp4, male-idle.mp4        듣는 동안 반복 재생할 짧은 영상 (선택. 눈 깜박임·숨쉬기)
   영상이 없으면 사진에 빛 테두리와 미세한 움직임으로 '말하는 중'을 보여 줘요. */
export const PHOTO_DIR='/interviewers/';
const PHOTO={ female:null, male:null };   // {box, img, talk, idle}
const firstOk=async(list, probe)=>{ for(const src of list){ if(await probe(src)) return src; } return null; };
const probeImage=src=>new Promise(res=>{ const i=new Image(); i.onload=()=>res(true); i.onerror=()=>res(false); i.src=src; });
const probeVideo=src=>new Promise(res=>{
  const v=document.createElement('video'); let done=false; const fin=ok=>{ if(!done){ done=true; v.removeAttribute('src'); v.load(); res(ok); } };
  if(!v.canPlayType) return res(false);
  v.muted=true; v.preload='metadata'; v.onloadedmetadata=()=>fin(true); v.onerror=()=>fin(false); v.src=src; setTimeout(()=>fin(false),5000);
});
function makeVideo(src, cls){
  const v=document.createElement('video');
  Object.assign(v,{ src, muted:true, loop:true, playsInline:true, preload:'auto' }); v.setAttribute('muted',''); v.setAttribute('playsinline','');
  v.className=cls; v.setAttribute('aria-hidden','true');
  return v;
}
async function mountPhoto(voice, key, fig){
  const img=await firstOk(['jpg','png','webp'].map(e=>`${PHOTO_DIR}${key}.${e}`), probeImage);
  if(!img) return;
  const [talk, idle]=await Promise.all([
    firstOk(['mp4','webm'].map(e=>`${PHOTO_DIR}${key}-talk.${e}`), probeVideo),
    firstOk(['mp4','webm'].map(e=>`${PHOTO_DIR}${key}-idle.${e}`), probeVideo)
  ]);
  const box=document.createElement('div'); box.className='iv-photo';
  const im=document.createElement('img'); im.src=img; im.alt=fig.querySelector('figcaption')?.textContent||''; im.decoding='async';
  box.appendChild(im);
  const p={ box, img:im, talk:null, idle:null };
  if(idle){ p.idle=makeVideo(idle,'v-idle on'); box.appendChild(p.idle); p.idle.play().catch(()=>{}); }
  if(talk){ p.talk=makeVideo(talk,'v-talk'); box.appendChild(p.talk); }
  fig.querySelector('svg')?.remove();
  fig.insertBefore(box, fig.firstChild.nextSibling);           // 말하는 중 표시(.talk) 다음에 넣어요
  fig.classList.add('photo', idle?'has-idle':'no-idle');
  PHOTO[voice]=p;
}
export function mountInterviewers(){
  $('#ivF').insertAdjacentHTML('afterbegin', ivSVG('f'));      // 먼저 그림을 보여 주고
  $('#ivM').insertAdjacentHTML('afterbegin', ivSVG('m'));
  mountPhoto('female','female',$('#ivF'));                     // 사진 파일이 있으면 사진으로 바꿔요
  mountPhoto('male','male',$('#ivM'));
}
export const IV_EL={ female:$('#ivF'), male:$('#ivM') };
export const IV_NAME={ female:'면접위원 A', male:'면접위원 B' };
/* 말하는 영상을 실제 목소리에 맞추기
   - 면접관 목소리가 실제로 나오기 시작하면 말하는 영상으로 바꾸고, 말이 다 끝날 때까지 계속 말하는 영상만 보여 줘요.
     (문장 사이 쉼마다 듣는 영상으로 바꾸면 화면이 끊겨 보여서 바꾸지 않아요)
   - 소리가 클수록 조금 빠르게(0.85~1.15배) 재생해 말의 강약과 입 움직임이 비슷하게 느껴지게 해요.
   - 영상 파일 자체도 원본보다 0.7배 느리게(중간 장면을 채워 넣어 부드럽게) 만들어 두었어요. */
const TALK_ON=0.16;
function talkGate(voice, l){
  const p=PHOTO[voice]; if(!p||!p.talk) return;
  const now=performance.now();
  if(l>=TALK_ON) p.loudAt=now;
  // 소리가 처음 나는 순간부터 말이 완전히 끝날 때(setSpeaking(null))까지는 말하는 영상만 보여 줘요.
  // 문장 사이 짧은 쉼에서 듣는 영상으로 바꾸면 화면이 툭툭 끊겨 보이기 때문이에요.
  // (음성을 받아 오는 동안처럼 아직 소리가 나기 전에는 듣는 영상 그대로)
  const want=!!p.speaking && !!p.loudAt;
  if(want!==p.talkOn){
    p.talkOn=want;
    if(want){ clearTimeout(p.pauseT); p.talk.play().catch(()=>{}); p.talk.classList.add('on'); }
    else{ p.talk.classList.remove('on'); clearTimeout(p.pauseT); p.pauseT=setTimeout(()=>{ if(!p.talkOn) p.talk.pause(); },200); }
  }
  if(want){ const r=Math.round((0.85+0.3*l)*20)/20; if(p.talk.playbackRate!==r) p.talk.playbackRate=r; }
}
export function setMouth(voice, level){
  const fig=IV_EL[voice]; if(!fig) return;
  const l=Math.max(0,Math.min(1,level));
  if(PHOTO[voice]){ PHOTO[voice].box.style.setProperty('--lvl', l.toFixed(3)); talkGate(voice,l); return; }   // 사진: 소리 크기만큼 빛·움직임
  fig.querySelector('.mo').setAttribute('ry', (0.01+l*7.5).toFixed(2));
  fig.querySelector('.mo').setAttribute('rx', (8+l*2.5).toFixed(2));
  fig.querySelector('.teeth').setAttribute('ry', (l>0.25?Math.min(2.2,l*3):0).toFixed(2));
  fig.querySelector('.lip').style.opacity = l>0.12 ? .35 : 1;
  fig.querySelector('.iv-head').style.transform = `translateY(${(l*1.6).toFixed(2)}px) rotate(${(Math.sin(performance.now()/420)*l*1.2).toFixed(2)}deg)`;
}
export function setSpeaking(voice){
  Object.entries(IV_EL).forEach(([k,el])=>{
    const on=k===voice;
    el.classList.toggle('speaking',on);
    if(!on) setMouth(k,0);
    const p=PHOTO[k]; if(!p||!p.talk) return;
    if(on){ if(!p.speaking){ p.speaking=true; p.talkOn=false; p.loudAt=0; try{ p.talk.currentTime=0; }catch(e){} } }   // 실제 소리가 나면 talkGate가 재생해요
    else{ p.speaking=false; p.talkOn=false; p.talk.classList.remove('on'); clearTimeout(p.pauseT); p.pauseT=setTimeout(()=>{ if(!p.talkOn) p.talk.pause(); },200); }
  });
}
