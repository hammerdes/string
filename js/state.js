import { idbPutBlob, idbGetBlob, idbDeleteBlob } from './utils.js';
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

function readStoredProjects(){
  const raw = localStorage.getItem(LS_KEY);
  if(!raw) return [];
  try{
    const parsed = JSON.parse(raw);
    if(!Array.isArray(parsed)) return [];
    return parsed;
  }catch(err){
    console.error('Failed to parse stored projects', err);
    return [];
  }
}

function writeStoredProjects(list){
  const normalized = list.map(normalizeProject).filter(Boolean);
  localStorage.setItem(LS_KEY, JSON.stringify(normalized.slice(0,50)));
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
  return readStoredProjects().map(normalizeProject).filter(Boolean);
}
export function persistMeta(){
  const current = state.project;
  const currentId = current?.id;
  const stored = readStoredProjects().filter(p=>p?.id !== currentId);
  if(current && current.isSaved !== false){
    stored.unshift(normalizeProject(current));
  }
  writeStoredProjects(stored);
}
export async function saveRasterBlob(id, blob){ await idbPutBlob(id, blob); }
export async function loadRasterBlob(id){ return await idbGetBlob(id); }
export function get(){ return state; }

export function renameProject(id, name){
  const trimmed = (name ?? '').trim();
  if(!id || !trimmed) return null;
  const stored = readStoredProjects();
  let updated = null;
  const next = stored.map(proj=>{
    if(proj?.id === id){
      const update = { ...proj, name: trimmed, updatedAt: Date.now() };
      updated = update;
      return update;
    }
    return proj;
  });
  if(!updated){
    return null;
  }
  writeStoredProjects(next);
  if(state.project?.id === id){
    state.project.name = trimmed;
    state.project.updatedAt = updated.updatedAt;
  }
  return normalizeProject(updated);
}

export async function deleteProject(id){
  if(!id) return false;
  const stored = readStoredProjects();
  const index = stored.findIndex(proj=>proj?.id === id);
  if(index < 0) return false;
  const [removed] = stored.splice(index, 1);
  writeStoredProjects(stored);
  if(removed?.rasterBlobId){
    try{
      await idbDeleteBlob(removed.rasterBlobId);
    }catch(err){
      console.error('Failed to remove raster blob for project', err);
    }
  }
  if(state.project?.id === id){
    state.project = null;
  }
  persistMeta();
  return true;
}
