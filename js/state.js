import { idbPutBlob, idbGetBlob } from './utils.js';
const LS_KEY = 'sa.projects.v1';
const state = { screen: 1, project: null };
const navigateListeners = new Set();
export function go(n){
  state.screen = n;
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  const el = document.getElementById(`screen-${n}`);
  if(el) el.classList.add('active');
  navigateListeners.forEach(fn=>{ try{ fn(n); }catch(err){ console.error(err); } });
}
export function onNavigate(fn){ if(typeof fn==='function') navigateListeners.add(fn); return ()=>navigateListeners.delete(fn); }
function normalizeProject(proj){
  if(!proj || typeof proj !== 'object') return null;
  const normalized = { ...proj };
  const step = Number.isFinite(normalized.lastViewedStep) ? Math.max(0, Math.floor(normalized.lastViewedStep)) : 0;
  normalized.lastViewedStep = step;
  if(normalized.isSaved === false){
    return normalized;
  }
  normalized.isSaved = true;
  return normalized;
}

export function newProjectFromImage(file){
  const id = 'p_' + Date.now().toString(36);
  const proj = { id, name: file.name || 'Untitled', createdAt: Date.now(), updatedAt: Date.now(),
    rasterBlobId: null, size: 0, circle: {cx:0,cy:0,r:0}, view: {scale:1, tx:0, ty:0},
    params: { pins: 240, strings: 3000, minDist: 15, fade: 50, alpha: 180, widthPx: 0.8, pinSize: 4, color: '#000000', board:'white', seed:1337 },
    stepsCSV:'', stepCount:0, lastViewedStep:0, isSaved:false };
  state.project = proj; persistMeta(); return proj;
}
export function setProject(proj){
  if(!proj){
    state.project = null;
    persistMeta();
    return;
  }
  state.project = normalizeProject(proj);
  persistMeta();
}
export function listProjects(){
  const raw = localStorage.getItem(LS_KEY);
  if(!raw) return [];
  try{
    const parsed = JSON.parse(raw);
    if(!Array.isArray(parsed)) return [];
    return parsed.map(normalizeProject).filter(Boolean);
  }catch(err){
    console.error('Failed to parse stored projects', err);
    return [];
  }
}
export function persistMeta(){
  const current = state.project;
  const currentId = current?.id;
  const list = listProjects().filter(p=>p.id !== currentId);
  if(current && current.isSaved !== false){
    list.unshift(normalizeProject(current));
  }
  localStorage.setItem(LS_KEY, JSON.stringify(list.slice(0,50)));
}
export async function saveRasterBlob(id, blob){ await idbPutBlob(id, blob); }
export async function loadRasterBlob(id){ return await idbGetBlob(id); }
export function get(){ return state; }
