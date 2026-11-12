/* 사용 안내 팝업
   - 이 브라우저로 처음 들어왔을 때 한 번 저절로 열려요.
   - 학번·이름·비밀번호로 로그인할 때도 열려요. ‘다음부터 로그인할 때 열지 않기’를 고르면 그 학생은 다시 안 열려요.
     (같은 화면에서 이미 한 번 봤으면 로그인 직후에는 다시 열지 않아요)
   - 머리글 오른쪽 위 ‘사용 안내’ 버튼으로 언제든 다시 볼 수 있어요.
   - 교사 모드에서는 교사용 안내를 보여 줘요. */
import { $ } from '../lib/dom.js';

const SEEN_KEY='ivGuideSeen';            // 이 브라우저에서 한 번이라도 봤는지
const OFF_KEY='ivGuideOff:';             // + 학번|이름 : 이 학생은 로그인할 때 열지 않기

const STUDENT=[
  { icon:'🎫', title:'면접 대기실에 온 걸 환영해요',
    body:`<p>2027학년도 서울 특성화고 면접을 혼자서도 연습할 수 있는 곳이에요.</p>
      <ul><li><b>학번·이름·비밀번호</b>로 들어와요. 처음 정한 비밀번호로 내 기록이 만들어져요.</li>
      <li>휴대폰·태블릿·컴퓨터 어디서든 같은 학번·이름·비밀번호로 들어오면 <b>이어서</b> 연습할 수 있어요.</li>
      <li>비밀번호를 잊으면 선생님께 초기화를 부탁하세요.</li></ul>` },
  { icon:'🏫', title:'① 수험표부터 채워요',
    body:`<p>화면 위쪽(휴대폰은 ‘펼치기’)의 <b>수험표</b>에서 지원 학교·학과·전형을 골라요.</p>
      <ul><li>고른 학과에 맞춰 질문과 평가가 달라져요.</li>
      <li>‘학교·학과 정보’ 탭에서 학교별 학과와 모집 인원을 보고 바로 고를 수도 있어요.</li></ul>` },
  { icon:'💬', title:'② 모의면접: 질문에 답하고 평가표 받기',
    body:`<ul><li><b>질문 추천받기</b>를 누르면 면접 질문이 나와요. ‘연속 5문항 연습’은 실제 면접 순서대로 이어서 물어봐요.</li>
      <li>글로 적거나 <b>🎤 말로 답하기</b>로 말하면 받아 적어 줘요. 확인하고 ‘보내기’.</li>
      <li><b>면접관 평가표</b>에서 항목별 점수, 잘한 점, 보완할 점, 다듬은 예시 답변을 볼 수 있어요.</li>
      <li>예시 답변의 <b>[대괄호]</b>는 내 실제 경험으로 채울 자리예요. 없는 경험을 지어내지 마세요.</li></ul>` },
  { icon:'🎥', title:'③ 실전 면접: 진짜처럼 말로 연습',
    body:`<ul><li>두 면접관이 질문을 <b>소리로</b> 읽어 줘요. 삐 소리가 나면 말로 답하고 ‘답변 마치기’.</li>
      <li>카메라·마이크 허용을 물으면 <b>허용</b>을 눌러요. 조용한 곳에서, 소리를 켜고 하세요.</li>
      <li>내용 평가와 함께 <b>말 빠르기·말버릇(음, 어)·쉼·시선</b>을 숫자와 설명으로 알려 줘요.</li>
      <li>녹화 영상과 얼굴 분석은 <b>내 기기 안에서만</b> 처리돼요. 기록에는 숫자만 남아요.</li></ul>` },
  { icon:'📈', title:'④ 기록 보고 다시 도전',
    body:`<ul><li><b>내 기록</b> 탭에서 지금까지의 답변, 평가, 점수 변화를 볼 수 있어요.</li>
      <li><b>질문 은행</b>에서 유형별 질문을 골라 연습하고, <b>전형 일정·면접 팁</b>에서 날짜와 준비 방법을 확인해요.</li>
      <li>이 안내는 오른쪽 위 <b>‘사용 안내’</b> 버튼으로 언제든 다시 볼 수 있어요.</li></ul>` }
];
const TEACHER=[
  { icon:'📋', title:'교사 화면 안내',
    body:`<ul><li><b>학생 대시보드</b>에서 학생별 답변 수·평균·최근 점수, 도움이 필요한 학생을 한눈에 봐요.</li>
      <li>‘기록 보기’로 답변·평가·AI 코치 대화를 확인하고, 비밀번호를 잊은 학생은 <b>비밀번호 초기화</b>를 해 주세요(학생이 다음 로그인 때 새로 정해요).</li>
      <li>CSV로 내려받아 정리할 수 있어요.</li></ul>` },
  { icon:'🧑‍🎓', title:'가상 학생으로 학생 화면 체험',
    body:`<ul><li>대시보드의 ‘학생 화면 체험’에서 가상 학생을 고르고 <b>학생 화면으로 보기</b>를 누르면 학생과 똑같은 화면을 써 볼 수 있어요.</li>
      <li>가상 학생 기록은 통계와 CSV에서 빠져요. 위쪽 띠의 ‘교사 대시보드로 돌아가기’로 돌아와요.</li></ul>` },
  { icon:'⚙️', title:'교사·API 탭',
    body:`<ul><li>AI 채점·음성·받아쓰기 연결 상태와 기록 저장소를 확인해요.</li>
      <li>교사 비밀번호도 여기서 바꿔요. 학생에게는 오류가 간단한 안내로만 보여요.</li></ul>` }
];

const G={ i:0, steps:STUDENT, shownThisPage:false, who:'' };
const get=k=>{ try{ return localStorage.getItem(k); }catch(e){ return null; } };
const set=(k,v)=>{ try{ localStorage.setItem(k,v); }catch(e){} };

function render(){
  const s=G.steps[G.i], n=G.steps.length, last=G.i===n-1;
  $('#guideStep').innerHTML=`<div class="g-ico" aria-hidden="true">${s.icon}</div><h3 id="guideTitle">${s.title}</h3><div class="g-body">${s.body}</div>`;
  $('#guideDots').innerHTML=G.steps.map((_,k)=>`<button type="button" class="${k===G.i?'on':''}" data-k="${k}" aria-label="${k+1}번째 안내${k===G.i?' (지금)':''}"></button>`).join('');
  $('#guidePrev').disabled=G.i===0;
  $('#guideNext').textContent= last?'시작하기':'다음';
  $('#guideCount').textContent=`${G.i+1} / ${n}`;
  $('#guideOffRow').hidden=!G.who;
}
export function openGuide(opts={}){
  const dlg=$('#guideDlg'); if(!dlg) return;
  G.steps=opts.teacher?TEACHER:STUDENT; G.i=0; G.who=opts.who||'';
  $('#guideOff').checked=!!(G.who&&get(OFF_KEY+G.who));
  render();
  G.shownThisPage=true; set(SEEN_KEY,'1');
  if(!dlg.open){ try{ dlg.showModal(); }catch(e){ dlg.setAttribute('open',''); } }
  $('#guideNext').focus();
}
export function closeGuide(){
  const dlg=$('#guideDlg');
  if(G.who){ if($('#guideOff').checked) set(OFF_KEY+G.who,'1'); else try{ localStorage.removeItem(OFF_KEY+G.who); }catch(e){} }
  if(dlg.open) try{ dlg.close(); }catch(e){ dlg.removeAttribute('open'); }
}
/* 처음 들어왔을 때(이 브라우저에서 한 번도 안 봤으면) */
export function maybeFirstVisitGuide(){ if(!get(SEEN_KEY)) openGuide(); }
/* 학번·이름·비밀번호로 로그인했을 때 */
export function maybeLoginGuide(who){
  if(G.shownThisPage || get(OFF_KEY+who)) return;
  openGuide({ who });
}
export function initGuide(onHelp){
  $('#helpBtn').onclick=()=>onHelp();
  $('#gateHelp').onclick=()=>openGuide();
  $('#guideClose').onclick=closeGuide;
  $('#guidePrev').onclick=()=>{ if(G.i>0){ G.i--; render(); } };
  $('#guideNext').onclick=()=>{ if(G.i<G.steps.length-1){ G.i++; render(); } else closeGuide(); };
  $('#guideDots').onclick=e=>{ const b=e.target.closest('button[data-k]'); if(b){ G.i=+b.dataset.k; render(); } };
  const dlg=$('#guideDlg');
  dlg.addEventListener('cancel',e=>{ e.preventDefault(); closeGuide(); });          // Esc
  dlg.addEventListener('click',e=>{ if(e.target===dlg) closeGuide(); });            // 바깥 누르기
  dlg.addEventListener('keydown',e=>{ if(e.key==='ArrowRight') $('#guideNext').click(); if(e.key==='ArrowLeft') $('#guidePrev').click(); });
  // 휴대폰: 좌우로 밀어 넘기기
  let x0=null;
  dlg.addEventListener('touchstart',e=>{ x0=e.touches[0].clientX; },{passive:true});
  dlg.addEventListener('touchend',e=>{ if(x0==null) return; const dx=e.changedTouches[0].clientX-x0; x0=null;
    if(Math.abs(dx)>60){ if(dx<0&&G.i<G.steps.length-1){ G.i++; render(); } else if(dx>0&&G.i>0){ G.i--; render(); } } },{passive:true});
}
