/* 예시 답변 자동 점검(학생이 말하지 않은 숫자·이름을 대괄호로) */
import { SCHOOLS } from '../data/schools.js';
import { esc } from '../lib/dom.js';
import { fill, S, schoolName } from '../state.js';

/* =========================================================
   예시 답변 자동 점검 (할루시네이션 막기)
   AI가 다듬은 예시 답변(improved_answer)에 학생 답변·질문·지원 정보에 없던
   숫자(기간·횟수·학년·등수), 학교 이름, 대회·공모전 이름, 상, 자격증 이름이 들어 있으면
   그 부분을 [숫자], [학교 이름]처럼 대괄호로 바꾸고 무엇을 바꿨는지 알려 줘요.
   ========================================================= */
export const KO_NUM={한:1,두:2,세:3,네:4,다섯:5,여섯:6,일곱:7,여덟:8,아홉:9,열:10,스무:20};
export const NUM_UNIT='년|개월|달|해|주일|주|일|시간|분|번|회|명|개|권|등|위|살|학년|학기|기|차|점|곳|편|위|장|곡|대';
export const UNIT_NORM={달:'개월',해:'년',회:'번',주일:'주'};
export const NUM_RE=new RegExp(`(?<![가-힣0-9.])(?:(\\d+(?:[.,]\\d+)?)\\s*(${NUM_UNIT})?|(한|두|세|네|다섯|여섯|일곱|여덟|아홉|열|스무)\\s?(${NUM_UNIT}))(?![A-Za-z]|째|[가-힣]*가지)`,'g');
export const GENERIC_MOD=new Set(['교내','학교','지역','전국','각종','여러','다양한','큰','작은','이','그','저','어떤','관련','같은','한','첫','처음','이번','작년','올해','여러가지','많은','다른','온라인','외부','교외']);
export const PARTICLE_END=/(에서|에게|에|을|를|이|가|은|는|도|와|과|로|으로|의|하고|하며|했던|하는|한|던|며|고|서|께)$/;
export const CONTEST_SUF='경진대회|대회|공모전|올림피아드|챌린지|해커톤|콘테스트|페스티벌|박람회';
export const AWARD_RE=/(최우수상|우수상|장려상|특별상|인기상|대상|금상|은상|동상|상장|입상|수상)/g;
export const AWARD_AMBIG=/^(대상|금상|은상|동상)$/;            // '대상으로', '동상(조각)'처럼 다른 뜻도 있어서 '받다·수상' 근처일 때만 봐요
export const ADNOMINAL=/(던|린|른|운|간|된|할|난|친|어|아|여|해|워|면|지|게|니|다|요|고)$/;   // '열린 대회', '만들어 대회'처럼 꾸미거나 이어 주는 말은 이름이 아니에요
export const CERT_RE=/([가-힣A-Za-z0-9]{2,15}(?:산업기사|기능사|자격증|마스터|관리사|검정)|ITQ|GTQ|컴활|컴퓨터활용능력|TOEIC|토익|한국사능력검정)/g;
export const SCHOOL_SUF_RE=/([가-힣A-Za-z]{2,15})(초등학교|중학교|고등학교|대학교)/g;
export const GENERIC_SCHOOL=/^(우리|저희|귀|본|이|그|해당|같은|다른|특성화|일반|전문|마이스터|인문계|원하는|지원한|희망하는|좋은)$/;

export function groundImproved(text, student, q){
  if(!text) return { text, flags:[] };
  const nosp=s=>String(s||'').replace(/\s+/g,'');
  const ctx=[student, q?fill(q.q):'', schoolName(), S.profile.dept].join(' ');
  const ctxN=nosp(ctx);
  const spans=[];
  const brackets=[...text.matchAll(/\[[^\]\n]{0,40}\]/g)].map(m=>[m.index,m.index+m[0].length]);   // AI가 이미 비워 둔 [ ]는 건드리지 않아요
  const add=(s,e,label,orig)=>{ if(brackets.some(([a,b])=>s<b&&e>a)) return; spans.push({s,e,label,orig:orig||text.slice(s,e)}); };

  // 1) 숫자: 값+단위가 학생 답변(또는 질문)에 없으면 [숫자]로
  const numKeys=src=>{ const out=new Set(); for(const m of String(src).matchAll(NUM_RE)){ const v=m[1]?parseFloat(m[1].replace(',','')):KO_NUM[m[3]]; const u=UNIT_NORM[m[2]||m[4]]||m[2]||m[4]||''; out.add(v+'|'+u); out.add(v+'|'); } return out; };
  const okNums=numKeys(ctx);
  for(const m of text.matchAll(NUM_RE)){
    const v=m[1]?parseFloat(m[1].replace(',','')):KO_NUM[m[3]];
    const u=UNIT_NORM[m[2]||m[4]]||m[2]||m[4]||'';
    if(m[3]==='한' && !/^(개월|년|학기|주)$/.test(u)) continue;                // '한 번 더', '한 명의 학생으로서' 같은 말은 빼요
    if(okNums.has(v+'|'+u)) continue;
    if(!u && okNums.has(v+'|')) continue;
    if(u==='학년' && v<=3 && q && ['학업계획','진로'].includes(q.cat)) continue;   // 고교 1~3학년 계획은 구성 틀이라 허용
    add(m.index, m.index+m[0].length, '[숫자]');
  }

  // 2) 학교 이름: 67개교 이름 + "○○중학교/고등학교" 형태
  const mySchool=schoolName(), myStem=mySchool.replace(/(고등학교|고)$/,'');
  const known=SCHOOLS.map(s=>s.n).sort((a,b)=>b.length-a.length);
  for(const n of known){
    const stem=n.replace(/고$/,''), re=new RegExp(`${stem.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(고등학교|고)`,'g');
    for(const m of text.matchAll(re)){
      if(stem===myStem || ctxN.includes(nosp(m[0])) || ctxN.includes(stem)) continue;
      add(m.index, m.index+m[0].length, '[학교 이름]');
    }
  }
  for(const m of text.matchAll(SCHOOL_SUF_RE)){
    const pre=m[1];
    if(GENERIC_SCHOOL.test(pre)) continue;
    if(pre===myStem || ctxN.includes(nosp(m[0])) || ctxN.includes(pre)) continue;
    add(m.index, m.index+m[0].length, '[학교 이름]');
  }

  // 3) 대회·공모전: 이름의 핵심 낱말이 학생 답변에 없으면 [대회 이름], 학생이 대회 이야기를 안 했으면 [대회 경험]
  const studentHasContest=new RegExp(CONTEST_SUF).test(student);
  for(const m of text.matchAll(new RegExp(`(${CONTEST_SUF})`,'g'))){
    let s=m.index;
    // 붙어 있는 앞말(예: 정보올림피아드의 '정보')과 바로 앞 낱말 2개까지 이름으로 봐요
    while(s>0 && /[가-힣A-Za-z0-9·]/.test(text[s-1])) s--;
    const attached=text.slice(s,m.index);
    const words=[]; let k=s;
    for(let w=0; w<2; w++){
      const before=text.slice(0,k).match(/([가-힣A-Za-z0-9·]+)\s+$/);
      if(!before || (PARTICLE_END.test(before[1])||ADNOMINAL.test(before[1])) && !GENERIC_MOD.has(before[1])) break;
      words.unshift(before[1]); k-=before[0].length;
    }
    const content=[...words, attached].filter(w=>w && !GENERIC_MOD.has(w));
    const grounded = content.length ? content.every(w=>ctxN.includes(nosp(w))) : studentHasContest;
    if(grounded) continue;
    const start = k;
    add(start, m.index+m[0].length, content.length?'[대회 이름]':'[대회 경험]');
  }

  // 4) 상: 학생이 말하지 않은 수상 내용
  const studentAward=/(상을\s?받|수상|입상|상장|[대금은동]상|우수상|장려상)/.test(student);
  for(const m of text.matchAll(AWARD_RE)){
    if(ctxN.includes(m[0])) continue;
    if(AWARD_AMBIG.test(m[0]) && !/^\s?(을|이)?\s?(받|수상|탔|차지)/.test(text.slice(m.index+m[0].length, m.index+m[0].length+8))) continue;
    if((m[0]==='수상'||m[0]==='입상'||m[0]==='상장') && studentAward) continue;
    add(m.index, m.index+m[0].length, '[수상 내용]');
  }

  // 5) 자격증: 학생이 말하지 않은 자격증 이름 ("자격증"이라는 일반 낱말은 허용)
  for(const m of text.matchAll(CERT_RE)){
    const t=m[0];
    if(/^(자격증|검정)$/.test(t) || /^(관련|각종|여러|다양한|필요한|전문|국가|기초|원하는|해당)/.test(t) && /자격증$/.test(t)) continue;
    if(ctxN.includes(nosp(t)) || ctxN.includes(t.replace(/자격증$/,''))) continue;
    add(m.index, m.index+t.length, '[자격증 이름]');
  }

  if(!spans.length) return { text, flags:[] };
  // 겹치는 부분은 먼저 시작하고 더 긴 것 하나만 남겨요
  spans.sort((a,b)=>a.s-b.s || (b.e-b.s)-(a.e-a.s));
  const keep=[]; let end=-1;
  for(const sp of spans){ if(sp.s>=end){ keep.push(sp); end=sp.e; } }
  let out='', i=0;
  for(const sp of keep){ out+=text.slice(i,sp.s)+sp.label; i=sp.e; }
  out+=text.slice(i);
  return { text: out, flags: keep.map(sp=>({ orig: sp.orig.trim(), label: sp.label })) };
}
/* 예시 답변 화면 표시: [대괄호] 부분을 눈에 띄게 */
export function phHTML(t){ return esc(t).replace(/\[([^\]\n]{1,30})\]/g,'<mark class="ph">[$1]</mark>'); }
export function groundNoteHTML(flags){
  if(!flags||!flags.length) return '';
  const list=flags.slice(0,6).map(f=>typeof f==='string'?`‘${esc(f)}’`:`‘${esc(f.orig)}’ → ${esc(f.label)}`).join(', ');
  return `<p class="ground-note"><b>자동 점검</b> AI가 내 답변에 없던 내용을 넣어서 대괄호로 바꿨어요: ${list}${flags.length>6?' 등':''}. 실제로 겪은 일이 있을 때만 직접 채워 넣으세요.</p>`;
}
