import * as State from './state.js';
import { setCanvasSize } from './utils.js';
import { renderPinsAndStrings, exportSVG, exportCSV } from './renderer.js';

const BOARD_MARGIN = 16;

let crop = { img:null, scale:1, tx:0, ty:0, rot:0, down:false, lx:0, ly:0 };

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

  const slider=document.getElementById('e4-step');
  const counter=document.getElementById('e4-count');
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

  const maxStep = steps.length>0 ? steps.length-1 : 0;
  if(slider){
    slider.max = maxStep;
    slider.value = maxStep;
  }
  if(counter){
    counter.textContent = steps.length + ' steps';
  }

  if(steps.length>0 && hasPins && p.size){
    drawViewer(maxStep);
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

  cvs.addEventListener('pointerdown', e=>{ crop.down=true; crop.lx=e.clientX; crop.ly=e.clientY; cvs.setPointerCapture(e.pointerId); });
  cvs.addEventListener('pointermove', e=>{ if(!crop.down) return; crop.tx+=(e.clientX-crop.lx); crop.ty+=(e.clientY-crop.ly); crop.lx=e.clientX; crop.ly=e.clientY; drawCrop(); });
  cvs.addEventListener('pointerup', ()=>{ crop.down=false; });

  document.getElementById('crop-confirm').addEventListener('click', async()=>{
    const SIZE = 1440;
    const off = (typeof OffscreenCanvas!=='undefined') ? new OffscreenCanvas(SIZE,SIZE) : (()=>{const c=document.createElement('canvas'); c.width=SIZE; c.height=SIZE; return c;})();
    const octx = off.getContext('2d');

    octx.fillStyle = '#fff'; octx.fillRect(0,0,SIZE,SIZE);
    octx.save();
    octx.translate(SIZE/2 + crop.tx, SIZE/2 + crop.ty);
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
    proj.view={scale:crop.scale, tx:crop.tx, ty:crop.ty, rot:crop.rot};
    proj.rasterBlobId = proj.id + '.raster'; proj.updatedAt = Date.now();
    await State.saveRasterBlob(proj.rasterBlobId, blob); State.persistMeta(); State.go(3);
  });
}

function drawCrop(){
  const cvs = document.getElementById('crop-canvas'); const ctx = cvs.getContext('2d');
  const W=cvs.width, H=cvs.height;
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(W/2,H/2,Math.min(W,H)/2-BOARD_MARGIN,0,Math.PI*2); ctx.fill();
  if(!crop.img) return;

  ctx.save(); ctx.beginPath(); ctx.arc(W/2,H/2,Math.min(W,H)/2-BOARD_MARGIN,0,Math.PI*2); ctx.clip();
  ctx.translate(W/2 + crop.tx, H/2 + crop.ty); ctx.rotate(crop.rot||0);
  const sw=crop.img.width, sh=crop.img.height; const minSide=Math.min(sw,sh); const scale=crop.scale*(Math.min(W,H)/minSide);
  ctx.drawImage(crop.img, -sw*scale/2, -sh*scale/2, sw*scale, sh*scale);
  ctx.restore();
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
        const sliderEl=document.getElementById('e4-step');
        const counterEl=document.getElementById('e4-count');
        const maxStep=Math.max(data.steps.length-1,0);
        if(sliderEl){
          sliderEl.max=maxStep;
          sliderEl.value=maxStep;
          if(data.steps.length>0) drawViewer(maxStep);
        }
        if(counterEl){
          counterEl.textContent=data.steps.length + ' steps';
        }
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
  const slider=document.getElementById('e4-step'); const canvas=document.getElementById('viewer-canvas');
  const expPNG=document.getElementById('exp-png'); const expSVGb=document.getElementById('exp-svg'); const expCSVb=document.getElementById('exp-csv'); const expJSONb=document.getElementById('exp-json');

  slider.addEventListener('input', ()=>drawViewer(+slider.value));
  expPNG.addEventListener('click', ()=>{ const url=canvas.toDataURL('image/png'); downloadURL(url,'string-art.png'); });
  expSVGb.addEventListener('click', ()=>{ const p=State.get().project; const steps=p.stepsCSV.split(',').map(s=>+s); const blob=exportSVG(p.size, buildPins(p.size, p.params.pins), steps, p.params); const url=URL.createObjectURL(blob); downloadURL(url,'string-art.svg'); URL.revokeObjectURL(url); });
  expCSVb.addEventListener('click', ()=>{ const p=State.get().project; const steps=p.stepsCSV.split(',').map(s=>+s); const blob=exportCSV(steps, buildPins(p.size, p.params.pins)); const url=URL.createObjectURL(blob); downloadURL(url,'string-art.csv'); URL.revokeObjectURL(url); });
  expJSONb.addEventListener('click', ()=>{ const p=State.get().project; const preset={brand:'Hammer Design', pins:p.params.pins, strings:p.params.strings, minDist:p.params.minDist, fade:p.params.fade, widthPx:p.params.widthPx, alpha:p.params.alpha, color:p.params.color, board:p.params.board, seed:p.params.seed, locale:(navigator.language||'en').slice(0,2), watermark:'© 2025 Hammer Design'}; const blob=new Blob([JSON.stringify(preset,null,2)], {type:'application/json'}); const url=URL.createObjectURL(blob); downloadURL(url,'preset.json'); URL.revokeObjectURL(url); });

  function downloadURL(url,name){ const a=document.createElement('a'); a.href=url; a.download=name; a.click(); }
}

function drawViewer(k){
  const p=State.get().project; if(!p) return;
  const stepsCSV=(p.stepsCSV||'').trim();
  if(!stepsCSV) return;
  const canvas=document.getElementById('viewer-canvas'); if(!canvas) return;
  const allSteps=stepsCSV.split(',').map(s=>Number(s)).filter(n=>Number.isFinite(n));
  if(allSteps.length===0) return;
  const pinCount=Number(p.params?.pins);
  if(!Number.isFinite(pinCount) || pinCount<=0 || !p.size) return;
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
