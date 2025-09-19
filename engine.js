export function initEngine(config){ return new EngineCore(config); }
const BOARD_MARGIN = 16;
export class EngineCore{
  constructor(cfg){
    this.size = cfg.size|0;
    this.fade = cfg.fade|0;
    this.minDist = cfg.minDist|0;
    this.nrPins = cfg.pins|0;
    this.raster = toGrayArray(cfg.raster, this.size);
    this.residual = new Float32Array(this.size*this.size);
    this.residual.set(this.raster);
    this.pins = circlePins(this.size, this.nrPins);
    this.lines = new Map();
    this.usedPairs = new Set();
    this.steps = [];
    this.current = 0;
    if(this.nrPins>0) this.steps.push(0);
  }
  getLine(ai, bi){
    const k = ai<bi ? ai+'-'+bi : bi+'-'+ai;
    const hit = this.lines.get(k);
    if(hit) return hit;
    const a = this.pins[ai], b = this.pins[bi];
    let x0=a.x, y0=a.y, x1=b.x, y1=b.y;
    const dx = Math.abs(x1-x0), dy = Math.abs(y1-y0);
    const sx = x0<x1 ? 1 : -1;
    const sy = y0<y1 ? 1 : -1;
    let err = dx - dy;
    const out = [];
    while(true){
      out.push(x0, y0);
      if (x0===x1 && y0===y1) break;
      const e2 = err<<1;
      if (e2 > -dy){ err -= dy; x0 += sx; }
      if (e2 <  dx){ err += dx; y0 += sy; }
    }
    const arr = Int32Array.from(out);
    this.lines.set(k, arr);
    return arr;
  }
  lineScore(ai, bi){
    const pts = this.getLine(ai, bi);
    const w = this.size; let s = 0;
    for(let i=0;i<pts.length;i+=2){
      const x = pts[i], y = pts[i+1];
      const xi = x<0?0:(x>=w?w-1:x);
      const yi = y<0?0:(y>=w?w-1:y);
      s += (255 - this.residual[yi*w + xi]);
    }
    return s / (pts.length/2);
  }
  reduceLine(ai, bi){
    const pts = this.getLine(ai, bi);
    const w = this.size;
    for(let i=0;i<pts.length;i+=2){
      const x = pts[i], y = pts[i+1];
      const xi = x<0?0:(x>=w?w-1:x);
      const yi = y<0?0:(y>=w?w-1:y);
      this.residual[yi*w + xi] = Math.min(255, this.residual[yi*w + xi] + this.fade);
    }
  }
  nextPin(curr){
    let best=-1, bestScore=0;
    for(let i=0;i<this.nrPins;i++){
      if(i===curr) continue;
      const d = Math.abs(i-curr);
      const minWrap = Math.min(d, this.nrPins-d);
      if(minWrap < this.minDist) continue;
      const k = curr<i ? curr+'-'+i : i+'-'+curr;
      if(this.usedPairs.has(k)) continue;
      const s = this.lineScore(curr,i);
      if(s > bestScore){ bestScore = s; best = i; }
    }
    return {pin: best, score: bestScore};
  }
  step(){
    const {pin:next, score} = this.nextPin(this.current);
    if(next<0) return null;
    const prevRes = this.residualSum();
    this.usedPairs.add(this.current<next ? this.current+'-'+next : next+'-'+this.current);
    this.reduceLine(this.current, next);
    const afterRes = this.residualSum();
    const delta = afterRes - prevRes;
    const step = { i: this.steps.length, from: this.current, to: next, score, deltaError: delta };
    this.steps.push(next);
    this.current = next;
    return step;
  }
  residualSum(){ let s=0; const R=this.residual; for(let i=0;i<R.length;i++) s+=R[i]; return s; }
}
function circlePins(size, n){
  const cx=size/2, cy=size/2, R=(size/2)-BOARD_MARGIN;
  const out = new Array(n), step = Math.PI*2/n;
  for(let i=0;i<n;i++){ const ang=i*step; out[i] = { id:i, x: Math.round(cx + R*Math.cos(ang)), y: Math.round(cy + R*Math.sin(ang)) }; }
  return out;
}
function toGrayArray(src, size){
  if(src instanceof ImageData){
    const a = new Float32Array(size*size); const d = src.data;
    for(let i=0,j=0;i<d.length;i+=4,j++) a[j]=d[i]; return a;
  }
  if(src instanceof Uint8Array || src instanceof Uint8ClampedArray){ return Float32Array.from(src, v=>v); }
  throw new Error('Unsupported raster format');
}
export async function runGreedyLoop(imageData, pins, options, onProgress){
  const t0 = performance.now();
  const engine = new EngineCore({ size: options.size, fade: options.fade, minDist: options.minDist, pins, raster: imageData });
  const maxSteps = options.maxSteps|0;
  const steps = []; let lastProgress = 0;
  const yieldStride = options.yieldStride|0;
  for(let k=0;k<maxSteps;k++){
    if(options.shouldCancel && options.shouldCancel()) break;
    if(options.waitWhilePaused) await options.waitWhilePaused();
    if(options.shouldCancel && options.shouldCancel()) break;
    const st = engine.step(); if(!st) break;
    steps.push(st);
    const p = (k+1)/maxSteps;
    if(onProgress && p - lastProgress >= (options.progressThrottle||0.02)){
      lastProgress = p;
      onProgress(k+1, st.score, engine.steps.slice(), engine.pins);
    }
    if(options.yieldToQueue && yieldStride>0 && ((k+1)%yieldStride)===0){
      await options.yieldToQueue();
      if(options.shouldCancel && options.shouldCancel()) break;
    }
  }
  const t1 = performance.now();
  return { steps, residual: engine.residualSum(), durationMs: Math.round(t1-t0), pins: engine.pins, size: engine.size };
}
