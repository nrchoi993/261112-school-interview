/* 실전 면접: 말하기·태도 평가표
   목소리(말 빠르기·말버릇·쉼·답변 시간)와 카메라(시선·자세·표정)를 숫자로 먼저 보여 주고,
   중학생이 바로 이해할 수 있는 문장으로 풀어 설명해요. AI를 쓰지 않는 규칙 기반이라 API 없이도 똑같이 나와요.
   이 평가는 100점 답변 점수에는 넣지 않아요(참고용). 기준 숫자는 아래 RULES에서 바꿀 수 있어요. */
import { esc } from '../lib/dom.js';

export const RULES = {
  cpm: { good:[250,350] },                 // 말 빠르기: 1분에 말한 글자 수(띄어쓰기 빼고)
  fillerPerMin: [1, 2, 4, 6],              // 말버릇: 1분에 이만큼 이하면 ●5·4·3·2
  longPauseSec: 2,                         // 이만큼 넘게 멈추면 '긴 멈춤'
  answerSec: { good:[45, 80], short:30 },  // 답변 시간
  look: [80, 65, 50, 35]                   // 시선: 화면을 본 시간(%)이 이 이상이면 ●5·4·3·2
};
const fmt=s=>{ s=Math.round(s||0); const m=Math.floor(s/60), ss=s%60; return m ? `${m}분${ss?` ${ss}초`:''}` : `${ss}초`; };
const clamp=v=>Math.max(1,Math.min(5,Math.round(v)));

/* 행 만들기: {name, score(1~5), value(숫자 요약), text(풀어 쓴 설명)} */
export function talkRows(d){
  if(!d) return [];
  const rows=[];
  const speakSec=Math.max(1,(d.sec||0)-(d.latency||0));

  // 1. 말 빠르기
  if(d.cpm!=null){
    const [lo,hi]=RULES.cpm.good, c=d.cpm;
    const gap=c<lo?(lo-c):c>hi?(c-hi):0, score=clamp(5-gap/30);
    const text = gap===0 ? '듣는 사람이 따라가기 편한 빠르기예요. 지금처럼 말하면 돼요.'
      : c<lo ? `조금 느린 편이에요. 면접에서는 1분에 ${lo}~${hi}자 정도가 듣기 편해요. 문장 끝을 늘이지 말고 또박또박 이어서 말해 보세요.`
      : `조금 빠른 편이에요. 1분에 ${lo}~${hi}자 정도가 알맞아요. 문장이 끝날 때마다 반 박자 쉬고 다음 문장으로 넘어가 보세요.`;
    rows.push({ key:'speed', name:'말 빠르기', score, value:`1분에 ${c}자`, text });
  }
  // 2. 말버릇
  if(d.fillers!=null){
    const per=d.fillers/(Math.max(30,speakSec)/60), [,b,c2,e]=RULES.fillerPerMin;   // 아주 짧은 답은 30초로 계산(빈도가 지나치게 커지지 않게)
    const score = d.fillers<=1?5 : per<=b?4 : per<=c2?3 : per<=e?2 : 1;
    const words=d.fillerWords&&Object.keys(d.fillerWords).length ? Object.entries(d.fillerWords).sort((x,y)=>y[1]-x[1]).slice(0,3).map(([w,n])=>`‘${w}’ ${n}번`).join(', ') : '';
    const text = d.fillers===0 ? '‘음’, ‘어’ 같은 말버릇 없이 깔끔하게 말했어요.'
      : score>=4 ? `말버릇이 거의 없어요${words?`(${words})`:''}. 아주 자연스러운 정도예요.`
      : `${words||'말버릇'}이 나왔어요. 생각이 막힐 때 소리를 내기보다 입을 닫고 1초 쉬면 훨씬 자신 있어 보여요.`;
    rows.push({ key:'filler', name:'말버릇', score, value:`‘음·어’ ${d.fillers}번 (1분에 ${per.toFixed(1)}번)`, text });
  }
  // 3. 쉼·머뭇거림
  if(d.latency!=null || d.pauses!=null){
    let score=5; const parts=[];
    if(d.latency!=null){
      if(d.latency>5) score-=2; else if(d.latency>3) score-=1;
      parts.push(d.latency<=3 ? `질문을 듣고 ${d.latency.toFixed(1)}초 만에 말을 시작했어요.` : `첫 마디까지 ${d.latency.toFixed(1)}초가 걸렸어요. ‘네, 저는 ~입니다’처럼 첫 문장을 미리 정해 두면 바로 시작할 수 있어요.`);
    }
    if(d.pauses!=null){
      if(d.pauses>=3) score-=2; else if(d.pauses>=1) score-=1;
      parts.push(d.pauses===0 ? '중간에 오래 멈추지 않고 이어서 말했어요.' : `말하는 중간에 ${RULES.longPauseSec}초 넘게 멈춘 곳이 ${d.pauses}번 있었어요${d.longPause?`(가장 길게 ${d.longPause.toFixed(1)}초)`:''}. 막힐 때는 ‘제 생각에는’, ‘예를 들면’처럼 이어 주는 말을 써 보세요.`);
    }
    const value=[d.latency!=null?`첫 마디 ${d.latency.toFixed(1)}초`:'', d.pauses!=null?`긴 멈춤 ${d.pauses}번`:''].filter(Boolean).join(' · ');
    rows.push({ key:'pause', name:'쉼·머뭇거림', score:clamp(score), value, text:parts.join(' ') });
  }
  // 4. 답변 시간
  if(d.sec!=null){
    const [g1,g2]=RULES.answerSec.good, s=d.sec;
    let score, text;
    if(d.over){ score=2; text='제한 시간이 다 되어 중간에 끊겼어요. 결론부터 말하고, 경험은 하나만 골라 1분 안팎으로 줄여 보세요.'; }
    else if(s<RULES.answerSec.short){ score=2; text='답이 많이 짧아요. 이유 뒤에 직접 겪은 경험을 한두 문장 더 붙여 보세요.'; }
    else if(s<g1){ score=3; text='조금 짧아요. 경험이나 앞으로의 다짐을 한 문장 더 넣으면 딱 좋아요.'; }
    else if(s<=g2){ score=5; text='1분 안팎으로 알맞은 길이예요.'; }
    else { score=4; text='조금 길어요. 같은 말을 되풀이한 곳이 없는지 살펴보고 핵심만 남겨 보세요.'; }
    rows.push({ key:'time', name:'답변 시간', score, value:`${fmt(s)}${d.limit?` / 제한 ${fmt(d.limit)}`:''}`, text });
  }
  // 5~7. 카메라: 시선·자세·표정
  const f=d.face;
  if(f){
    if(f.miss>=60){
      rows.push({ key:'gaze', name:'시선', score:1, value:`얼굴이 보인 시간 ${100-f.miss}%`, text:'얼굴이 화면에 잘 잡히지 않았어요. 밝은 곳에서 카메라를 눈높이 정면에 두고 다시 해 보세요.' });
    }else{
      {
      const [a,b,c2,e]=RULES.look, L=f.look;
      const score = L>=a?5 : L>=b?4 : L>=c2?3 : L>=e?2 : 1;
      let text;
      if(L>=a) text='면접관을 안정적으로 바라보며 말했어요. 자신감 있어 보여요.';
      else if(f.down>=f.side && f.down>=f.miss) text=`아래를 본 시간이 ${f.down}%로 길었어요. 적어 둔 답을 읽기보다 핵심 낱말 2~3개만 떠올리고, 말할 때는 면접관 얼굴을 보세요.`;
      else if(f.side>=f.miss) text=`옆이나 위를 본 시간이 ${f.side}%예요. 생각할 때 잠깐 보는 건 괜찮지만, 문장을 말하는 동안에는 다시 면접관을 바라보세요.`;
      else text=`얼굴이 화면 밖으로 나간 시간이 ${f.miss}%예요. 카메라 정면에 앉아 주세요.`;
      rows.push({ key:'gaze', name:'시선', score, value:`화면을 본 시간 ${L}% · 아래 ${f.down}% · 옆·위 ${f.side}%`, text });
      }

      if(f.move!=null){
        const m=f.move; let score=m<0.35?5 : m<0.6?4 : m<0.9?3 : m<1.3?2 : 1;
        if(f.center<70) score=Math.max(1,score-1);
        const text = score>=4 && f.center>=70 ? '자세가 안정적이고 화면 가운데에 잘 앉아 있었어요.'
          : f.center<70 ? `얼굴이 화면 가운데에서 벗어난 때가 많았어요(가운데 ${f.center}%). 카메라와 의자 위치를 맞춰 정면에 앉아 보세요.`
          : '고개나 몸을 자주 움직였어요. 등을 의자에 붙이고 손은 무릎 위에 가지런히 두면 차분해 보여요.';
        rows.push({ key:'pose', name:'자세', score, value:`움직임 ${m<0.35?'적음':m<0.9?'보통':'많음'} · 가운데 ${f.center}%`, text });
      }
      {
      const sm=f.smile;
      const score = sm>=15?5 : sm>=5?4 : 3;
      const text = sm>=15 ? '밝은 표정으로 말해 좋은 인상을 줘요.'
        : sm>=5 ? '표정이 차분해요. 첫인사와 마지막 다짐을 말할 때 살짝 웃으면 더 밝아 보여요.'
        : '표정이 조금 굳어 있어요. 긴장해서 그래요. 시작할 때 가볍게 미소 짓고 인사해 보세요.';
      rows.push({ key:'face', name:'표정', score, value:`미소 띤 시간 ${sm}%`, text });
      }
    }
  }
  return rows;
}

/* 한 줄 총평: 가장 좋은 항목과 가장 아쉬운 항목 */
export function talkSummary(rows){
  if(!rows.length) return '';
  const best=[...rows].sort((a,b)=>b.score-a.score)[0], worst=[...rows].sort((a,b)=>a.score-b.score)[0];
  if(worst.score>=4) return '말하기와 태도 모두 안정적이에요. 이대로 실제 면접처럼 몇 번 더 연습해 보세요.';
  if(best.score<=worst.score) return `${worst.name} 항목부터 하나씩 다듬어 봐요.`;
  return `잘한 점은 ${best.name}, 먼저 다듬을 점은 ${worst.name}이에요. 아래 설명대로 한 가지씩 바꿔 보세요.`;
}

/* 평가표 HTML (실전 면접 결과 카드·전체 결과·기록에서 함께 써요) */
export function talkSheetHTML(d, opts={}){
  const rows=talkRows(d);
  if(!rows.length) return '';
  const avg=rows.reduce((t,r)=>t+r.score,0)/rows.length;
  const cls=avg>=4?'g1':avg>=3?'g2':'g3';
  const note = !d.face ? (d.cam==='off'?'카메라를 끄고 해서 시선·자세·표정은 평가하지 않았어요.':d.cam==='noface'?'얼굴을 찾지 못해 시선·자세·표정은 빼고 평가했어요.':d.cam==='unsupported'?'이 기기에서는 시선·자세 분석을 쓸 수 없어 목소리만 평가했어요.':'') : '';
  const dots=n=>Array.from({length:5},(_,i)=>`<i class="${i<n?'f':''}"></i>`).join('');
  return `<div class="sheet talk-sheet${opts.compact?' compact':''}">
    <div class="sheet-top"><div><h4>${esc(opts.title||'말하기·태도 평가표')}<span class="ai-tag">참고용 · 점수에 넣지 않아요</span></h4><p>${esc(talkSummary(rows))}</p>${note?`<p>${esc(note)}</p>`:''}</div>
      ${opts.compact?'':`<div class="stamp ${cls}"><div><b>${avg.toFixed(1)}</b><span>/ 5</span></div></div>`}</div>
    <div class="crit">${rows.map(r=>`<div class="crow talk-row"><span class="cn">${esc(r.name)}</span><span class="dots" aria-label="${r.score}점 / 5점">${dots(r.score)}</span><span class="cc"><b class="tv">${esc(r.value)}</b>${esc(r.text)}</span></div>`).join('')}</div>
  </div>`;
}

/* 여러 답변 평균(실전 면접 전체 결과용) */
export function averageDelivery(list){
  const ds=list.filter(Boolean); if(!ds.length) return null;
  const avg=(k,src=ds)=>{ const v=src.map(d=>d[k]).filter(x=>x!=null); return v.length?v.reduce((a,b)=>a+b,0)/v.length:null; };
  const sum=k=>ds.reduce((t,d)=>t+(d[k]||0),0);
  // 답변 하나당 평균으로 보여 줘요(말버릇·긴 멈춤도 '답변 하나에 평균 몇 번')
  const out={ sec:avg('sec'), limit:null, over:false, latency:avg('latency'), cpm:avg('cpm')!=null?Math.round(avg('cpm')):null,
    fillers:ds.some(d=>d.fillers!=null)?Math.round(sum('fillers')/ds.length*10)/10:null,
    pauses:ds.some(d=>d.pauses!=null)?Math.round(sum('pauses')/ds.length*10)/10:null,
    longPause:Math.max(0,...ds.map(d=>d.longPause||0))||null };
  const words={}; ds.forEach(d=>Object.entries(d.fillerWords||{}).forEach(([w,n])=>{ words[w]=(words[w]||0)+n; })); out.fillerWords=words;
  const fs=ds.map(d=>d.face).filter(Boolean);
  if(fs.length){ const fa=k=>{ const v=fs.map(f=>f[k]).filter(x=>x!=null); return v.length?Math.round(v.reduce((a,b)=>a+b,0)/v.length*100)/100:null; };
    out.face={ look:Math.round(fa('look')), down:Math.round(fa('down')), side:Math.round(fa('side')), miss:Math.round(fa('miss')), center:Math.round(fa('center')), smile:Math.round(fa('smile')), move:fa('move') }; }
  else out.cam=ds[0].cam;
  return out;
}
