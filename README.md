# 면접 대기실: 서울 특성화고 면접 연습 챗봇

2027학년도 서울 특성화고(67개교) 특별전형 면접을 연습하는 챗봇입니다.
GitHub에 올리고 **Vercel**로 배포해 학생들이 같이 쓰도록 만들었어요.

- 화면 뼈대는 `index.html`, 스타일은 `src/styles/`, 스크립트는 `src/` 아래 기능별 파일로 나뉘어 있어요.
- `api/` 폴더의 **서버 함수**가 OpenAI 호출과 학생 기록 저장을 맡아요. API 키는 서버에만 있어요.
- 학생 기록은 **Upstash Redis**(Vercel Marketplace에서 무료로 연결)에 저장돼요.

## 이번에 바뀐 점

| 요청 | 반영 내용 |
| --- | --- |
| 1. 다른 브라우저에서도 기록 불러오기 | 처음 화면 ‘입실 확인’에서 **학번 + 이름 + 비밀번호**로 들어와요. 처음이면 그 비밀번호로 기록이 만들어지고, 다른 기기·브라우저에서도 같은 비밀번호로 수험표 정보, 답변·평가, AI 코치 대화를 이어서 불러와요. 같은 브라우저에서는 30일 동안 자동으로 들어와요. ‘내 기록’ 탭에서 지난 기록을 볼 수 있어요. |
| 2. 교사 대시보드 | 화면 아래 **교사** 버튼(또는 입실 확인 화면의 ‘교사 로그인’) → **학생 대시보드** 탭. 학생별 답변 수·평균·최고 점수·실전 면접·코치 질문 수·최근 접속, 점수 추이와 항목별 평균, 챗봇 대화와 답변·평가 기록 전체, **비밀번호 초기화**(4자리 임시 비밀번호 발급), 학생 삭제, CSV 내려받기 |
| 3. 헤더 클릭 새로고침 | 왼쪽 위 ‘면접 대기실’을 누르면 사이트가 새로고침돼요(로그인은 유지). |
| 4. 실전 면접 탭 | 여성·남성 면접관 그림이 낮고 차분한 목소리로 질문을 읽고(TTS), 소리 크기에 맞춰 입이 움직여요. 카메라·마이크로 답변을 녹화하고, 받아쓰기(STT) 후 바로 채점해요. 말한 시간, 첫 마디까지 걸린 시간, 말 속도(자/분), ‘음·어’ 말버릇도 함께 보여 주고 채점에 반영해요. AI 꼬리질문, 끝난 뒤 한꺼번에 보기, 녹화 파일 저장도 돼요. |

## 1. Vercel에 배포하기 (처음 한 번)

1. **GitHub에 올리기**: 이 폴더 전체를 새 저장소에 올려요. `.env.local`, `node_modules/`, `dist/`는 `.gitignore`에 있어 올라가지 않아요.
2. **Vercel에서 가져오기**: Vercel → **Add New… → Project** → 저장소 선택 → **Deploy**. (Framework는 Vite로 자동 인식돼요. `vercel.json`에 설정이 들어 있어요.)
3. **저장소(Upstash Redis) 연결**: 프로젝트 → **Storage** 탭 → **Upstash** (Redis) → **Create/Connect** → 이 프로젝트에 연결.
   `KV_REST_API_URL`, `KV_REST_API_TOKEN` 환경 변수가 자동으로 들어와요. 무료 요금제로 충분해요.
4. **환경 변수 넣기**: 프로젝트 → **Settings → Environment Variables**

   | 이름 | 값 | 필수 |
   | --- | --- | --- |
   | `OPENAI_API_KEY` | OpenAI API 키 (`sk-proj-…`) | 필수 |
   | `OPENAI_MODEL` | 답변 평가·코치 모델 (기본 `gpt-6.1-terra`) | 선택 |
   | `TEACHER_PASSWORD` | 교사 첫 비밀번호 (없으면 `00000000` + 첫 로그인 때 바꾸기) | 권장 |
   | `OPENAI_TTS_MODEL`, `OPENAI_TTS_VOICE_FEMALE`, `OPENAI_TTS_VOICE_MALE` | 기본 `gpt-4o-mini-tts`, `marin`, `cedar` | 선택 |
   | `OPENAI_STT_MODEL` | 받아쓰기 모델 (기본 `gpt-transcribe`) | 선택 |

5. **다시 배포**: 환경 변수를 넣거나 바꾼 뒤에는 **Deployments → 최근 배포 → Redeploy**를 눌러야 적용돼요.
6. 사이트에 들어가 **교사 로그인**으로 들어가 보세요. 기본 비밀번호(`00000000`)로 들어오면 바로 새 비밀번호를 정하게 돼요. ‘교사·API’ 탭에서 저장소·음성 연결 상태와 ‘연결 확인 요청 보내기’로 AI 연결을 확인할 수 있어요.

> 저장소를 연결하지 않으면 학생 로그인과 교사 모드가 막히고, 학생은 ‘저장 없이 둘러보기’(규칙 기반 평가, 브라우저 음성)만 쓸 수 있어요.

## 2. 내 컴퓨터에서 실행하기

Node.js 20.19 이상(또는 22.12 이상)이 필요해요.

```bash
npm install      # 처음 한 번
npm run dev      # http://localhost:5173 (api/ 서버 함수도 함께 동작)
npm run build    # 배포용 빌드 → dist/index.html
```

- `.env.local`에 `OPENAI_API_KEY=...`를 넣고 `npm run dev`를 다시 시작하세요. (예전 이름 `VITE_OPENAI_API_KEY`는 브라우저 코드에 키가 들어가니 쓰지 마세요.)
- Redis 환경 변수가 없으면 **메모리 저장소**로 동작해요. 서버를 끄면 학생 기록이 사라지는 테스트용이에요.
  Vercel의 Upstash 값을 `.env.local`에 복사해 넣으면 실제 저장소를 써요(`npx vercel env pull .env.local`로 받아도 돼요).

## 3. 학생·교사 사용법

**학생**
- 학번, 이름, 비밀번호(4자 이상)를 입력해요. 처음이면 비밀번호를 한 번 더 입력해 기록을 만들어요.
- 다른 기기에서도 같은 학번·이름·비밀번호로 들어오면 이어서 해요. 수험표 위 **로그아웃**을 누르면 그 컴퓨터에서 기록이 지워져요(공용 컴퓨터에서 꼭 눌러 주세요).
- 비밀번호를 10번 틀리면 5분 동안 잠겨요.

**교사**
- 교사로 들어가면 **학생 대시보드만** 보여요(수험표·학생 메뉴는 숨겨져요). 이 기기에 학생이 로그인해 있었다면 교사 모드를 끝낼 때 다시 열려요.
- **학생 화면 체험**: 대시보드 위쪽에서 가상 학생을 고르고 ‘학생 화면으로 보기’를 누르면, 학생 메뉴(모의면접·실전 면접·내 기록 등)가 열려요. 노란 띠의 ‘교사 대시보드로 돌아가기’로 돌아와요. 가상 학생은 처음에 1명(가상학생1) 자동으로 생기고 ‘가상 학생 추가’로 늘릴 수 있어요. 가상 학생 기록은 통계·CSV에서 빠지고, 학생 입실 화면으로는 들어갈 수 없어요.
- **도움이 필요한 학생**: 대시보드 위쪽에 7일 넘게 접속하지 않음 · 가입 후 2일 넘게 답변 없음 · 평균 60점 미만(답변 3개 이상) · 한 항목 평균 10점 미만인 학생을 모아 보여 줘요. 이름을 누르면 기록이 열려요.
- **학생 대시보드**: 표의 제목을 눌러 정렬, 검색, ‘기록 보기’로 학생별 상세 기록(답변·평가, 실전 면접 받아쓰기·말하기 정보, AI 코치 대화)을 봐요.
- **비밀번호 초기화**: 두 번 누르면 4자리 임시 비밀번호가 나와요(다시 볼 수 없으니 바로 알려 주세요). 학생이 그 번호로 들어오면 새 비밀번호를 정해야 하고, 다른 기기의 로그인은 모두 끝나요.
- **삭제**도 두 번 눌러야 실행돼요. 되돌릴 수 없어요.
- 교사 비밀번호는 서버에 해시로 저장돼 어느 기기에서나 같아요. 잊었다면 Upstash 콘솔(Data Browser)에서 `iv:cfg:teacher` 키를 지우면 처음 비밀번호(`TEACHER_PASSWORD` 또는 `00000000`)로 돌아가요.

## 4. 실전 면접 탭 안내

- **설정**: 질문 수(3·5·7), 질문하는 면접관(번갈아·여성·남성), 답변 제한 시간, 평가표 보기(답변마다·끝난 뒤), 카메라 녹화, 질문 자막.
- **흐름**: 면접관 인사 → 질문(음성) → 화면에 3·2·1 → ‘삐’ 소리 뒤 녹화 시작 → ‘답변 마치기’(또는 제한 시간) → 받아쓰기 → 채점.
- **질문 다시 듣기**: 녹화가 시작되고 말하기 전 5초 동안 ‘질문 다시 듣기’가 보여요. 질문마다 한 번이고, 누르면 그때까지의 녹화는 버리고 처음부터 다시 답해요. 결과 카드에 ‘질문 다시 들음’이 표시돼요.
- 모의면접 탭의 ‘연속 5문항 연습’은 글로 답하는 연속 연습이고, 말로 답하는 실전 연습은 ‘실전 면접’ 탭이에요.
- **면접관 그림**은 직접 그린 SVG 일러스트예요(실제 인물 아님). 재생 중인 소리 크기에 맞춰 입이 움직이고, 눈을 깜박여요.
- **녹화 영상은 학생 기기에만** 남고 서버로 올라가지 않아요. ‘녹화 파일 저장’으로 내려받을 수 있어요. 받아쓰기를 위해 **소리만** 서버를 거쳐 OpenAI로 보내고, 받아쓴 글과 채점 결과는 기록에 저장돼요.
- 카메라·마이크는 **HTTPS**(Vercel 주소)나 `localhost`에서만 켜져요. 처음에 브라우저가 권한을 물으면 ‘허용’을 눌러요.
- **휴대폰 소리**: 마이크는 학생이 답하는 동안에만 켜고 끝나면 바로 꺼요(마이크가 켜져 있으면 휴대폰이 소리를 ‘통화’로 내보내 면접관 목소리가 수화기로 작게 나가거나 안 들려요). 면접관 목소리는 미디어 볼륨으로 나오고, iPhone 무음 스위치가 켜져 있어도 들려요. 처음 ‘면접 시작’을 누를 때 소리 재생이 열려요.
- **휴대폰 화면**: 수험표는 한 줄 요약으로 접히고, 채팅 입력칸·실전 면접 버튼은 화면 아래에 붙어 있어요. 모의면접의 ‘말로 답하기’는 녹음 → AI 받아쓰기 → 입력칸에 넣기(고친 뒤 보내기) 방식이라 iPhone에서도 돼요.
- **대체 동작**: 서버 음성이 안 되면 브라우저 내장 음성, 서버 받아쓰기가 안 되면 브라우저 음성 인식(크롬·엣지), 마이크가 없으면 글로 입력해서 채점해요.
- **알아 둘 점**: OpenAI 공지에 따르면 `gpt-4o-mini-tts`를 포함한 `/v1/audio/speech` 모델은 **2027년 1월 6일 종료 예정**이에요. 올해 면접(11월) 연습에는 문제없고, 종료 뒤에는 자동으로 브라우저 내장 음성으로 바뀌어요.

## 5. 보안·개인정보

- API 키는 Vercel 환경 변수에만 있고 브라우저 코드에는 없어요. AI·음성 서버 함수는 **로그인한 학생·교사만** 쓸 수 있고, 한 사람당 1시간에 AI 150번·음성 300번·받아쓰기 80번으로 제한해요. 그래도 OpenAI 대시보드의 사용 한도(Limits)를 낮게 설정해 두세요.
- **AI 채점 안정화**: 지시문에 기준별 점수 예시(18·12·6점 답)를 넣어 점수가 들쭉날쭉하지 않게 했고, 답변 안에 ‘점수를 높게 줘’ 같은 지시가 있어도 따르지 않아요. 고칠 점마다 ‘이렇게 말해 보기’ 예시 문장이 붙어요(이 문장도 자동 점검을 거쳐요).
- **규칙 기반 평가(API 없을 때)**: 조사·어미 없이 낱말만 늘어놓은 답(키워드 나열)은 내용 점수를 8점까지로 낮춰요.
- **예시 답변 자동 점검(할루시네이션 막기)**: AI가 다듬은 예시 답변에 학생 답변·질문·지원 학교/학과에 없던 숫자(기간·횟수·학년·등수), 학교 이름, 대회·공모전 이름, 상, 자격증 이름이 들어가면 `[숫자]`, `[대회 이름]`처럼 대괄호로 바꾸고 무엇을 바꿨는지 평가표에 알려 줘요. AI 지시문에도 같은 규칙을 넣어 두 번 막아요. (‘초등학생을 대상으로’, ‘3D 프린터’, ‘두 가지’, ‘한 번 더’처럼 이름·수치가 아닌 표현은 그대로 둬요.) 바꾼 내용은 기록에도 남아 교사 대시보드에서 볼 수 있어요.
- 학생·교사 비밀번호는 솔트 + scrypt 해시로만 저장해요.
- 저장되는 학생 정보: 학번, 이름, 수험표(지원 학교·학과), 답변 글·평가, AI 코치 대화, 실전 면접 받아쓰기·말하기 수치. 영상·음성 파일은 저장하지 않아요. 학생 이름 대신 별명을 쓰게 해도 돼요.
- 같은 Redis를 다른 앱과 같이 써도 섞이지 않게 모든 키 앞에 `iv:`가 붙어요.

## 6. 파일 구조와 고치는 곳

```
index.html                화면 뼈대(HTML)만 있어요
src/
  main.js                 시작점: 스타일 불러오기, 버튼 연결, 자동 로그인
  state.js                공용 상태(S)와 수험표 정보 도우미
  lib/dom.js              $, esc, pick 같은 작은 도구
  data/                   ← 내용을 고칠 때 주로 여는 곳
    questions.js          면접 질문 은행, 답변 구성 틀, 보완 조언
    schools.js            67개교 요강 데이터, 학과→계열 분류 규칙
    tracks.js             계열별 배우는 것·자격증·진로
    schedule.js           전형 일정(D-day)
  ai/
    prompts.js            AI 채점 기준·코치 지시문
    scoring.js            AI 채점·코치 대화 호출
    grounding.js          예시 답변 자동 점검
    api.js                서버 함수 호출, 오류 설명, 연결 상태
  feedback/rules.js       API 없이 쓰는 규칙 기반 채점
  chat/chat.js            모의면접 채팅 화면
  ui/ticket.js, tabs.js   수험표, 탭(질문 은행·학교 정보·일정)
  student/auth.js         학생 로그인·기록 저장
  records/records.js      기록 보기(학생·교사 공용)
  teacher/auth.js         교사 로그인
  teacher/dashboard.js    학생 대시보드
  live/                   실전 면접
    interviewers.js       면접관 그림(SVG)·입 모양
    voice.js              면접관 목소리
    media.js              카메라·녹화·받아쓰기
    flow.js               진행 순서·채점·결과 카드
    state.js              실전 면접 상태·안내 문구
  styles/                 base, chat, tabs, admin, login, live, records, dashboard (.css)
api/                      Vercel 서버 함수
  health.js student.js teacher.js ai.js tts.js stt.js
server/                   서버 함수 공통 코드(저장소, 비밀번호 해시, 세션)
vercel.json  vite.config.js
```

| 이런 걸 바꾸려면 | 여기를 고치세요 |
| --- | --- |
| 면접 질문 추가·수정, 예시 답변 | `src/data/questions.js` |
| 학교·학과·정원·배점 | `src/data/schools.js` |
| 전형 일정, D-day | `src/data/schedule.js` |
| AI 채점 기준, 말투, 코치 역할 | `src/ai/prompts.js` |
| 자동 점검 규칙(무엇을 대괄호로 바꿀지) | `src/ai/grounding.js` |
| 면접관 인사말·마무리 말 | `src/live/flow.js` (`liveStart`, `liveEnd`) |
| 면접관 그림 | `src/live/interviewers.js` (`ivSVG`) |
| 면접관 목소리 톤 | `api/tts.js` (`STYLE`) |
| 색·글꼴 | `src/styles/base.css` 맨 위 `:root` |
| AI 모델 | Vercel 환경 변수 `OPENAI_MODEL` (기본값은 `server/openai.js`) |

각 파일 맨 위에 역할이 한 줄로 적혀 있고, 파일끼리는 `import`/`export`로 연결돼요. 고친 뒤 `npm run dev`로 확인하고 GitHub에 올리면 Vercel이 자동으로 다시 배포해요.

## 7. 이 앱이 Responses API를 쓰는 방법

- 브라우저 → `POST /api/ai` → 서버가 키를 붙여 `POST https://api.openai.com/v1/responses`
- 모델: 서버 환경 변수 `OPENAI_MODEL` (기본 `gpt-6.1-terra`). 브라우저가 모델을 바꿀 수 없어요.
  `gpt-6.1-terra`(입력 $1 / 출력 $5, 100만 토큰당)는 `gpt-6.1-sol`의 절반 가격이고, 사실과 다른 답을 지어내는 비율(AA-Omniscience 할루시네이션 지표)도 더 낮아서 기본값으로 정했어요. 답변 1개 채점에 약 20원 정도 들어요(추정).
- `instructions`: 면접관·코치 역할과 지원 학교·학과 정보(요청마다 새로 보냄)
- `input`: 대화 기록 `[{ role, content }]`, 최근 30개
- `text.format`: 답변 평가는 `json_schema`(구조화 출력)로 받아 평가표를 그려요.
- `store: false`, `reasoning: { effort: "low" }`, `max_output_tokens`(서버에서 8000 이하로 제한)
- 응답 텍스트: `output` → `type: "message"` → `content` 중 `type: "output_text"`의 `text`
- ‘교사·API’ 탭에서 서버가 OpenAI로 보낸 요청과 응답 원문을 볼 수 있어요.

## 참고한 문서

- OpenAI Text generation(Responses API): <https://developers.openai.com/api/docs/guides/text>
- OpenAI Structured Outputs: <https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses>
- OpenAI Text to speech: <https://developers.openai.com/api/docs/guides/text-to-speech>
- OpenAI Speech to text: <https://developers.openai.com/api/docs/guides/speech-to-text>
- OpenAI Error codes: <https://developers.openai.com/api/docs/guides/error-codes>
- Vercel Redis(Marketplace): <https://vercel.com/docs/redis>

학교·학과 정보 출처: 서울특별시교육청 진로직업교육과, 「2027학년도 특성화고 신입생 입학전형 요강(1-67)」(2026.8.)

## 8. 면접관을 사실적인 사진·영상으로 바꾸기

지금 `public/interviewers/`에 면접관 사진·영상(가상 인물, 4:5·544×680)이 들어 있어요. 말하는 영상은 원본보다 0.7배, 듣는 영상은 0.85배 느리게 만들었고(중간 장면을 채워 넣어 부드럽게), 앞으로 재생 후 거꾸로 재생해 끊김 없이 반복돼요. 말하는 영상은 실제 목소리가 날 때만 재생되고, 문장 사이에 0.23초 넘게 조용하면 멈춰서 듣는 영상으로 바뀌어요(`src/live/interviewers.js`의 `TALK_ON`, `HOLD_MS`로 조절). 바꾸려면 같은 이름으로 파일을 덮어쓰세요. 사진과 영상의 첫 장면이 같은 구도여야 바뀔 때 튀지 않아요.

`public/interviewers/` 폴더에 아래 파일을 넣고 GitHub에 올리면, 실전 면접 화면의 그림 대신 사진이 나와요. 파일이 없으면 지금의 그림을 그대로 써요.

| 파일 | 내용 | 필요 |
| --- | --- | --- |
| `female.jpg`, `male.jpg` | 면접위원 A(여성)·B(남성) 사진 (.png, .webp도 돼요) | 사진 모드를 켜려면 필요 |
| `female-talk.mp4`, `male-talk.mp4` | 말하는 모습 4~6초 반복 영상 (소리 없음) | 선택 |
| `female-idle.mp4`, `male-idle.mp4` | 듣는 모습(눈 깜박임·숨쉬기) 4~6초 반복 영상 | 선택 |

- 사진만 넣으면: 말하는 면접관에게 빛 테두리가 생기고 소리 크기에 맞춰 사진이 아주 살짝 움직여요. 다른 면접관은 조금 어둡게 보여요.
- 말하는 영상도 넣으면: 질문을 읽는 동안 말하는 영상이 반복 재생돼요. 입 모양이 실제 낱말과 맞지는 않지만, 그림보다 훨씬 실제 면접처럼 보여요.
- 권장 크기: 세로 4:5(예: 800×1000px), 허리 위 정면, 머리 위쪽에 여백 조금. 사진 300KB 안팎, 영상은 H.264 mp4 2MB 이하.
- **실제 인물 사진은 본인 동의 없이 쓰지 마세요.** 이미지 생성 AI로 만든 가상 인물을 권해요. 유명인과 닮게 만들지 마세요.

**사진 만들기 프롬프트 (ChatGPT·Gemini 등 이미지 생성 AI)**: 두 사람을 같은 배경·조명·구도로 맞추면 자연스러워요.

```
여성: Photorealistic portrait photo of a fictional Korean woman in her late 40s, a high school teacher
serving as an admissions interviewer. Neat shoulder-length dark hair, navy blazer over a white blouse,
small earrings, calm and warm but professional expression, looking straight at the camera. Seated behind
a wooden desk, waist-up, centered, small space above the head. Soft office lighting, plain light-gray
wall background. Vertical 4:5, 85mm lens, natural skin texture. No text, no logo, no name tag.

남성: Photorealistic portrait photo of a fictional Korean man in his early 50s, a high school teacher
serving as an admissions interviewer. Short black hair with some gray at the temples, thin-framed glasses,
charcoal suit, white shirt, dark red tie, calm and serious but kind expression, looking straight at the camera.
(나머지는 여성 프롬프트와 같은 배경·조명·구도 문장)
```

**말하는·듣는 영상 만들기 (사진 → 영상 AI 도구)**: 위에서 만든 사진을 넣고,

```
말하는 영상: The person speaks calmly to the camera as if asking an interview question, natural mouth movement,
slight nodding and small head movements, blinking. Static camera, no zoom, same framing. 5 seconds, seamless loop, no audio.

듣는 영상: The person listens quietly, natural blinking and subtle breathing, mouth closed, very small head movement.
Static camera, same framing. 5 seconds, seamless loop, no audio.
```
