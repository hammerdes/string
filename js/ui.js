import * as State from './state.js';
import { setCanvasSize, BOARD_MARGIN } from './utils.js';
import { renderPinsAndStrings, exportSVG, exportCSV } from './renderer.js';

const EXPORT_SIZE = 1440;
const AUTO_PLAY_SPEEDS = [1000, 2000, 3000, 5000, 10000, 15000, 30000];
const DEFAULT_SPEED_INDEX = 2;
let navButtons = [];
let removeNavigateListener = null;

let crop = { img:null, scale:1, tx:0, ty:0, rot:0, down:false, lx:0, ly:0, displaySize:0 };

let viewerResizeObserver = null;
let viewerLastObservedWidth = 0;
let viewerPendingDraw = false;

const viewerState = {
  stepIndex: 0,
  steps: [],
  pinCount: 0,
  autoPlayDelayMs: AUTO_PLAY_SPEEDS[DEFAULT_SPEED_INDEX],
  autoPlayTimer: null,
  isAutoPlaying: false,
  isVoiceOn: false,
  isVoiceSupported: typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined',
  speedMenuOpen: false,
  speedMenuOutsideHandler: null,
  speedMenuKeyHandler: null,
  ui: {},
};

function resetViewer(){
  stopAutoPlay({ updateButton: false });
  viewerState.stepIndex = 0;
  viewerState.steps = [];
  viewerState.pinCount = 0;
  viewerState.autoPlayDelayMs = AUTO_PLAY_SPEEDS[DEFAULT_SPEED_INDEX];
  viewerState.isVoiceOn = false;
  clearViewer();
  closeSpeedMenu({ focusButton: false });
  updateProgressIndicators();
  updateTransportState();
  updatePlayButton();
  updateSpeedButton();
  updateVoiceButton();
}

function stopAutoPlay({updateButton = true} = {}){
  if(viewerState.autoPlayTimer){
    clearTimeout(viewerState.autoPlayTimer);
    viewerState.autoPlayTimer = null;
  }
  const wasPlaying = viewerState.isAutoPlaying;
  viewerState.isAutoPlaying = false;
  if(wasPlaying && updateButton){
    updatePlayButton();
  }
}

function toggleAutoPlay(){
  if(viewerState.isAutoPlaying){
    stopAutoPlay();
    return;
  }
  if(viewerState.steps.length === 0) return;
  if(viewerState.stepIndex >= viewerState.steps.length - 1){
    setStep(0, { announce: false });
  }
  viewerState.isAutoPlaying = true;
  updatePlayButton();
  scheduleNextStep();
}

function scheduleNextStep(){
  if(viewerState.autoPlayTimer){
    clearTimeout(viewerState.autoPlayTimer);
    viewerState.autoPlayTimer = null;
  }
  if(!viewerState.isAutoPlaying) return;
  const total = viewerState.steps.length;
  if(total === 0){
    stopAutoPlay();
    return;
  }
  if(viewerState.stepIndex >= total - 1){
    stopAutoPlay();
    return;
  }
  const delay = viewerState.autoPlayDelayMs || AUTO_PLAY_SPEEDS[0];
  viewerState.autoPlayTimer = setTimeout(()=>{
    setStep(viewerState.stepIndex + 1, { announce: true });
  }, delay);
}

function formatSpeedLabel(ms){
  const secs = ms / 1000;
  if(secs >= 1){
    const label = Number.isInteger(secs) ? secs.toFixed(0) : secs.toFixed(1);
    return label + 's';
  }
  return ms + 'ms';
}

function selectAutoPlaySpeed(ms){
  if(!Number.isFinite(ms)) return;
  viewerState.autoPlayDelayMs = ms;
  updateSpeedButton();
  if(viewerState.isAutoPlaying){
    scheduleNextStep();
  }
  closeSpeedMenu();
}

function updateSpeedMenuSelection(){
  const { speedOptions } = viewerState.ui;
  if(!Array.isArray(speedOptions)) return;
  speedOptions.forEach(option=>{
    const speed = Number(option.dataset.speed);
    const isActive = speed === viewerState.autoPlayDelayMs;
    option.classList.toggle('is-active', isActive);
    option.setAttribute('aria-checked', isActive ? 'true' : 'false');
  });
}

function setSpeedOptionsTabIndex(value){
  const { speedOptions } = viewerState.ui;
  if(!Array.isArray(speedOptions)) return;
  speedOptions.forEach(option=>{
    option.tabIndex = value;
  });
}

function focusCurrentSpeedOption(){
  const { speedOptions } = viewerState.ui;
  if(!Array.isArray(speedOptions) || speedOptions.length === 0) return;
  const current = speedOptions.find(option=>Number(option.dataset.speed) === viewerState.autoPlayDelayMs);
  const target = current || speedOptions[0];
  if(target) target.focus();
}

function openSpeedMenu(){
  const { speedButton, speedMenu } = viewerState.ui;
  if(!speedButton || !speedMenu) return;
  if(viewerState.speedMenuOpen || speedButton.disabled) return;
  updateSpeedMenuSelection();
  setSpeedOptionsTabIndex(0);
  speedMenu.classList.add('is-open');
  speedMenu.setAttribute('aria-hidden', 'false');
  speedButton.classList.add('is-open');
  speedButton.setAttribute('aria-expanded', 'true');
  viewerState.speedMenuOpen = true;
  viewerState.speedMenuOutsideHandler = handleSpeedMenuOutsidePointer;
  viewerState.speedMenuKeyHandler = handleSpeedMenuKeyDown;
  document.addEventListener('pointerdown', viewerState.speedMenuOutsideHandler);
  document.addEventListener('keydown', viewerState.speedMenuKeyHandler);
}

function closeSpeedMenu({ focusButton = true } = {}){
  const { speedButton, speedMenu } = viewerState.ui;
  if(!speedButton || !speedMenu) return;
  viewerState.speedMenuOpen = false;
  speedMenu.classList.remove('is-open');
  speedMenu.setAttribute('aria-hidden', 'true');
  speedButton.classList.remove('is-open');
  speedButton.setAttribute('aria-expanded', 'false');
  setSpeedOptionsTabIndex(-1);
  if(viewerState.speedMenuOutsideHandler){
    document.removeEventListener('pointerdown', viewerState.speedMenuOutsideHandler);
    viewerState.speedMenuOutsideHandler = null;
  }
  if(viewerState.speedMenuKeyHandler){
    document.removeEventListener('keydown', viewerState.speedMenuKeyHandler);
    viewerState.speedMenuKeyHandler = null;
  }
  if(focusButton && !speedButton.disabled){
    speedButton.focus();
  }
}

function handleSpeedButtonClick(event){
  event.preventDefault();
  if(viewerState.speedMenuOpen){
    closeSpeedMenu({ focusButton: false });
  } else {
    openSpeedMenu();
  }
}

function handleSpeedButtonKeyDown(event){
  const key = event.key;
  if(key === 'ArrowDown' || key === 'ArrowUp' || key === 'Enter' || key === ' ' || key === 'Spacebar'){
    event.preventDefault();
    if(!viewerState.speedMenuOpen){
      openSpeedMenu();
      focusCurrentSpeedOption();
    }
  } else if(key === 'Escape' && viewerState.speedMenuOpen){
    event.preventDefault();
    closeSpeedMenu();
  }
}

function handleSpeedOptionKeyDown(event){
  const options = viewerState.ui.speedOptions || [];
  const count = options.length;
  if(count === 0) return;
  const current = event.currentTarget;
  const index = options.indexOf(current);
  switch(event.key){
    case 'ArrowDown':
    case 'ArrowRight': {
      event.preventDefault();
      const next = options[(index + 1) % count];
      if(next) next.focus();
      break;
    }
    case 'ArrowUp':
    case 'ArrowLeft': {
      event.preventDefault();
      const prev = options[(index - 1 + count) % count];
      if(prev) prev.focus();
      break;
    }
    case 'Home': {
      event.preventDefault();
      options[0]?.focus();
      break;
    }
    case 'End': {
      event.preventDefault();
      options[count - 1]?.focus();
      break;
    }
    case 'Escape': {
      event.preventDefault();
      closeSpeedMenu();
      break;
    }
  }
}

function handleSpeedMenuOutsidePointer(event){
  const { speedButton, speedMenu } = viewerState.ui;
  if(!viewerState.speedMenuOpen || !speedMenu) return;
  const target = event.target;
  if(speedMenu.contains(target) || (speedButton && speedButton.contains(target))){
    return;
  }
  closeSpeedMenu({ focusButton: false });
}

function handleSpeedMenuKeyDown(event){
  if(event.key === 'Escape' && viewerState.speedMenuOpen){
    event.preventDefault();
    closeSpeedMenu();
  }
}

function handleSpeedMenuFocusOut(event){
  if(!viewerState.speedMenuOpen) return;
  const { speedMenu, speedButton } = viewerState.ui;
  if(!speedMenu) return;
  const next = event.relatedTarget;
  if(next && (speedMenu.contains(next) || (speedButton && speedButton.contains(next)))){
    return;
  }
  closeSpeedMenu({ focusButton: false });
}

function setupSpeedMenu(){
  const ui = viewerState.ui;
  const button = ui.speedButton;
  const menu = document.getElementById('e4-speed-menu');
  ui.speedMenu = menu;
  if(!button || !menu) return;
  if(menu.dataset.bound === 'true'){
    ui.speedOptions = Array.from(menu.querySelectorAll('.e4-speed-option'));
    setSpeedOptionsTabIndex(-1);
    updateSpeedMenuSelection();
    button.setAttribute('aria-expanded', viewerState.speedMenuOpen ? 'true' : 'false');
    menu.setAttribute('aria-hidden', viewerState.speedMenuOpen ? 'false' : 'true');
    return;
  }
  menu.innerHTML = '';
  menu.dataset.bound = 'true';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-hidden', 'true');
  const options = AUTO_PLAY_SPEEDS.map(ms=>{
    const li = document.createElement('li');
    li.setAttribute('role', 'none');
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'e4-speed-option';
    option.dataset.speed = String(ms);
    option.textContent = formatSpeedLabel(ms);
    option.setAttribute('role', 'menuitemradio');
    option.setAttribute('aria-checked', 'false');
    option.tabIndex = -1;
    option.addEventListener('click', ()=>selectAutoPlaySpeed(ms));
    option.addEventListener('keydown', handleSpeedOptionKeyDown);
    li.appendChild(option);
    menu.appendChild(li);
    return option;
  });
  ui.speedOptions = options;
  setSpeedOptionsTabIndex(-1);
  updateSpeedMenuSelection();
  button.addEventListener('click', handleSpeedButtonClick);
  button.addEventListener('keydown', handleSpeedButtonKeyDown);
  menu.addEventListener('focusout', handleSpeedMenuFocusOut);
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-expanded', 'false');
  menu.classList.remove('is-open');
}

function toggleVoice(){
  if(!viewerState.isVoiceSupported) return;
  viewerState.isVoiceOn = !viewerState.isVoiceOn;
  if(!viewerState.isVoiceOn && typeof window !== 'undefined' && window.speechSynthesis){
    window.speechSynthesis.cancel();
  }
  updateVoiceButton();
  if(viewerState.isVoiceOn){
    announcePin(viewerState.steps[viewerState.stepIndex]);
  }
}

function setStep(index, {announce = true} = {}){
  const total = viewerState.steps.length;
  if(total === 0){
    viewerState.stepIndex = 0;
    clearViewer();
    updateProgressIndicators();
    updateTransportState();
    updateVoiceButton();
    if(viewerState.isAutoPlaying){
      stopAutoPlay();
    }
    return;
  }
  const clamped = Math.max(0, Math.min(index, total - 1));
  viewerState.stepIndex = clamped;
  drawViewer(clamped);
  updateProgressIndicators();
  updateTransportState();
  updateVoiceButton();
  if(viewerState.isAutoPlaying){
    scheduleNextStep();
  }
  if(announce && viewerState.isVoiceOn){
    announcePin(viewerState.steps[clamped]);
  }
}

function updateProgressIndicators(){
  const { progressLabel, progressFill, progressBar, prevPinCell, currentPinCell, nextPinCell } = viewerState.ui;
  const totalSteps = Math.max(viewerState.steps.length - 1, 0);
  const currentStep = Math.min(viewerState.stepIndex, totalSteps);
  if(progressLabel){
    progressLabel.textContent = `Step ${currentStep} / ${totalSteps}`;
  }
  if(progressFill){
    let pct = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0;
    pct = Number.isFinite(pct) ? Math.min(Math.max(pct, 0), 100) : 0;
    progressFill.style.width = pct.toFixed(1) + '%';
  }
  if(progressBar){
    progressBar.setAttribute('aria-valuemin', '0');
    progressBar.setAttribute('aria-valuemax', String(totalSteps));
    progressBar.setAttribute('aria-valuenow', String(currentStep));
  }
  const prevValue = viewerState.steps[viewerState.stepIndex - 1];
  const currentValue = viewerState.steps[viewerState.stepIndex];
  const nextValue = viewerState.steps[viewerState.stepIndex + 1];

  updateStepCell(prevPinCell, prevValue);
  updateStepCell(currentPinCell, currentValue);
  updateStepCell(nextPinCell, nextValue);

  if(prevPinCell){
    prevPinCell.classList.toggle('is-active', false);
    prevPinCell.classList.toggle('is-empty', !Number.isFinite(prevValue));
  }
  if(currentPinCell){
    const hasCurrentStep = viewerState.stepIndex >= 0 && viewerState.stepIndex < viewerState.steps.length;
    currentPinCell.classList.toggle('is-active', hasCurrentStep);
    currentPinCell.classList.toggle('is-empty', !Number.isFinite(currentValue));
  }
  if(nextPinCell){
    nextPinCell.classList.toggle('is-active', false);
    nextPinCell.classList.toggle('is-empty', !Number.isFinite(nextValue));
  }
}

function updateStepCell(cell, value){
  if(!cell) return;
  const valueEl = cell.querySelector('[data-value]');
  const placeholderEl = cell.querySelector('[data-placeholder]');
  if(Number.isFinite(value)){
    if(valueEl){ valueEl.hidden = false; valueEl.textContent = value; }
    if(placeholderEl){ placeholderEl.hidden = true; }
    cell.classList.remove('is-empty');
  } else {
    if(valueEl){ valueEl.hidden = true; valueEl.textContent = ''; }
    if(placeholderEl){ placeholderEl.hidden = false; }
    cell.classList.add('is-empty');
  }
}

function updateTransportState(){
  const { firstButton, prevButton, nextButton, lastButton, playButton, speedButton, jumpButton, voiceButton } = viewerState.ui;
  const total = viewerState.steps.length;
  const hasData = total > 0 && Number.isFinite(viewerState.pinCount) && viewerState.pinCount > 0;
  setDisabled(firstButton, !hasData || viewerState.stepIndex <= 0);
  setDisabled(prevButton, !hasData || viewerState.stepIndex <= 0);
  setDisabled(nextButton, !hasData || viewerState.stepIndex >= total - 1);
  setDisabled(lastButton, !hasData || viewerState.stepIndex >= total - 1);
  setDisabled(playButton, !hasData);
  setDisabled(speedButton, !hasData);
  setDisabled(jumpButton, !hasData);
  if(voiceButton){
    const voiceDisabled = !hasData || !viewerState.isVoiceSupported;
    voiceButton.disabled = voiceDisabled;
    if(voiceDisabled){
      voiceButton.setAttribute('aria-disabled', 'true');
    } else {
      voiceButton.removeAttribute('aria-disabled');
    }
  }
}

function setDisabled(el, disabled){
  if(!el) return;
  el.disabled = !!disabled;
  if(disabled){
    el.setAttribute('aria-disabled', 'true');
    if(el === viewerState.ui.speedButton){
      closeSpeedMenu({ focusButton: false });
    }
  } else {
    el.removeAttribute('aria-disabled');
  }
}

function updateSpeedButton(){
  const { speedButton } = viewerState.ui;
  if(!speedButton) return;
  const ms = viewerState.autoPlayDelayMs || AUTO_PLAY_SPEEDS[0];
  const label = formatSpeedLabel(ms);
  const valueEl = speedButton.querySelector('.speed-value');
  if(valueEl){
    valueEl.textContent = label;
  }
  speedButton.setAttribute('aria-label', `Playback speed ${label}`);
  updateSpeedMenuSelection();
}

function updatePlayButton(){
  const { playButton } = viewerState.ui;
  if(!playButton) return;
  const isPlaying = viewerState.isAutoPlaying;
  playButton.setAttribute('aria-pressed', isPlaying ? 'true' : 'false');
  playButton.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
  const playStateEls = playButton.querySelectorAll('[data-state="play"]');
  const pauseStateEls = playButton.querySelectorAll('[data-state="pause"]');
  playStateEls.forEach(el=>{
    el.toggleAttribute('hidden', isPlaying);
  });
  pauseStateEls.forEach(el=>{
    el.toggleAttribute('hidden', !isPlaying);
  });
}

function updateVoiceButton(){
  const { voiceButton, voiceInfo } = viewerState.ui;
  if(!voiceButton) return;
  const icons = {
    off: voiceButton.querySelector('[data-state="off"]'),
    on: voiceButton.querySelector('[data-state="on"]'),
    unavailable: voiceButton.querySelector('[data-state="unavailable"]')
  };
  const labelEl = voiceButton.querySelector('[data-voice-label]');
  const setActiveState = state => {
    Object.entries(icons).forEach(([key, icon])=>{
      if(!icon) return;
      const isActive = key === state;
      icon.classList.toggle('is-active', isActive);
      if(isActive){
        icon.removeAttribute('hidden');
      } else {
        icon.setAttribute('hidden', '');
      }
    });
  };
  if(!viewerState.isVoiceSupported){
    voiceButton.disabled = true;
    voiceButton.setAttribute('aria-pressed', 'false');
    voiceButton.setAttribute('aria-disabled', 'true');
    voiceButton.classList.remove('is-on');
    setActiveState('unavailable');
    const label = 'Voice unavailable';
    voiceButton.setAttribute('aria-label', label);
    if(labelEl){
      labelEl.textContent = label;
    }
    if(voiceInfo){
      voiceInfo.hidden = false;
    }
    return;
  }
  const hasSteps = viewerState.steps.length > 0 && Number.isFinite(viewerState.pinCount) && viewerState.pinCount > 0;
  voiceButton.disabled = !hasSteps;
  if(!hasSteps){
    voiceButton.setAttribute('aria-disabled', 'true');
  } else {
    voiceButton.removeAttribute('aria-disabled');
  }
  const isOn = !!viewerState.isVoiceOn && viewerState.isVoiceSupported;
  voiceButton.setAttribute('aria-pressed', isOn ? 'true' : 'false');
  voiceButton.classList.toggle('is-on', isOn);
  setActiveState(isOn ? 'on' : 'off');
  const label = isOn ? 'Voice on' : 'Voice off';
  voiceButton.setAttribute('aria-label', label);
  if(labelEl){
    labelEl.textContent = label;
  }
  if(voiceInfo){
    voiceInfo.hidden = true;
  }
}

function announcePin(pinNumber){
  if(!viewerState.isVoiceSupported || !viewerState.isVoiceOn) return;
  if(!Number.isFinite(pinNumber)) return;
  try{
    if(typeof window !== 'undefined' && window.speechSynthesis){
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(`Pin ${pinNumber}`);
      utterance.lang = 'en-US';
      window.speechSynthesis.speak(utterance);
    }
  } catch(err){
    // ignore speech synthesis errors
  }
}

function clearViewer(){
  const canvas = viewerState.ui.canvas || document.getElementById('viewer-canvas');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  if(ctx) ctx.clearRect(0,0,canvas.width,canvas.height);
}

function applyViewerSteps(steps, pinCount, {announce = false} = {}){
  const normalizedSteps = Array.isArray(steps) ? steps.filter(n=>Number.isFinite(n)) : [];
  const normalizedPinCount = Number.isFinite(pinCount) ? pinCount : 0;
  stopAutoPlay();
  viewerState.steps = normalizedSteps;
  viewerState.pinCount = normalizedPinCount;
  viewerState.stepIndex = 0;
  updateSpeedButton();
  updatePlayButton();
  const shouldAnnounce = announce && normalizedSteps.length>0 && normalizedPinCount>0;
  setStep(0, { announce: shouldAnnounce });
}

export function mount(){
  navButtons = Array.from(document.querySelectorAll('.app-nav [data-nav]'));
  navButtons.forEach(b=>{ b.addEventListener('click', ()=>State.go(+b.dataset.nav)); });
  setActiveNav(State.get().screen);
  if(removeNavigateListener) removeNavigateListener();
  removeNavigateListener = State.onNavigate(setActiveNav);
  const file = document.getElementById('e1-file'); file.addEventListener('change', onPickImage);
  refreshProjectList(); bindCrop(); bindGenerate(); bindViewer();
}

function setActiveNav(screenId){
  const target = Number(screenId);
  navButtons.forEach(btn=>{
    const isActive = Number(btn.dataset.nav) === target;
    btn.classList.toggle('is-active', isActive);
    if(isActive){
      btn.setAttribute('aria-current','page');
    } else {
      btn.removeAttribute('aria-current');
    }
  });
  if(target === 4){
    const triggerDraw = ()=>drawViewer(viewerState.stepIndex);
    if(typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'){
      window.requestAnimationFrame(triggerDraw);
    } else {
      setTimeout(triggerDraw, 0);
    }
  }
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
  applyViewerSteps(hasDrawable ? steps : [], hasPins ? pinCount : 0, {announce:false});

  if(!hasDrawable && viewerCanvas){
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
        applyViewerSteps(data.steps, p.params.pins, {announce:false});
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
  const ui = viewerState.ui;
  ui.canvas = document.getElementById('viewer-canvas');
  ui.firstButton = document.getElementById('e4-first');
  ui.prevButton = document.getElementById('e4-prev');
  ui.playButton = document.getElementById('e4-play');
  ui.nextButton = document.getElementById('e4-next');
  ui.lastButton = document.getElementById('e4-last');
  ui.speedButton = document.getElementById('e4-speed');
  ui.speedMenu = document.getElementById('e4-speed-menu');
  ui.voiceButton = document.getElementById('e4-voice');
  ui.jumpButton = document.getElementById('e4-step-jump');
  ui.progressFill = document.getElementById('e4-progress-fill');
  ui.progressLabel = document.getElementById('e4-progress-label');
  ui.progressBar = document.querySelector('.e4-progress-bar');
  ui.prevPinCell = document.getElementById('e4-prev-pin');
  ui.currentPinCell = document.getElementById('e4-current-pin');
  ui.nextPinCell = document.getElementById('e4-next-pin');

  setupSpeedMenu();

  const canvas = ui.canvas;
  const expPNG = document.getElementById('exp-png');
  const expSVGb = document.getElementById('exp-svg');
  const expCSVb = document.getElementById('exp-csv');
  const expJSONb = document.getElementById('exp-json');

  if(viewerResizeObserver){
    viewerResizeObserver.disconnect();
    viewerResizeObserver = null;
  }
  viewerLastObservedWidth = 0;
  if(canvas && typeof ResizeObserver !== 'undefined'){
    const target = canvas.parentElement || canvas;
    if(target){
      viewerResizeObserver = new ResizeObserver(entries=>{
        for(const entry of entries){
          const rect = entry.contentRect || {};
          const width = Math.round(rect.width || entry.target.clientWidth || 0);
          if(width <= 0){
            continue;
          }
          const shouldDraw = viewerPendingDraw || width !== viewerLastObservedWidth;
          viewerLastObservedWidth = width;
          if(shouldDraw){
            drawViewer(viewerState.stepIndex);
          }
        }
      });
      viewerResizeObserver.observe(target);
    }
  }

  if(ui.firstButton){
    ui.firstButton.addEventListener('click', ()=>{
      stopAutoPlay();
      setStep(0, {announce:true});
    });
  }
  if(ui.lastButton){
    ui.lastButton.addEventListener('click', ()=>{
      stopAutoPlay();
      setStep(viewerState.steps.length - 1, {announce:true});
    });
  }
  if(ui.prevButton){
    ui.prevButton.addEventListener('click', ()=>{
      stopAutoPlay();
      setStep(viewerState.stepIndex - 1, {announce:true});
    });
  }
  if(ui.nextButton){
    ui.nextButton.addEventListener('click', ()=>{
      stopAutoPlay();
      setStep(viewerState.stepIndex + 1, {announce:true});
    });
  }
  if(ui.playButton){ ui.playButton.addEventListener('click', toggleAutoPlay); }
  if(ui.voiceButton){ ui.voiceButton.addEventListener('click', toggleVoice); }
  if(ui.jumpButton){
    ui.jumpButton.addEventListener('click', ()=>{
      if(viewerState.steps.length===0) return;
      const maxIndex = viewerState.steps.length - 1;
      const input = prompt(`Go to step (0-${maxIndex})`, String(viewerState.stepIndex));
      if(input===null) return;
      const num = Number.parseInt(input, 10);
      if(Number.isFinite(num)){
        const clamped = Math.max(0, Math.min(num, maxIndex));
        stopAutoPlay();
        setStep(clamped, {announce:true});
      }
    });
  }

  if(ui.voiceButton && !viewerState.isVoiceSupported){
    if(!ui.voiceInfo){
      const info = document.createElement('span');
      info.className = 'tiny e4-voice-info';
      info.textContent = 'Speech synthesis not supported in this browser.';
      ui.voiceButton.insertAdjacentElement('afterend', info);
      ui.voiceInfo = info;
    } else {
      ui.voiceInfo.hidden = false;
    }
  }

  if(expPNG){ expPNG.addEventListener('click', ()=>{ if(!canvas) return; const url=canvas.toDataURL('image/png'); downloadURL(url,'string-art.png'); }); }
  if(expSVGb){ expSVGb.addEventListener('click', ()=>{ const p=State.get().project; if(!p) return; const steps=(p.stepsCSV||'').split(',').map(s=>+s).filter(n=>Number.isFinite(n)); const blob=exportSVG(p.size, buildPins(p.size, p.params.pins), steps, p.params); const url=URL.createObjectURL(blob); downloadURL(url,'string-art.svg'); URL.revokeObjectURL(url); }); }
  if(expCSVb){ expCSVb.addEventListener('click', ()=>{ const p=State.get().project; if(!p) return; const steps=(p.stepsCSV||'').split(',').map(s=>+s).filter(n=>Number.isFinite(n)); const blob=exportCSV(steps, buildPins(p.size, p.params.pins)); const url=URL.createObjectURL(blob); downloadURL(url,'string-art.csv'); URL.revokeObjectURL(url); }); }
  if(expJSONb){ expJSONb.addEventListener('click', ()=>{ const p=State.get().project; if(!p) return; const preset={brand:'Hammer Design', pins:p.params.pins, strings:p.params.strings, minDist:p.params.minDist, fade:p.params.fade, widthPx:p.params.widthPx, alpha:p.params.alpha, color:p.params.color, board:p.params.board, seed:p.params.seed, locale:(navigator.language||'en').slice(0,2), watermark:'© 2025 Hammer Design'}; const blob=new Blob([JSON.stringify(preset,null,2)], {type:'application/json'}); const url=URL.createObjectURL(blob); downloadURL(url,'preset.json'); URL.revokeObjectURL(url); }); }

  function downloadURL(url,name){ const a=document.createElement('a'); a.href=url; a.download=name; a.click(); }

  if(viewerState.steps.length === 0){
    resetViewer();
  } else {
    updateProgressIndicators();
    updateTransportState();
    updateSpeedButton();
    updateVoiceButton();
    updatePlayButton();
  }
}

function drawViewer(stepIndex){
  const p = State.get().project;
  const canvas = viewerState.ui.canvas || document.getElementById('viewer-canvas');
  if(!p || !canvas){
    clearViewer();
    viewerPendingDraw = false;
    return;
  }

  const steps = viewerState.steps;
  const pinCountCandidate = Number.isFinite(viewerState.pinCount) && viewerState.pinCount>0 ? viewerState.pinCount : Number(p.params?.pins);
  const pinCount = Number(pinCountCandidate);

  if(!Array.isArray(steps) || steps.length===0 || !Number.isFinite(pinCount) || pinCount<=0 || !p.size){
    clearViewer();
    viewerPendingDraw = false;
    return;
  }

  const parent = canvas.parentElement;
  if(!parent){
    clearViewer();
    viewerPendingDraw = false;
    return;
  }

  const cssSize = parent.clientWidth || 0;
  if(!(cssSize > 0)){
    viewerPendingDraw = true;
    return;
  }

  viewerPendingDraw = false;
  viewerLastObservedWidth = Math.round(cssSize);

  const clamped = Math.max(0, Math.min(stepIndex, steps.length-1));
  const subset = steps.slice(0, clamped+1);
  const pins = buildPins(p.size, pinCount);
  renderPinsAndStrings(canvas, p.size, pins, subset, p.params);
}

function buildPins(size, n){
  const cx=size/2, cy=size/2, R=(size/2)-BOARD_MARGIN;
  const arr=new Array(n), step=Math.PI*2/n;
  for(let i=0;i<n;i++){ const ang=i*step; arr[i]={id:i, x:Math.round(cx+R*Math.cos(ang)), y:Math.round(cy+R*Math.sin(ang))}; }
  return arr;
}
