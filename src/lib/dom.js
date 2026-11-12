/* 화면 도구: $(선택자), esc(HTML 이스케이프), pick(무작위 고르기) */
export const $ = s=>document.querySelector(s);
export const esc = s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const pick = a=>a[Math.floor(Math.random()*a.length)];
