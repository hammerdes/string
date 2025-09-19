import { runGreedyLoop } from '../engine.js';
let paused=false, canceled=false;
self.onmessage = async (e)=>{
  const {type, data} = e.data;
  if(type==='run'){
    paused=false; canceled=false;
    const opts = {
      size: data.size,
      fade: data.fade,
      minDist: data.minDist,
      maxSteps: Math.max(1, data.maxSteps|0),
      progressThrottle: 0.02
    };
    const previewStepStride = Math.max(1, Math.round(opts.maxSteps * Math.max(opts.progressThrottle*2, 0.04)));
    let lastPreviewStep = 0;
    let sentPins = false;
    const onProgress = (step, score, steps, pins)=>{
      if(paused||canceled) return;
      const payload = { step, max: opts.maxSteps, score, progress: step/opts.maxSteps };
      const hasPreviewSteps = Array.isArray(steps) && steps.length;
      const shouldSendPreview = hasPreviewSteps && (lastPreviewStep===0 || step - lastPreviewStep >= previewStepStride);
      if(shouldSendPreview){
        payload.steps = steps;
        payload.size = opts.size;
        lastPreviewStep = step;
        if(!sentPins && pins){ payload.pins = pins; sentPins = true; }
      }
      self.postMessage({type:'progress', data: payload});
    };
    const res = await runGreedyLoop(new Uint8ClampedArray(data.raster), data.pins, opts, onProgress);
    if(!canceled) self.postMessage({type:'result', data:{ steps:[0, ...res.steps.map(s=>s.to)], residual:res.residual, durationMs:res.durationMs, pins:res.pins, size:res.size }});
  }else if(type==='pause'){ paused = true; }
  else if(type==='resume'){ paused = false; }
  else if(type==='cancel'){ canceled = true; }
};
