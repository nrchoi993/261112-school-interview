/* 얼굴 분석(MediaPipe) 실행 파일(wasm)을 public/mediapipe/wasm/으로 복사해요.
   npm run dev / npm run build 할 때 자동으로 실행돼요(package.json의 predev·prebuild).
   파일이 커서(약 26MB) GitHub에는 올리지 않고(.gitignore), Vercel이 빌드할 때마다 node_modules에서 복사해요.
   브라우저는 기기에 맞는 파일 하나(약 13MB)만 받아요. */
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const dst = join(root, 'public', 'mediapipe', 'wasm');
const files = ['vision_wasm_internal.js', 'vision_wasm_internal.wasm', 'vision_wasm_nosimd_internal.js', 'vision_wasm_nosimd_internal.wasm'];

if (!existsSync(src)) { console.warn('[mediapipe] node_modules에 @mediapipe/tasks-vision이 없어요. npm install을 먼저 하세요.'); process.exit(0); }
mkdirSync(dst, { recursive: true });
for (const f of files) copyFileSync(join(src, f), join(dst, f));
console.log('[mediapipe] 얼굴 분석 실행 파일을 public/mediapipe/wasm/으로 복사했어요.');
