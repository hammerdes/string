import { runGreedyLoop } from '../engine.js';
let paused=false, canceled=false;
self.onmessage = async (e)=>{
  const {type, data} = e.data;
  if(type==='run'){
    paused=false; canceled=false;
    const opts = { size:data.size, fade:data.fade, minDist:data.minDist, maxSteps:data.maxSteps, progressThrottle:0.02 };
    const onProgress=(step,score)=>{ if(paused||canceled) return; self.postMessage({type:'progress', data:{step, max:opts.maxSteps, score, progress: step/opts.maxSteps}}); };
    const res = await runGreedyLoop(new Uint8ClampedArray(data.raster), data.pins, opts, onProgress);
    if(!canceled) self.postMessage({type:'result', data:{ steps:[0, ...res.steps.map(s=>s.to)], residual:res.residual, durationMs:res.durationMs, pins:res.pins, size:res.size }});
  }else if(type==='pause'){ paused = true; }
  else if(type==='resume'){ paused = false; }
  else if(type==='cancel'){ canceled = true; }
};
