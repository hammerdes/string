import { setCanvasSize, hexToRGBA } from './utils.js';
export function renderPinsAndStrings(canvas, size, pins, steps, opts){
  const css = Math.min(canvas.parentElement.clientWidth||size, size);
  const ctx = setCanvasSize(canvas, css);
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const s = canvas.clientWidth, cx = s/2, cy = s/2, rOuter = (s/2) - 8;
  ctx.fillStyle = opts.board==='black' ? '#000' : '#fff';
  ctx.beginPath(); ctx.arc(cx,cy, rOuter, 0, Math.PI*2); ctx.fill();
  ctx.lineWidth = 10; ctx.strokeStyle = opts.board==='black' ? '#cfd6e6' : '#222';
  ctx.beginPath(); ctx.arc(cx,cy, rOuter-1, 0, Math.PI*2); ctx.stroke();
  ctx.fillStyle = '#e9e9e9';
  const scale = s/size;
  for(const p of pins){ ctx.beginPath(); ctx.arc(p.x*scale, p.y*scale, (opts.pinSize||4)*scale, 0, Math.PI*2); ctx.fill(); }
  if(!steps || steps.length<2) return;
  ctx.save();
  ctx.lineCap='round'; ctx.lineJoin='round';
  ctx.strokeStyle = hexToRGBA(opts.color||'#000000', (opts.alpha||180)/255);
  ctx.lineWidth = (opts.widthPx||0.8)*scale;
  for(let i=0;i<steps.length-1;i++){ const a=pins[steps[i]], b=pins[steps[i+1]]; ctx.beginPath(); ctx.moveTo(a.x*scale, a.y*scale); ctx.lineTo(b.x*scale, b.y*scale); ctx.stroke(); }
  ctx.restore();
}
export function exportSVG(size, pins, steps, opts){
  const lines = [];
  for(let i=0;i<steps.length-1;i++){ const a=pins[steps[i]], b=pins[steps[i+1]]; lines.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" />`); }
  const stroke = opts.color||'#000000', width = opts.widthPx||0.8;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<defs><clipPath id="c"><circle cx="${size/2}" cy="${size/2}" r="${(size/2)-8}"/></clipPath></defs>
<g clip-path="url(#c)" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">
${lines.join('\n')}
</g>
</svg>`;
  return new Blob([svg], {type:'image/svg+xml'});
}
export function exportCSV(steps, pins){
  let rows = ['step,fromPin,toPin,length,score,deltaError'];
  for(let i=1;i<steps.length;i++){
    const from = steps[i-1], to = steps[i];
    const a = pins[from], b = pins[to];
    const len = Math.hypot(a.x-b.x, a.y-b.y).toFixed(2);
    rows.push(`${i},${from},${to},${len},,`);
  }
  return new Blob([rows.join('\n')+'\n'], {type:'text/csv'});
}
