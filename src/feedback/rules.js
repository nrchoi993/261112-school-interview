/* API 없이 쓰는 규칙 기반 채점 */
import { TRACKS } from '../data/tracks.js';
import { S, schoolName } from '../state.js';

/* =========================================================
   3. 피드백 엔진 (규칙 기반: AI를 쓸 수 없을 때)
   ========================================================= */
export const SLANG = ['ㅋ','ㅎㅎ','ㅠ','그냥','근데','진짜','완전','개꿀','존나','ㄹㅇ','뭐랄까','암튼','걍','짱','대박','솔까'];
export const HEDGE = ['잘 모르겠','아마도','글쎄','그런 것 같'];

export function linkWords(){
  const w=[...TRACKS[S.profile.track].kw];
  const d=S.profile.dept.trim(); if(d){w.push(d); w.push(d.replace(/과$/,''));}
  const s=schoolName(); if(s){w.push(s); w.push(s.replace(/(고등학교|고)$/,''));}
  return w.filter(x=>x && x.length>=1);
}
export function countUnique(text, re){
  const m=text.match(re); return m?new Set(m).size:0;
}
export function splitSentences(t){
  return t.split(/(?<=[.!?。])\s+|\n+/).map(s=>s.trim()).filter(Boolean);
}

/* 키워드만 늘어놓은 답 찾기: 조사·어미 없이 낱말만 이어진 부분이 길거나, 대부분의 어절에 조사·어미가 없으면 '나열'로 봐요 */
const JOSA_END=/(은|는|이|가|을|를|에|에서|에게|께|의|로|으로|와|과|랑|도|만|서|고|며|면|다|요|까|죠|게|지|니다|든|던|한|된|인|운|른|할|여|해|워|아|어|부터|까지|동안|때|히|려|후|씩|처럼|보다|라고|라는|이라|니까|는데|지만|도록|려고)$/;
export function keywordStuffing(raw){
  const words=raw.replace(/[.,!?…~"'“”‘’()]/g,' ').split(/\s+/).filter(Boolean);
  if(words.length<8) return { stuffed:false };
  let run=0, maxRun=0, marked=0;
  for(const w of words){
    if(JOSA_END.test(w)){ marked++; run=0; }
    else{ run++; maxRun=Math.max(maxRun,run); }
  }
  const ratio=marked/words.length;
  return { stuffed: maxRun>=7 || ratio<0.35, maxRun, ratio };
}

export function analyze(text, q){
  const raw=text.trim();
  const n=raw.replace(/\s/g,'').length;
  const sents=splitSentences(raw);
  const lw=linkWords();
  const crit=[];

  // A. 질문 적합성
  const groups=q.kw.map(g=>g.flatMap(k=>k==='@track'?lw:[k]));
  const hitIdx=groups.map(g=>g.some(k=>raw.includes(k)));
  const ratio=hitIdx.filter(Boolean).length/groups.length;
  let A=Math.round(4+16*ratio); if(n<40) A=Math.min(A,8);
  const missed=q.kw.filter((g,i)=>!hitIdx[i]).map(g=>g[0]==='@track'?'지원 분야 이야기':`‘${g[0]}’`);
  crit.push({key:'A',name:'질문 적합성',score:A,
    good:'질문이 묻는 핵심을 정확히 짚었어요.',
    bad:`면접관은 ‘${q.intent}’를 보려고 해요.${missed.length?` ${missed.slice(0,3).join(', ')} 같은 내용이 빠졌어요.`:''}`});

  // B. 구체성
  const expRe=/(때|경험|활동|직접|참여|만들|대회|동아리|봉사|수업|프로젝트|실습|체험|해 ?봤|했던|시작했|연습|도전)/g;
  const numRe=/(\d|한 번|두 번|세 번|처음|매일|매주|매달|일주일|한 달|[일이삼사오육칠팔구십]+ ?(년|개월|학년|번|시간))/;
  const ue=countUnique(raw,expRe);
  let B=Math.min(20,4+ue*3+(numRe.test(raw)?4:0)); if(n<40) B=Math.min(B,6);
  crit.push({key:'B',name:'경험의 구체성',score:B,
    good:'직접 겪은 경험이 들어가 있어 설득력이 있어요.',
    bad:'‘언제, 무엇을, 어떻게’ 했는지 경험 하나를 구체적으로 넣어 보세요. 기간이나 횟수 같은 숫자가 들어가면 더 좋아요.'});

  // C. 학교·학과 연계 또는 배운 점
  if(q.link){
    const s=schoolName(), d=S.profile.dept.trim();
    const sHit=s && (raw.includes(s)||raw.includes(s.replace(/(고등학교|고)$/,'')));
    const dHit=d && (raw.includes(d)||raw.includes(d.replace(/과$/,'')));
    const tHits=TRACKS[S.profile.track].kw.filter(k=>raw.includes(k)).length;
    const gen=/(이 학교|귀교|본교|우리 학교|이 학과|학과|실습실|교육과정|입학하면|입학 후)/.test(raw);
    let C=Math.min(20,4+(sHit?5:0)+(dHit?5:0)+Math.min(3,tHits)*2+(gen?3:0)); if(n<40) C=Math.min(C,6);
    crit.push({key:'C',name:'학교·학과 연계',score:C,
      good:'지원 학교·학과와 답변이 자연스럽게 이어져요.',
      bad:`${s||'지원 학교'} ${d||'학과'}에서 무엇을 배우고 싶은지, 내 경험이 그 공부와 어떻게 이어지는지 한 문장 넣어 보세요.`});
  }else{
    const g=countUnique(raw,/(배웠|깨달|느꼈|성장|이후로|덕분|노력하|알게 되|바뀌|달라졌|다짐)/g);
    let C=Math.min(20,6+g*5); if(n<40) C=Math.min(C,6);
    crit.push({key:'C',name:'배운 점·성장',score:C,
      good:'경험에서 배운 점이 잘 드러나요.',
      bad:'경험 뒤에 ‘이를 통해 ~을 배웠습니다’처럼 깨달은 점을 붙여 보세요.'});
  }

  // D. 구성
  const first=sents[0]||'', last=sents[sents.length-1]||'';
  const lead=first.replace(/\s/g,'').length<=70 && /(저는|제가|이유는|입니다|싶습니다|생각합니다|하겠습니다|때문입니다|있습니다)/.test(first);
  const conn=countUnique(raw,/(왜냐하면|그래서|따라서|첫째|둘째|또한|그 결과|이를 통해|덕분에|그때|이후)/g);
  const close=/(앞으로|입학하면|입학 후|되겠습니다|싶습니다|노력하겠|목표|하겠습니다|배웠습니다|생각합니다)/.test(last);
  let D=4+(lead?6:0)+Math.min(2,conn)*3+(close?4:0); if(sents.length<2) D=Math.min(D,9); D=Math.min(20,D);
  crit.push({key:'D',name:'답변 구성',score:D,
    good:'결론부터 말하고 깔끔하게 마무리해 구조가 좋아요.',
    bad:'첫 문장에 결론을 말하고(두괄식), 이유·경험을 이은 뒤 마지막은 ‘입학하면 ~하겠습니다’처럼 맺어 보세요.'});

  // E. 표현
  const polite=sents.filter(s=>/(니다|니까|어요|아요|에요|예요|해요|죠|세요|요)[.!?]?$/.test(s)).length;
  const pr=sents.length?polite/sents.length:0;
  const slangHit=SLANG.filter(w=>raw.includes(w));
  const hedgeHit=HEDGE.filter(w=>raw.includes(w));
  let E=20; const eNotes=[];
  if(pr<0.7){E-=6; eNotes.push('문장 끝을 ‘~습니다/~입니다’로 맞춰 보세요.');}
  if(slangHit.length){E-=Math.min(8,slangHit.length*3); eNotes.push(`${slangHit.slice(0,3).map(w=>`‘${w}’`).join(', ')} 같은 말은 면접에서 빼는 게 좋아요.`);}
  if(hedgeHit.length){E-=Math.min(4,hedgeHit.length*2); eNotes.push('‘~것 같아요’보다 ‘~라고 생각합니다’처럼 자신 있게 말해 보세요.');}
  if(n<50){E-=6; eNotes.push('답변이 너무 짧아요. 1분 기준 250~350자 정도가 적당해요.');}
  else if(n<120){E-=2; eNotes.push('조금 짧아요. 경험이나 이유를 한두 문장 더 붙여 보세요.');}
  if(n>450){E-=5; eNotes.push('답변이 길어요. 핵심만 남겨 1분 안에 말할 수 있게 줄여 보세요.');}
  E=Math.max(2,Math.min(20,E));
  crit.push({key:'E',name:'말투·분량',score:E,good:'면접에 맞는 바른 말투와 적당한 분량이에요.',bad:eNotes.join(' ')||'말투를 조금 더 다듬어 보세요.'});

  // 키워드 나열 감점: 낱말만 늘어놓으면 내용 점수(적합성·구체성·연계·구성)를 8점까지로 낮춰요
  const ks=keywordStuffing(raw);
  if(ks.stuffed){
    for(const c of crit){ if(c.key!=='E' && c.score>8){ c.score=8; c.bad='낱말을 늘어놓기보다 ‘저는 ~해서 ~했습니다’처럼 완전한 문장으로 이어서 말해 보세요. '+c.bad; } }
    const e=crit.find(c=>c.key==='E'); e.score=Math.min(e.score,10); e.bad='키워드만 나열하면 면접관이 내용을 알 수 없어요. 문장으로 이어서 말해 보세요. '+(e.bad||'');
  }

  // 개인정보 경고
  const warns=[];
  if(/[가-힣]{2,6}중학교/.test(raw)) warns.push('출신 중학교 이름');
  if(/(아버지|어머니|아빠|엄마|부모님)[^.]{0,12}(직업|회사|의사|변호사|교수|사장|공무원|대표)/.test(raw)) warns.push('부모님 직업');
  if(/제 이름은|저는 [가-힣]{2,4}입니다/.test(raw)) warns.push('본인 이름');

  const total=crit.reduce((a,c)=>a+c.score,0);
  return {total, crit, n, warns};
}

export function gradeOf(t){
  if(t>=80) return {cls:'g1',label:'우수',msg:'탄탄한 답변이에요. 실제 면접처럼 소리 내어 말하는 연습만 더 하면 돼요.'};
  if(t>=60) return {cls:'g2',label:'양호',msg:'뼈대는 좋아요. 아래 보완할 점 한두 가지만 고치면 훨씬 좋아져요.'};
  return {cls:'g3',label:'보완',msg:'답변의 뼈대부터 다시 세워 봐요. 아래 구성 순서를 따라 써 보세요.'};
}
