import { idbPutBlob, idbGetBlob } from './utils.js';
const LS_KEY = 'sa.projects.v1';
const state = { screen: 1, project: null };
export function go(n){
  state.screen = n;
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  const el = document.getElementById(`screen-${n}`);
  if(el) el.classList.add('active');
}
export function newProjectFromImage(file){
  const id = 'p_' + Date.now().toString(36);
  const proj = { id, name: file.name || 'Untitled', createdAt: Date.now(), updatedAt: Date.now(),
    rasterBlobId: null, size: 0, circle: {cx:0,cy:0,r:0}, view: {scale:1, tx:0, ty:0},
    params: { pins: 240, strings: 3000, minDist: 15, fade: 50, alpha: 180, widthPx: 0.8, pinSize: 4, color: '#000000', board:'white', seed:1337 },
    stepsCSV:'', stepCount:0 };
  state.project = proj; persistMeta(); return proj;
}
export function setProject(proj){ state.project = proj; persistMeta(); }
export function listProjects(){ const raw = localStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) : []; }
export function persistMeta(){
  const list = listProjects().filter(p=>p.id !== (state.project?.id));
  if(state.project) list.unshift(state.project);
  localStorage.setItem(LS_KEY, JSON.stringify(list.slice(0,50)));
}
export async function saveRasterBlob(id, blob){ await idbPutBlob(id, blob); }
export async function loadRasterBlob(id){ return await idbGetBlob(id); }
export function get(){ return state; }
