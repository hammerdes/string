const devicePixelRatio = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;
export const DPR = Math.min(2, Math.max(1, devicePixelRatio));
export const BOARD_MARGIN = 16;
export function setCanvasSize(canvas, cssSize){
  const dpr = DPR;
  canvas.style.width = cssSize + 'px';
  canvas.style.height = cssSize + 'px';
  canvas.width = Math.floor(cssSize * dpr);
  canvas.height = Math.floor(cssSize * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  return ctx;
}
export function hexToRGBA(hex, a){
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if(!m) return `rgba(255,255,255,${a})`;
  const i = parseInt(m[1],16);
  return `rgba(${(i>>16)&255},${(i>>8)&255},${i&255},${a})`;
}
// IDB blob store
const DB_NAME = 'stringart'; const STORE = 'blobs';
function withDB(mode, fn){
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = ()=>{ const db = req.result; if(!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE); };
    req.onerror = ()=>reject(req.error);
    req.onsuccess = ()=>{
      const db = req.result;
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      Promise.resolve(fn(store)).then(resolve, reject);
      tx.oncomplete = ()=>db.close();
    };
  });
}
export async function idbPutBlob(key, blob){ return withDB('readwrite', s=>s.put(blob, key)); }
export async function idbGetBlob(key){ return withDB('readonly', s=>new Promise((res,rej)=>{ const r = s.get(key); r.onsuccess=()=>res(r.result||null); r.onerror=()=>rej(r.error); })); }
export async function idbDeleteBlob(key){
  if(!key) return;
  return withDB('readwrite', s=>s.delete(key));
}
