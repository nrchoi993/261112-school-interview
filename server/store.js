/* =========================================================
   저장소: Upstash Redis(REST) 또는 로컬 개발용 메모리 저장소
   - Vercel에서 Storage → Upstash(Redis)를 연결하면 아래 환경 변수가 자동으로 들어와요.
       KV_REST_API_URL / KV_REST_API_TOKEN          (Vercel Marketplace 연결 시)
       UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (Upstash에서 직접 만든 경우)
   - 둘 다 없으면: 내 컴퓨터(npm run dev)에서는 메모리 저장소로 동작하고(서버를 끄면 사라짐),
     Vercel 배포에서는 '저장소 없음'으로 보고 학생 로그인을 막아요.
   - 다른 앱과 같은 Redis를 같이 써도 섞이지 않도록 모든 키 앞에 'iv:'를 붙여요.
   ========================================================= */
const PREFIX = 'iv:';

function redisConf(){
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
  return url && token ? { url: url.replace(/\/+$/,''), token } : null;
}

export function storeMode(){
  if(redisConf()) return 'redis';
  return process.env.VERCEL ? 'none' : 'memory';
}

/* ---------- Upstash REST ---------- */
async function redis(cmd){
  const c = redisConf();
  const r = await fetch(c.url, {
    method:'POST',
    headers:{ Authorization:`Bearer ${c.token}`, 'Content-Type':'application/json' },
    body: JSON.stringify(cmd)
  });
  const j = await r.json().catch(()=>null);
  if(!r.ok || !j || j.error) throw new Error('Redis 오류: ' + (j && j.error || r.status));
  return j.result;
}
async function redisPipe(cmds){
  if(!cmds.length) return [];
  const c = redisConf();
  const r = await fetch(c.url + '/pipeline', {
    method:'POST',
    headers:{ Authorization:`Bearer ${c.token}`, 'Content-Type':'application/json' },
    body: JSON.stringify(cmds)
  });
  const j = await r.json().catch(()=>null);
  if(!r.ok || !Array.isArray(j)) throw new Error('Redis 오류: ' + (j && j.error || r.status));
  const bad = j.find(x=>x && x.error);
  if(bad) throw new Error('Redis 오류: ' + bad.error);
  return j.map(x=>x.result);
}

/* ---------- 메모리 저장소 (로컬 개발용) ---------- */
const MEM = globalThis.__ivMemStore || (globalThis.__ivMemStore = { kv:new Map(), exp:new Map() });
function alive(k){
  const e = MEM.exp.get(k);
  if(e && e <= Date.now()){ MEM.kv.delete(k); MEM.exp.delete(k); return false; }
  return MEM.kv.has(k);
}
function memCmd([op, k, ...a]){
  op = String(op).toUpperCase();
  const has = k!==undefined && alive(k);
  const v = has ? MEM.kv.get(k) : undefined;
  switch(op){
    case 'GET': return has ? v : null;
    case 'SET': {
      MEM.kv.set(k, String(a[0])); MEM.exp.delete(k);
      const i = a.findIndex(x=>String(x).toUpperCase()==='EX');
      if(i>=0) MEM.exp.set(k, Date.now() + Number(a[i+1])*1000);
      return 'OK';
    }
    case 'DEL': { let n=0; for(const key of [k,...a]){ if(alive(key)){ MEM.kv.delete(key); MEM.exp.delete(key); n++; } } return n; }
    case 'INCR': { const n = (has ? Number(v) : 0) + 1; MEM.kv.set(k, String(n)); return n; }
    case 'EXPIRE': { if(!has) return 0; MEM.exp.set(k, Date.now() + Number(a[0])*1000); return 1; }
    case 'TTL': { if(!has) return -2; const e = MEM.exp.get(k); return e ? Math.ceil((e-Date.now())/1000) : -1; }
    case 'HSET': { const h = has ? v : new Map(); for(let i=0;i<a.length;i+=2) h.set(String(a[i]), String(a[i+1])); MEM.kv.set(k,h); return 1; }
    case 'HGET': return has && v.has(String(a[0])) ? v.get(String(a[0])) : null;
    case 'HDEL': { if(!has) return 0; let n=0; for(const f of a) if(v.delete(String(f))) n++; return n; }
    case 'HGETALL': return has ? [...v.entries()].flat() : [];
    case 'RPUSH': { const l = has ? v : []; l.push(...a.map(String)); MEM.kv.set(k,l); return l.length; }
    case 'LLEN': return has ? v.length : 0;
    case 'LRANGE': {
      if(!has) return [];
      const n=v.length; let s=Number(a[0]), e=Number(a[1]);
      if(s<0) s=Math.max(0,n+s); if(e<0) e=n+e; e=Math.min(e,n-1);
      return s>e ? [] : v.slice(s,e+1);
    }
    case 'LTRIM': {
      if(!has) return 'OK';
      const n=v.length; let s=Number(a[0]), e=Number(a[1]);
      if(s<0) s=Math.max(0,n+s); if(e<0) e=n+e; e=Math.min(e,n-1);
      MEM.kv.set(k, s>e ? [] : v.slice(s,e+1)); return 'OK';
    }
    default: throw new Error('메모리 저장소가 지원하지 않는 명령: ' + op);
  }
}

/* ---------- 공통 인터페이스 ---------- */
function run(cmd){
  const mode = storeMode();
  if(mode==='redis') return redis(cmd);
  if(mode==='memory') return Promise.resolve(memCmd(cmd));
  return Promise.reject(Object.assign(new Error('저장소가 연결되지 않았어요.'), { code:'nostore' }));
}
function pipe(cmds){
  const mode = storeMode();
  if(mode==='redis') return redisPipe(cmds);
  if(mode==='memory') return Promise.resolve(cmds.map(memCmd));
  return Promise.reject(Object.assign(new Error('저장소가 연결되지 않았어요.'), { code:'nostore' }));
}
const K = k => PREFIX + k;
const parse = s => { if(s==null) return null; try{ return JSON.parse(s); }catch(e){ return null; } };

export const db = {
  async getJSON(k){ return parse(await run(['GET', K(k)])); },
  async setJSON(k, v, ex){ return run(ex ? ['SET', K(k), JSON.stringify(v), 'EX', ex] : ['SET', K(k), JSON.stringify(v)]); },
  async get(k){ return run(['GET', K(k)]); },
  async set(k, v, ex){ return run(ex ? ['SET', K(k), String(v), 'EX', ex] : ['SET', K(k), String(v)]); },
  async del(...ks){ return run(['DEL', ...ks.map(K)]); },
  async incr(k, ex){ const n = Number(await run(['INCR', K(k)])); if(ex && n===1) await run(['EXPIRE', K(k), ex]); return n; },
  async ttl(k){ return run(['TTL', K(k)]); },
  async hsetJSON(k, field, v){ return run(['HSET', K(k), field, JSON.stringify(v)]); },
  async hgetJSON(k, field){ return parse(await run(['HGET', K(k), field])); },
  async hdel(k, field){ return run(['HDEL', K(k), field]); },
  async hgetallJSON(k){
    const flat = await run(['HGETALL', K(k)]) || [];
    const out = {};
    if(Array.isArray(flat)) for(let i=0;i<flat.length;i+=2) out[flat[i]] = parse(flat[i+1]);
    else for(const [f,v] of Object.entries(flat)) out[f] = parse(v);
    return out;
  },
  async rpushJSON(k, items, keepLast){
    const cmds = [['RPUSH', K(k), ...items.map(x=>JSON.stringify(x))]];
    if(keepLast) cmds.push(['LTRIM', K(k), -keepLast, -1]);
    return pipe(cmds);
  },
  async lrangeJSON(k, s, e){ return (await run(['LRANGE', K(k), s, e]) || []).map(parse).filter(Boolean); },
  async llen(k){ return run(['LLEN', K(k)]); }
};
