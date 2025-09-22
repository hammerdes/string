import * as State from './state.js';
import { setCanvasSize, BOARD_MARGIN } from './utils.js';
import { renderPinsAndStrings, exportSVG, exportCSV } from './renderer.js';

const EXPORT_SIZE = 1440;

let crop = { img:null, scale:1, tx:0, ty:0, rot:0, down:false, lx:0, ly:0, displaySize:0 };

const viewerState = {
  steps: [],
  current: 0,
  max: 0,
  playing: false,
  timer: null,
  speeds: [3000, 1500, 750, 300],
  speedIndex: 0,
  voice: false,
  pinCount: 0
};

function setViewerSteps(steps, pinCount){
  stopPlayback();
  viewerState.steps = Array.isArray(steps) ? steps.filter(n=>Number.isFinite(n)) : [];
  viewerState.pinCount = Number.isFinite(pinCount) ? pinCount : 0;
  viewerState.max = viewerState.steps.length>0 ? viewerState.steps.length-1 : 0;
  viewerState.current = viewerState.steps.length>0 ? viewerState.max : 0;
  updateProgressUI();
  updateControlsState();
  updateSpeedLabel();
  updateVoiceButton();
  updatePlayButton();
  return viewerState.steps.length>0;
}

function updateProgressUI(){
  const label = document.getElementById('e4-progress-label');
  const fill = document.getElementById('e4-progress-fill');
  const bar = document.querySelector('.e4-progress-bar');
  const total = viewerState.steps.length;
  const current = total>0 ? viewerState.current+1 : 0;
  if(label){
    label.textContent = total>0 ? current + ' / ' + total : '0 / 0';
  }
  if(fill){
    const pct = total>0 ? (current/total)*100 : 0;
    fill.style.width = pct.toFixed(1) + '%';
  }
  if(bar){
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', String(total));
    bar.setAttribute('aria-valuenow', String(current));
  }
  updateStepCell('e4-prev-pin', viewerState.steps[viewerState.current-1]);
  updateStepCell('e4-current-pin', viewerState.steps[viewerState.current]);
  updateStepCell('e4-next-pin', viewerState.steps[viewerState.current+1]);
}

function updateStepCell(id, value){
  const cell = document.getElementById(id);
  if(!cell) return;
  const valueEl = cell.querySelector('[data-value]');
  const placeholderEl = cell.querySelector('[data-placeholder]');
  if(Number.isFinite(value)){
    if(valueEl){ valueEl.hidden = false; valueEl.textContent = value; }
    if(placeholderEl){ placeholderEl.hidden = true; }
  } else {
    if(valueEl){ valueEl.hidden = true; valueEl.textContent = ''; }
    if(placeholderEl){ placeholderEl.hidden = false; }
  }
}

function updateControlsState(){
  const hasSteps = viewerState.steps.length>0;
  setDisabled('e4-first', !hasSteps || viewerState.current<=0);
  setDisabled('e4-prev', !hasSteps || viewerState.current<=0);
  setDisabled('e4-next', !hasSteps || viewerState.current>=viewerState.max);
  setDisabled('e4-last', !hasSteps || viewerState.current>=viewerState.max);
  setDisabled('e4-play', !hasSteps);
  setDisabled('e4-speed', !hasSteps);
  setDisabled('e4-step-jump', !hasSteps);
  setDisabled('e4-voice', !hasSteps);
}

function setDisabled(id, disabled){
  const el = document.getElementById(id);
  if(el) el.disabled = disabled;
}

function updateSpeedLabel(){
  const btn = document.getElementById('e4-speed');
  if(!btn) return;
  const ms = viewerState.speeds[viewerState.speedIndex] || 1000;
  const secs = ms / 1000;
  const label = secs >= 1 ? ((Number.isInteger(secs) ? secs.toFixed(0) : secs.toFixed(1)) + 's') : (ms + 'ms');
  btn.textContent = 'Speed ' + label;
}

function updatePlayButton(){
  const btn = document.getElementById('e4-play');
  if(!btn) return;
  btn.textContent = viewerState.playing ? 'Pause' : 'Play';
  btn.setAttribute('aria-pressed', viewerState.playing ? 'true' : 'false');
}

function updateVoiceButton(){
  const btn = document.getElementById('e4-voice');
  if(!btn) return;
  btn.textContent = viewerState.voice ? 'Voice On' : 'Voice Off';
  btn.setAttribute('aria-pressed', viewerState.voice ? 'true' : 'false');
}

function toggleVoice(){
  viewerState.voice = !viewerState.voice;
  updateVoiceButton();
}

function startPlayback(){
  if(viewerState.steps.length===0) return;
  if(viewerState.current>=viewerState.max){
    goToStep(0);
  }
  viewerState.playing = true;
  updatePlayButton();
  schedulePlayback();
}

function stopPlayback(){
  if(viewerState.timer){
    clearTimeout(viewerState.timer);
    viewerState.timer = null;
  }
  if(viewerState.playing){
    viewerState.playing = false;
    updatePlayButton();
  }
}

function togglePlayback(){
  if(viewerState.playing){
    stopPlayback();
  } else {
    startPlayback();
  }
}

function schedulePlayback(){
  if(viewerState.timer){
    clearTimeout(viewerState.timer);
    viewerState.timer = null;
  }
  if(!viewerState.playing) return;
  const delay = viewerState.speeds[viewerState.speedIndex] || 1000;
  viewerState.timer = setTimeout(()=>{
    if(viewerState.current>=viewerState.max){
      stopPlayback();
      return;
    }
    goToStep(viewerState.current+1);
    schedulePlayback();
  }, delay);
}

function cycleSpeed(){
  viewerState.speedIndex = (viewerState.speedIndex + 1) % viewerState.speeds.length;
  updateSpeedLabel();
  if(viewerState.playing){
    schedulePlayback();
  }
}

function goToStep(step){
  if(viewerState.steps.length===0){
    viewerState.current = 0;
    clearViewer();
    updateProgressUI();
    updateControlsState();
    return;
  }
  const clamped = Math.max(0, Math.min(step, viewerState.max));
  viewerState.current = clamped;
  drawViewer(clamped);
  updateProgressUI();
  updateControlsState();
}

function clearViewer(){
  const canvas = document.getElementById('viewer-canvas');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  if(ctx) ctx.clearRect(0,0,canvas.width,canvas.height);
}

export function mount(){
  document.querySelectorAll('header nav [data-nav]').forEach(b=>{ b.addEventListener('click', ()=>State.go(+b.dataset.nav)); });
  const file = document.getElementById('e1-file'); file.addEventListener('change', onPickImage);
  refreshProjectList(); bindCrop(); bindGenerate(); bindViewer();
}

function refreshProjectList(){
  const ul = document.getElementById('project-list'); ul.innerHTML = '';
  State.listProjects().forEach(p=>{
    const li=document.createElement('li');
    li.innerHTML=`<span>${p.name}</span><span class="tiny">${new Date(p.updatedAt).toLocaleString()}</span>`;
    li.addEventListener('click', ()=>{ State.setProject(p); hydrateProjectView(); State.go(3); });
    ul.appendChild(li);
  });
}

function hydrateProjectView(){
  const p = State.get().project;
  if(!p) return;

  const params = p.params || {};
  const setValue = (id, value)=>{
    if(value===undefined || value===null) return;
    const el = document.getElementById(id);
    if(!el) return;
    el.value = value;
  };

  setValue('p-pins', params.pins);
  setValue('p-steps', params.strings);
  if('minAngle' in params) setValue('p-angle', params.minAngle);
  else if('angle' in params) setValue('p-angle', params.angle);
  setValue('p-mindist', params.minDist);
  setValue('p-fade', params.fade);
  setValue('p-seed', params.seed);
  setValue('p-width', params.widthPx);
  setValue('p-alpha', params.alpha);
  setValue('p-color', params.color);
  setValue('p-board', params.board);

  const renderCanvas=document.getElementById('render-canvas');
  const viewerCanvas=document.getElementById('viewer-canvas');

  const stepsCSV=(p.stepsCSV||'').trim();
  const steps=stepsCSV ? stepsCSV.split(',').map(s=>Number(s)).filter(n=>Number.isFinite(n)) : [];
  const pinsValue = params.pins ?? (document.getElementById('p-pins')?.value);
  const pinCount = Number(pinsValue);
  const hasPins = Number.isFinite(pinCount) && pinCount>0;

  if(renderCanvas){
    if(steps.length>0 && hasPins && p.size){
      const pins=buildPins(p.size, pinCount);
      renderPinsAndStrings(renderCanvas, p.size, pins, steps, params);
    } else {
      const ctx=renderCanvas.getContext('2d');
      if(ctx) ctx.clearRect(0,0,renderCanvas.width, renderCanvas.height);
    }
  }

  const hasDrawable = steps.length>0 && hasPins && p.size;
  setViewerSteps(steps, pinCount);

  if(hasDrawable){
    goToStep(viewerState.current);
  } else if(viewerCanvas){
    const vctx=viewerCanvas.getContext('2d');
    if(vctx) vctx.clearRect(0,0,viewerCanvas.width, viewerCanvas.height);
  }
}

async function onPickImage(e){
  const f = e.target.files && e.target.files[0]; if(!f) return;
  State.newProjectFromImage(f);
  const url = URL.createObjectURL(f); const img = new Image();
  img.onload = ()=>{ crop.img=img; State.go(2); drawCrop(); }; img.src = url;
}

function bindCrop(){
  const cvs = document.getElementById('crop-canvas');
  setCanvasSize(cvs, Math.min(720, cvs.parentElement.clientWidth||600));

  const zoom = document.getElementById('crop-zoom');
  const rot = document.getElementById('crop-rot');

  document.getElementById('crop-reset').addEventListener('click', ()=>{
    crop.scale=1; crop.tx=0; crop.ty=0; crop.rot=0; zoom.value=1; rot.value=0; drawCrop();
  });
  zoom.addEventListener('input', ()=>{ crop.scale=+zoom.value; drawCrop(); });
  rot.addEventListener('input', ()=>{ crop.rot = +rot.value * Math.PI/180; drawCrop(); });

  cvs.addEventListener('pointerdown', e=>{
    crop.down=true;
    crop.lx=e.clientX;
    crop.ly=e.clientY;
    cvs.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  cvs.addEventListener('pointermove', e=>{
    if(!crop.down) return;
    e.preventDefault();
    crop.tx+=(e.clientX-crop.lx);
    crop.ty+=(e.clientY-crop.ly);
    crop.lx=e.clientX;
    crop.ly=e.clientY;
    drawCrop();
  });
  cvs.addEventListener('pointerup', ()=>{ crop.down=false; });

  document.getElementById('crop-confirm').addEventListener('click', async()=>{
    const SIZE = EXPORT_SIZE;
    const exportBoardSize = SIZE - BOARD_MARGIN * 2;
    const off = (typeof OffscreenCanvas!=='undefined') ? new OffscreenCanvas(SIZE,SIZE) : (()=>{const c=document.createElement('canvas'); c.width=SIZE; c.height=SIZE; return c;})();
    const octx = off.getContext('2d');

    octx.fillStyle = '#fff'; octx.fillRect(0,0,SIZE,SIZE);
    octx.save();
    const previewCanvas = document.getElementById('crop-canvas');
    const fallbackPreviewSize = (()=>{
      if(!previewCanvas) return 0;
      const w = previewCanvas.clientWidth || 0;
      const h = previewCanvas.clientHeight || 0;
      const minSide = Math.min(w, h);
      if(!(minSide>0)) return 0;
      const margin = BOARD_MARGIN * (minSide / SIZE);
      return Math.max(0, minSide - margin * 2);
    })();
    const previewSize = crop.displaySize || fallbackPreviewSize || exportBoardSize;
    const ratio = (Number.isFinite(previewSize) && previewSize>0) ? (exportBoardSize / previewSize) : 1;
    const exportTx = crop.tx * ratio;
    const exportTy = crop.ty * ratio;
    octx.translate(SIZE/2 + exportTx, SIZE/2 + exportTy);
    octx.beginPath(); octx.arc(0,0,(SIZE/2)-BOARD_MARGIN,0,Math.PI*2); octx.clip();
    octx.rotate(crop.rot||0);

    const sw=crop.img.width, sh=crop.img.height;
    const minSide=Math.min(sw,sh);
    const scale=crop.scale*(SIZE/minSide);
    octx.drawImage(crop.img, -sw*scale/2, -sh*scale/2, sw*scale, sh*scale);
    octx.restore();

    const im = octx.getImageData(0,0,SIZE,SIZE);
    const src=im.data; const gray=new Uint8Array(SIZE*SIZE);
    const GAMMA = 1/1.05;
    for(let j=0,i=0;i<src.length;i+=4,j++){
      let y = 0.2126*src[i] + 0.7152*src[i+1] + 0.0722*src[i+2];
      y = Math.pow(y/255, GAMMA) * 255;
      y = Math.min(255, Math.max(0, y));
      gray[j] = y|0;
    }

    const blob = new Blob([gray], {type:'application/octet-stream'});
    const proj = State.get().project;
    proj.size=SIZE; proj.circle={cx:SIZE/2, cy:SIZE/2, r:(SIZE/2)-BOARD_MARGIN};
    proj.view={scale:crop.scale, tx:exportTx, ty:exportTy, rot:crop.rot};
    proj.rasterBlobId = proj.id + '.raster'; proj.updatedAt = Date.now();
    await State.saveRasterBlob(proj.rasterBlobId, blob); State.persistMeta(); State.go(3);
  });
}

function drawCrop(){
  const cvs = document.getElementById('crop-canvas'); const ctx = cvs.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const displayW = cvs.clientWidth || (cvs.width / dpr);
  const displayH = cvs.clientHeight || (cvs.height / dpr);
  const rawMin = Math.min(displayW, displayH);
  const previewMinSide = rawMin || (Math.min(cvs.width, cvs.height) / dpr) || rawMin || 1;
  const cx = displayW / 2;
  const cy = displayH / 2;
  const sizeRatio = (Number.isFinite(previewMinSide) && previewMinSide>0) ? (previewMinSide / EXPORT_SIZE) : 0;
  const cssMargin = BOARD_MARGIN * sizeRatio;
  const boardDiameter = Math.max(0, previewMinSide - cssMargin * 2);
  const radius = Math.max(0, boardDiameter / 2);
  crop.displaySize = boardDiameter;

  ctx.save();
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,cvs.width,cvs.height);
  ctx.restore();

  if(crop.img){
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx,cy,radius,0,Math.PI*2);
    ctx.clip();
    ctx.fillStyle = '#fff';
    ctx.fillRect(cx-radius, cy-radius, radius*2, radius*2);
    ctx.translate(cx + crop.tx, cy + crop.ty);
    ctx.rotate(crop.rot||0);
    const sw=crop.img.width, sh=crop.img.height;
    const minSide=Math.min(sw,sh);
    const scale=crop.scale*(previewMinSide/minSide);
    ctx.drawImage(crop.img, -sw*scale/2, -sh*scale/2, sw*scale, sh*scale);
    ctx.restore();
  } else {
    ctx.save();
    ctx.fillStyle='#fff';
    ctx.beginPath();
    ctx.arc(cx,cy,radius,0,Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  const overlayW = displayW || (cvs.width / dpr);
  const overlayH = displayH || (cvs.height / dpr);
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0,0,overlayW,overlayH);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(cx,cy,radius,0,Math.PI*2);
  ctx.fill();
  ctx.restore();

  if(radius>0){
    ctx.save();
    ctx.setLineDash([8,6]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(cx,cy,radius,0,Math.PI*2);
    ctx.stroke();
    ctx.restore();
  }
}

function bindGenerate(){
  const btnStart=document.getElementById('gen-start');
  const btnPause=document.getElementById('gen-pause');
  const btnResume=document.getElementById('gen-resume');
  const btnCancel=document.getElementById('gen-cancel');
  const bar=document.getElementById('gen-bar');
  const stat=document.getElementById('gen-status');
  const rc=document.getElementById('render-canvas');

  let worker=null;
  const previewState = { pins:null, size:null, lastCount:0, renderedStep:0 };
  function resetPreviewState(){
    previewState.pins=null;
    previewState.size=null;
    previewState.lastCount=0;
    previewState.renderedStep=0;
  }
  function ensureWorker(){
    if(worker) return worker;
    worker = new Worker('./js/workers/compute.worker.js', {type:'module'});
    worker.onmessage = (e)=>{
      const {type,data} = e.data;
      if(type==='progress'){
        bar.style.width=(100*data.progress).toFixed(1)+'%';
        stat.textContent='Step ' + data.step + '/' + data.max;
        const p=State.get().project;
        if(typeof data.step==='number' && data.step <= previewState.renderedStep){ resetPreviewState(); }
        if(typeof data.step==='number' && data.step > previewState.renderedStep){ previewState.renderedStep = data.step; }
        if(data.pins) previewState.pins = data.pins;
        if(data.size) previewState.size = data.size;
        if(p && data.steps && data.steps.length>1 && data.steps.length>previewState.lastCount){
          const size = previewState.size || p.size;
          let pins = previewState.pins;
          if(!pins && size){ pins = buildPins(size, p.params.pins); if(pins) previewState.pins = pins; }
          if(size && pins){
            renderPinsAndStrings(rc, size, pins, data.steps, p.params);
            previewState.lastCount = data.steps.length;
          }
        }
      } else if(type==='result'){
        const p=State.get().project;
        p.stepsCSV=data.steps.join(','); p.stepCount=data.steps.length; p.updatedAt=Date.now(); State.persistMeta();
        bar.style.width='100%'; stat.textContent='Done in ' + data.durationMs + ' ms';
        renderPinsAndStrings(rc, data.size, data.pins, data.steps, p.params);
        previewState.pins = data.pins;
        previewState.size = data.size;
        previewState.lastCount = data.steps.length;
        previewState.renderedStep = data.steps.length-1;
        setViewerSteps(data.steps, p.params.pins);
        goToStep(viewerState.current);
      } else if(type==='status'){
        if(data.state==='paused'){
          stat.textContent='Paused';
        } else if(data.state==='running'){
          stat.textContent='Running';
        } else if(data.state==='canceled'){
          bar.style.width='0%';
          stat.textContent='Canceled';
        }
      }
    };
    return worker;
  }

  btnStart.addEventListener('click', async ()=>{
    const p=State.get().project;
    resetPreviewState();
    p.params.pins=+document.getElementById('p-pins').value;
    p.params.strings=+document.getElementById('p-steps').value;
    p.params.minDist=+document.getElementById('p-mindist').value;
    p.params.fade=+document.getElementById('p-fade').value;
    p.params.seed=+document.getElementById('p-seed').value;
    p.params.widthPx=+document.getElementById('p-width').value;
    p.params.alpha=+document.getElementById('p-alpha').value;
    p.params.color=document.getElementById('p-color').value;
    p.params.board=document.getElementById('p-board').value;

    const blob = await State.loadRasterBlob(p.rasterBlobId);
    const buf = await blob.arrayBuffer();
    const u8 = new Uint8ClampedArray(buf);
    ensureWorker().postMessage({type:'run', data:{ raster:u8, size:p.size, pins:p.params.pins, minDist:p.params.minDist, fade:p.params.fade, maxSteps:p.params.strings }}, [u8.buffer]);
    bar.style.width='0%'; stat.textContent='Running';
  });
  btnPause.addEventListener('click', ()=>ensureWorker().postMessage({type:'pause'}));
  btnResume.addEventListener('click', ()=>ensureWorker().postMessage({type:'resume'}));
  btnCancel.addEventListener('click', ()=>ensureWorker().postMessage({type:'cancel'}));
}

function bindViewer(){
  const canvas=document.getElementById('viewer-canvas');
  const expPNG=document.getElementById('exp-png'); const expSVGb=document.getElementById('exp-svg'); const expCSVb=document.getElementById('exp-csv'); const expJSONb=document.getElementById('exp-json');

  const firstBtn=document.getElementById('e4-first');
  const lastBtn=document.getElementById('e4-last');
  const prevBtn=document.getElementById('e4-prev');
  const nextBtn=document.getElementById('e4-next');
  const playBtn=document.getElementById('e4-play');
  const speedBtn=document.getElementById('e4-speed');
  const voiceBtn=document.getElementById('e4-voice');
  const jumpBtn=document.getElementById('e4-step-jump');

  if(firstBtn){ firstBtn.addEventListener('click', ()=>{ stopPlayback(); goToStep(0); }); }
  if(lastBtn){ lastBtn.addEventListener('click', ()=>{ stopPlayback(); goToStep(viewerState.max); }); }
  if(prevBtn){ prevBtn.addEventListener('click', ()=>{ stopPlayback(); goToStep(viewerState.current-1); }); }
  if(nextBtn){ nextBtn.addEventListener('click', ()=>{ stopPlayback(); goToStep(viewerState.current+1); }); }
  if(playBtn){ playBtn.addEventListener('click', togglePlayback); }
  if(speedBtn){ speedBtn.addEventListener('click', cycleSpeed); }
  if(voiceBtn){ voiceBtn.addEventListener('click', toggleVoice); }
  if(jumpBtn){
    jumpBtn.addEventListener('click', ()=>{
      if(viewerState.steps.length===0) return;
      const total = viewerState.steps.length;
      const input = prompt('Go to step (1-' + total + ')', String(viewerState.current+1));
      if(input===null) return;
      const num = Number.parseInt(input, 10);
      if(Number.isFinite(num)){
        const clamped = Math.max(1, Math.min(num, total));
        stopPlayback();
        goToStep(clamped-1);
      }
    });
  }

  if(expPNG){ expPNG.addEventListener('click', ()=>{ if(!canvas) return; const url=canvas.toDataURL('image/png'); downloadURL(url,'string-art.png'); }); }
  if(expSVGb){ expSVGb.addEventListener('click', ()=>{ const p=State.get().project; if(!p) return; const steps=(p.stepsCSV||'').split(',').map(s=>+s).filter(n=>Number.isFinite(n)); const blob=exportSVG(p.size, buildPins(p.size, p.params.pins), steps, p.params); const url=URL.createObjectURL(blob); downloadURL(url,'string-art.svg'); URL.revokeObjectURL(url); }); }
  if(expCSVb){ expCSVb.addEventListener('click', ()=>{ const p=State.get().project; if(!p) return; const steps=(p.stepsCSV||'').split(',').map(s=>+s).filter(n=>Number.isFinite(n)); const blob=exportCSV(steps, buildPins(p.size, p.params.pins)); const url=URL.createObjectURL(blob); downloadURL(url,'string-art.csv'); URL.revokeObjectURL(url); }); }
  if(expJSONb){ expJSONb.addEventListener('click', ()=>{ const p=State.get().project; if(!p) return; const preset={brand:'Hammer Design', pins:p.params.pins, strings:p.params.strings, minDist:p.params.minDist, fade:p.params.fade, widthPx:p.params.widthPx, alpha:p.params.alpha, color:p.params.color, board:p.params.board, seed:p.params.seed, locale:(navigator.language||'en').slice(0,2), watermark:'© 2025 Hammer Design'}; const blob=new Blob([JSON.stringify(preset,null,2)], {type:'application/json'}); const url=URL.createObjectURL(blob); downloadURL(url,'preset.json'); URL.revokeObjectURL(url); }); }

  updateProgressUI();
  updateControlsState();
  updateSpeedLabel();
  updateVoiceButton();
  updatePlayButton();

  function downloadURL(url,name){ const a=document.createElement('a'); a.href=url; a.download=name; a.click(); }
}

function drawViewer(k){
  const p=State.get().project;
  const canvas=document.getElementById('viewer-canvas');
  if(!p || !canvas){
    clearViewer();
    return;
  }

  let allSteps=viewerState.steps;
  if(!allSteps || allSteps.length===0){
    const stepsCSV=(p.stepsCSV||'').trim();
    allSteps=stepsCSV ? stepsCSV.split(',').map(s=>Number(s)).filter(n=>Number.isFinite(n)) : [];
    if(allSteps.length>0){
      viewerState.steps = allSteps;
      viewerState.max = allSteps.length-1;
      viewerState.current = Math.min(k, viewerState.max);
    }
  }

  if(!allSteps || allSteps.length===0){
    clearViewer();
    return;
  }

  const pinCountCandidate = Number.isFinite(viewerState.pinCount) && viewerState.pinCount>0 ? viewerState.pinCount : Number(p.params?.pins);
  const pinCount=Number(pinCountCandidate);
  if(!Number.isFinite(pinCount) || pinCount<=0 || !p.size){
    clearViewer();
    return;
  }

  const steps=allSteps.slice(0, Math.min(k+1, allSteps.length));
  const pins=buildPins(p.size, pinCount);
  renderPinsAndStrings(canvas, p.size, pins, steps, p.params);
}

function buildPins(size, n){
  const cx=size/2, cy=size/2, R=(size/2)-BOARD_MARGIN;
  const arr=new Array(n), step=Math.PI*2/n;
  for(let i=0;i<n;i++){ const ang=i*step; arr[i]={id:i, x:Math.round(cx+R*Math.cos(ang)), y:Math.round(cy+R*Math.sin(ang))}; }
  return arr;
}
