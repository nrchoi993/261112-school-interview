import { defineConfig, loadEnv } from 'vite';

// 화면 뼈대는 index.html, 스타일은 src/styles/, 스크립트는 src/ 아래 기능별 모듈로 나뉘어 있어요.
// npm run build 하면 Vite가 dist/에 묶어 줘요(Vercel이 배포할 때 자동으로 실행).
//
// api/ 폴더의 서버 함수는 Vercel이 배포할 때 따로 실행해요.
// 내 컴퓨터에서 npm run dev 할 때도 똑같이 동작하도록, 아래 플러그인이 /api/* 요청을 api/*.js로 넘겨 줘요.
function localApi(){
  return {
    name: 'local-vercel-api',
    configureServer(server){
      server.middlewares.use(async (req, res, next) => {
        const m = req.url && req.url.match(/^\/api\/([a-z]+)(?:\?|$)/);
        if(!m) return next();
        try{
          const mod = await server.ssrLoadModule(`/api/${m[1]}.js`);
          await mod.default(req, res);
        }catch(e){
          console.error(e);
          if(!res.headersSent){ res.statusCode = 404; res.end(JSON.stringify({ ok:false, error:{ code:'notfound', message:String(e.message||e) } })); }
        }
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  // .env.local의 값(OPENAI_API_KEY 등)을 로컬 서버 함수에서 쓸 수 있게 process.env에 넣어요.
  // VITE_로 시작하지 않는 값은 브라우저 코드에 들어가지 않아요.
  const env = loadEnv(mode, process.cwd(), '');
  for(const [k, v] of Object.entries(env)) if(process.env[k] === undefined) process.env[k] = v;
  return {
    plugins: [localApi()],
    server: { open: true }
  };
});
