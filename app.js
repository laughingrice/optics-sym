// Optics Sandbox — app.js
// Lightweight, serverless ray optics demo

// early startup check
try{ window.__app_loaded = 'yes'; setStatus && setStatus('App starting'); console.log('app.js: starting — __app_loaded set'); }catch(e){ console.warn('startup status unavailable'); }

let canvas = document.getElementById('scene');
let ctx = null;
if(!canvas){ const b=document.getElementById('app-error'); if(b){ b.style.display='block'; b.textContent='Initialization error: canvas element not found'; } try{ setStatus('Error', true); }catch(e){} throw new Error('canvas element not found'); }
try{ ctx = canvas.getContext('2d'); }catch(e){ const b=document.getElementById('app-error'); if(b){ b.style.display='block'; b.textContent='Initialization error: failed to get canvas context: ' + e.message; } try{ setStatus('Error', true); }catch(err){} throw e; }
let W = canvas.width; let H = canvas.height;

// status helpers and global error handlers
function setStatus(text, isError){ const el = document.getElementById('app-status'); if(el){ el.textContent = text; el.classList.toggle('error', !!isError); } }
window.addEventListener('error', (e)=>{ try{ const b=document.getElementById('app-error'); if(b){ b.style.display='block'; b.textContent = (e && e.message ? e.message : String(e)) + (e.filename ? '\n' + e.filename + ':' + e.lineno + ':' + e.colno : ''); } setStatus('Error', true); console.error('Uncaught error', e); }catch(err){console.error(err)} });
window.addEventListener('unhandledrejection', (e)=>{ try{ const b=document.getElementById('app-error'); if(b){ b.style.display='block'; const msg = e && e.reason && e.reason.message ? e.reason.message : String(e.reason); b.textContent = 'Unhandled Rejection: ' + msg; } setStatus('Error', true); console.error('Unhandled rejection', e); }catch(err){console.error(err)} });

// View transform (world space to canvas)
const view = { offsetX: 0, offsetY: 0, scale: 0.9 };
let panning = false; let panStart = null;
let snapToGrid = false; let gridSize = 40; let autosave = true; let historyVisible = false;
let spaceDown = false;
let diagnostics = false; let diagHits = []; // toggles and collected hit diagnostics
// restore diagnostics flag if saved
try{ const sd = localStorage.getItem('optics-sandbox-diag'); if(sd !== null) diagnostics = sd === '1'; }catch(e){}

// safe JSON stringify (handles circular references)
function safeStringify(obj, space){ try{ const seen = new WeakSet(); return JSON.stringify(obj, function(k,v){ if(v && typeof v === 'object'){ if(seen.has(v)) return '[Circular]'; seen.add(v); } return v; }, space); }catch(e){ try{ return String(obj); }catch(e2){ return '(unserializable)'; } } }

function clearDiagnostics(){ diagHits.length = 0; }
let rotating = null; // {item, startAngle, startMouseAngle}
let draggingApertureHandle = null; // {item, which:'left'|'right', startLeft, startRight, changed}
let rotatingChanged = false;
window.addEventListener('keydown', e=>{ if(e.code === 'Space') { spaceDown = true; canvas.style.cursor = 'grab'; } });
window.addEventListener('keyup', e=>{ if(e.code === 'Space') { spaceDown = false; canvas.style.cursor = 'default'; } });
// Scene storage
const scene = { items: [], nextId: 1 };
let selected = null;
let dragging = null;
let dragOffset = {x:0,y:0};

// Settings
const settings = {
  showRays: true,
  maxDepth: 6,
  raySamples: 15,
  snapAngles: false, // snap rotations to 15° when enabled
  // disable experimental thick lens model by default until it's stable
  disableThickLens: true
};
// restore persistent flags related to settings
try{
  const sdb = localStorage.getItem('optics-sandbox-disableThickLens');
  if(sdb !== null) settings.disableThickLens = sdb === '1';
  const ssa = localStorage.getItem('optics-sandbox-snapAngles');
  if(ssa !== null) settings.snapAngles = ssa === '1';
}catch(e){ /* noop */ }

// Simple undo/redo history (stores shallow scene snapshots)
const history = { undo: [], redo: [], max: 60 };
let propChangeTimer = null; // debounce timer for property edits
let draggingChanged = false;

function cloneSceneItems(){ return JSON.parse(JSON.stringify(scene.items)); }

function updateUndoButtons(){
  const ub = document.getElementById('undo-btn');
  const rb = document.getElementById('redo-btn');
  if(ub) ub.disabled = history.undo.length <= 1;
  if(rb) rb.disabled = history.redo.length === 0;
}

function saveState(label){
  const state = { items: cloneSceneItems(), selectedId: selected ? selected.id : null, label: label || ('Step ' + (history.undo.length+1)), ts: Date.now() };
  const last = history.undo[history.undo.length-1];
  if(last && JSON.stringify(last.items) === JSON.stringify(state.items)) return; // no-op
  history.undo.push(state);
  if(history.undo.length > history.max) history.undo.shift();
  history.redo = [];
  updateUndoButtons();
  renderHistoryList();
  if(autosave) localSave();
}

function renderHistoryList(){
  const container = document.getElementById('history-list'); if(!container) return; container.innerHTML='';
  history.undo.forEach((s, i)=>{
    const d = new Date(s.ts || Date.now());
    const item = document.createElement('div'); item.className='hist-item'; if(i===history.undo.length-1) item.classList.add('active');
    item.textContent = `${i}: ${s.label || 'Step'} — ${d.toLocaleTimeString()}`;
    item.onclick = ()=>{ if(i === history.undo.length-1) return; restoreState(s); // trim undo stack to i+1
      history.redo = history.undo.splice(i+1); renderHistoryList(); updateUndoButtons(); };
    container.appendChild(item);
  });
}

function localSave(){ try{ const payload = { items: cloneSceneItems(), view }; localStorage.setItem('optics-sandbox-scene', JSON.stringify(payload)); }catch(e){/* noop */} }

function localLoad(){ try{ const doc = JSON.parse(localStorage.getItem('optics-sandbox-scene') || 'null'); if(doc && doc.items){ scene.items = doc.items; scene.nextId = scene.items.reduce((m,it)=>Math.max(m,it.id||0),0)+1; if(doc.view) Object.assign(view, doc.view); saveState('Loaded autosave'); render(); } }catch(e){console.warn('load failed', e); } }
function restoreState(state){
  scene.items = JSON.parse(JSON.stringify(state.items));
  scene.nextId = scene.items.reduce((m,it)=>Math.max(m,it.id),0) + 1;
  selected = scene.items.find(it=>it.id===state.selectedId) || null;
  showProperties(selected);
  render();
}

function undo(){ if(history.undo.length <= 1) return; const cur = history.undo.pop(); history.redo.push(cur); const prev = history.undo[history.undo.length-1]; restoreState(prev); updateUndoButtons(); }
function redo(){ if(history.redo.length === 0) return; const s = history.redo.pop(); history.undo.push(s); restoreState(s); updateUndoButtons(); }

function symmetryTest(){
  // find primary light and primary lens
  const light = scene.items.find(it=>it.type==='light');
  const lens = scene.items.find(it=>it.type==='lens');
  const mirror = scene.items.find(it=>it.type==='mirror');
  if(!light || !lens || !mirror){ alert('Symmetry Test requires at least one light, one lens and one mirror'); return; }
  const N = Math.max(1, Math.min(300, light.beams || 40));
  let reached = 0; let returned = 0; let failed = 0;
  clearDiagnostics();
  for(let i=0;i<N;i++){
    const a = deg2rad((light.direction||0) - deg2rad(0));
    // compute angle distribution
    const spread = deg2rad(light.spread || 0);
    const ang = (light.even ? ( (i/(N-1))*spread - spread/2 + deg2rad(light.direction||0) ) : (Math.random()*spread - spread/2 + deg2rad(light.direction||0)));
    const start = {x: light.x, y: light.y}; const dir = {x:Math.cos(ang), y:Math.sin(ang)};
    const rayLines = []; const localDiag=[];
    traceRay(start, dir, settings.maxDepth, rayLines, 1, localDiag, light.color || '#ffd700');
    // find first mirror reflection
    const mirrorIdx = localDiag.findIndex(h=>h.type==='mirror' && h.action && h.action.startsWith('R'));
    if(mirrorIdx < 0) continue; reached++;
    // after mirror, check for lens transmissions
    const after = localDiag.slice(mirrorIdx+1);
    const lensTransmit = after.find(h=>h.type==='lens' && h.action && h.action.startsWith('T'));
    const lensReflect = after.find(h=>h.type==='lens' && h.action && h.action.startsWith('R'));
    if(lensTransmit){ returned++; } else if(lensReflect){ failed++; if(lensReflect && diagnostics){ diagHits.push({x:lensReflect.x,y:lensReflect.y,normal:lensReflect.normal || null, type:'lens', action:'F'}); } }
    // merge localDiag into global if diagnostics enabled
    if(diagnostics){ for(const d of localDiag) diagHits.push(d); }
  }
  render();
  alert(`Symmetry test: rays reaching mirror: ${reached}, returned through lens: ${returned}, failed (reflected on return): ${failed}`);
}

function loadTestScene(){
  scene.items.length = 0;
  // simple test: light -> thin lens -> mirror -> return through lens
  scene.items.push(Object.assign(makeItem('light', 100, 300),{direction:0,beams:60,spread:10,even:true}));
  scene.items.push(Object.assign(makeItem('lens', 320, 300),{angle:0,focal:120,diam:160,model:'thin'}));
  scene.items.push(Object.assign(makeItem('mirror', 720, 300),{angle:90,length:320}));
  view.offsetX = 0; view.offsetY = 0; view.scale = 1;
  saveState('Test scene'); render(); }


function scheduleSaveState(){ if(propChangeTimer) clearTimeout(propChangeTimer); propChangeTimer = setTimeout(()=>{ saveState(); propChangeTimer = null; }, 400); }

function randId(){return scene.nextId++;}

function deg2rad(d){return d*Math.PI/180}
function rad2deg(r){return r*180/Math.PI}

function vectorFromAngle(a){ // a in radians
  return {x:Math.cos(a), y:Math.sin(a)};
}

function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}

// Base item
function makeItem(type, x=W/2, y=H/2){
  const base = { id: randId(), type, x, y, angle: 0 };
  if(type==='light') Object.assign(base,{beams:15, spread:10, direction:0, even:true, color:'#ff0000'});
  if(type==='lens') Object.assign(base,{focal:200, diam:120});
  if(type==='mirror') Object.assign(base,{length:240});
  if(type==='splitter') Object.assign(base,{length:240, reflect:0.5});
  if(type==='aperture') Object.assign(base,{aperture:80, size:120, apertureOffset:0});
  if(type==='light') Object.assign(base,{showRays:true});
  return base;
}

// UI bindings — wrapped in try/catch to surface initialization errors
try{
  const addLightBtn = document.getElementById('add-light');
  const addLensBtn = document.getElementById('add-lens');
  const addMirrorBtn = document.getElementById('add-mirror');
  const addSplitterBtn = document.getElementById('add-splitter');
  const clearSceneBtn = document.getElementById('clear-scene');
  const exportPngBtn = document.getElementById('export-png');
  const exportJsonBtn = document.getElementById('export-json');
  const importJsonBtn = document.getElementById('import-json');
  const importJsonFile = document.getElementById('import-json-file');
  const undoBtn = document.getElementById('undo-btn');
  const redoBtn = document.getElementById('redo-btn');

  addLightBtn.onclick = ()=>{scene.items.push(makeItem('light')); saveState(); render();}
  addLensBtn.onclick  = ()=>{scene.items.push(makeItem('lens')); saveState(); render();}
  addMirrorBtn.onclick=()=>{scene.items.push(makeItem('mirror')); saveState(); render();}
  addSplitterBtn.onclick=()=>{scene.items.push(makeItem('splitter')); saveState(); render();}
  const addApertureBtn = document.getElementById('add-aperture'); if(addApertureBtn) addApertureBtn.onclick = ()=>{ scene.items.push(makeItem('aperture')); saveState(); render(); }
  clearSceneBtn.onclick=()=>{scene.items.length=0; selected=null; saveState(); showProperties(null); render();}
  exportPngBtn.onclick=()=>{const link=document.createElement('a');link.href=canvas.toDataURL('image/png');link.download='optics.png';link.click();}

  exportJsonBtn.onclick = ()=>{
    const payload = { items: cloneSceneItems(), view };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'optics-scene.json'; a.click(); URL.revokeObjectURL(url);
  }
  importJsonBtn.onclick = ()=>{ importJsonFile.click(); }
  importJsonFile.onchange = (e)=>{
    const f = e.target.files && e.target.files[0]; if(!f) return;
    const r = new FileReader(); r.onload = ev=>{
      try{
        const doc = JSON.parse(ev.target.result);
        if(!doc.items || !Array.isArray(doc.items)) throw new Error('invalid');
        scene.items = doc.items; scene.nextId = scene.items.reduce((m,it)=>Math.max(m,it.id||0),0)+1; selected=null; if(doc.view) Object.assign(view, doc.view); saveState('Imported'); render();
      }catch(err){ alert('Failed to import JSON: ' + err.message); }
    };
    r.readAsText(f);
  }

  undoBtn.onclick = ()=>undo();
  redoBtn.onclick = ()=>redo();

  // toggle history panel
  const toggleHistoryBtn = document.getElementById('toggle-history');
  const historyPanel = document.getElementById('history-panel');
  const historyClearBtn = document.getElementById('history-clear');
  if(toggleHistoryBtn){ toggleHistoryBtn.onclick = ()=>{ historyVisible = !historyVisible; historyPanel.style.display = historyVisible ? 'block' : 'none'; toggleHistoryBtn.textContent = historyVisible ? 'Hide History' : 'Show History'; renderHistoryList(); } }
  if(historyClearBtn) historyClearBtn.onclick = ()=>{ history.undo = []; history.redo = []; saveState('Cleared history'); renderHistoryList(); updateUndoButtons(); }

  // snap and autosave bindings
  const snapGridEl = document.getElementById('snap-grid'); const gridSizeEl = document.getElementById('grid-size');
  const autosaveEl = document.getElementById('autosave'); const zoomSlider = document.getElementById('zoom-slider'); const resetViewBtn = document.getElementById('reset-view');
  const diagToggle = document.getElementById('diag-toggle'); const loadTestBtn = document.getElementById('load-test');
  if(snapGridEl) snapGridEl.onchange = e=>{ snapToGrid = e.target.checked; }
  if(gridSizeEl) gridSizeEl.onchange = e=>{ gridSize = +e.target.value; render(); }
  if(autosaveEl) autosaveEl.onchange = e=>{ autosave = e.target.checked; if(autosave) localSave(); }
  if(zoomSlider) zoomSlider.oninput = e=>{ view.scale = +e.target.value; render(); }
  if(resetViewBtn) resetViewBtn.onclick = ()=>{ view.offsetX = 0; view.offsetY = 0; view.scale = 1; render(); }
  if(diagToggle) diagToggle.onchange = e=>{ diagnostics = e.target.checked; try{ localStorage.setItem('optics-sandbox-diag', diagnostics ? '1' : '0'); }catch(err){} if(!diagnostics) clearDiagnostics(); render(); }
  if(loadTestBtn) loadTestBtn.onclick = ()=>{ loadTestScene(); }
  const symTestBtn = document.getElementById('sym-test'); if(symTestBtn) symTestBtn.onclick = ()=>{ symmetryTest(); }
  // local load/save exposed
  document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState === 'hidden') localSave(); });

  // mark UI bindings complete for diagnosis
  setStatus('UI initialized');

}catch(err){
  console.error('Initialization error', err);
  const banner = document.getElementById('app-error'); if(banner){ banner.style.display='block'; banner.textContent='Initialization error: ' + (err && err.message ? err.message : String(err)); }
  const st = document.getElementById('app-status'); if(st){ st.textContent='Error'; st.classList.add('error'); }
}


// Controls
const showRaysEl = document.getElementById('show-rays');
const maxDepthEl = document.getElementById('max-depth');
const raySamplesEl = document.getElementById('ray-samples');
const enableThickEl = document.getElementById('enable-thick-lens');
const snapAngleEl = document.getElementById('snap-angle');
// initialize UI states
showRaysEl.onchange = e=>{settings.showRays = e.target.checked; render()}
maxDepthEl.onchange = e=>{settings.maxDepth = +e.target.value; render()}
raySamplesEl.onchange = e=>{settings.raySamples = +e.target.value; render()}
if(enableThickEl){ enableThickEl.checked = !settings.disableThickLens; enableThickEl.onchange = e=>{ settings.disableThickLens = !e.target.checked; try{ localStorage.setItem('optics-sandbox-disableThickLens', settings.disableThickLens ? '1' : '0'); }catch(err){} updateLensModelOption(); render(); } }
if(snapAngleEl){ snapAngleEl.checked = !!settings.snapAngles; snapAngleEl.onchange = e=>{ settings.snapAngles = !!e.target.checked; try{ localStorage.setItem('optics-sandbox-snapAngles', settings.snapAngles ? '1' : '0'); }catch(err){} render(); } }

// Properties panel elements
const propsPanel = document.getElementById('props');
const noSel = document.getElementById('no-selection');
const propsType = document.getElementById('props-type');
const deleteBtn = document.getElementById('delete-object');

// Light controls
const propBeams = document.getElementById('prop-beams');
const valBeams = document.getElementById('val-beams');
const propDir = document.getElementById('prop-direction');
const valDir = document.getElementById('val-direction');
const propAngle = document.getElementById('prop-angle');
const valAngle = document.getElementById('val-angle');
const propEven = document.getElementById('prop-even');

// Lens
const propFocal = document.getElementById('prop-focal');
const valFocal = document.getElementById('val-focal');
const propDiam = document.getElementById('prop-diam');
const valDiam = document.getElementById('val-diam');

// Mirror
const propLength = document.getElementById('prop-length');
const valLength = document.getElementById('val-length');

// Splitter
const propReflect = document.getElementById('prop-reflect');
const valReflect = document.getElementById('val-reflect');
const propLength2 = document.getElementById('prop-length-2');
const valLength2 = document.getElementById('val-length-2');

// Aperture
const propAperture = document.getElementById('prop-aperture');
const valAperture = document.getElementById('val-aperture');
const propApertureTotal = document.getElementById('prop-aperture-total');
const valApertureTotal = document.getElementById('val-aperture-total');
const propApertureOffset = document.getElementById('prop-aperture-offset');
const valApertureOffset = document.getElementById('val-aperture-offset');
const propApertureOffsetNum = document.getElementById('prop-aperture-offset-num');

// per-light visibility checkbox in properties
const propShowRays = document.getElementById('prop-show-rays');

// Rotation controls (universal)
const propAngleRot = document.getElementById('prop-angle-rot');
const propAngleNum = document.getElementById('prop-angle-num');

function showProperties(item){
  if(!item){ propsPanel.style.display='none'; noSel.style.display='block'; return }
  propsPanel.style.display='block'; noSel.style.display='none';
  propsType.textContent = item.type.toUpperCase() + ` #${item.id}`;

  // set rotation controls
  if(typeof propAngleRot !== 'undefined'){
    propAngleRot.value = item.angle || 0;
    propAngleNum.value = item.angle || 0;
  }

  // show/hide groups
  document.querySelectorAll('.prop-group').forEach(g=>g.style.display='none');
  if(item.type==='light'){
    document.getElementById('light-props').style.display='block';
    propBeams.value = item.beams; valBeams.textContent=item.beams;
    propDir.value = (item.direction||0); valDir.textContent = (item.direction||0)+"°";
    propAngle.value = item.spread; valAngle.textContent=item.spread+"°";
    propEven.checked = !!item.even;
    // visibility
    if(propShowRays) propShowRays.checked = (item.showRays !== false);
    // color
    if(propColor){ propColor.value = item.color || '#ffd700'; valColor.textContent = propColor.value; }
  }
  if(item.type==='lens'){
    document.getElementById('lens-props').style.display='block';
    propFocal.value=item.focal; valFocal.textContent=item.focal;
    propDiam.value=item.diam; valDiam.textContent=item.diam;
    // lens model
    if(!item.model) item.model = 'thin';
    propLensModel.value = item.model;
    document.getElementById('lens-thin-group').style.display = item.model === 'thin' ? 'block' : 'none';
    document.getElementById('lens-thick-group').style.display = item.model === 'thick' ? 'block' : 'none';
    propLensN.value = item.n || 1.5; valLensN.textContent = propLensN.value;
    propLensR1.value = item.r1 || 160; propLensR2.value = item.r2 || 160; propLensThick.value = item.thickness || 20;
  }
  if(item.type==='mirror'){
    document.getElementById('mirror-props').style.display='block';
    propLength.value=item.length; valLength.textContent=item.length;
  }
  if(item.type==='splitter'){
    document.getElementById('splitter-props').style.display='block';
    propReflect.value=item.reflect; valReflect.textContent=item.reflect;
    propLength2.value=item.length; valLength2.textContent=item.length;
  }
  if(item.type==='aperture'){
    document.getElementById('aperture-props').style.display='block';
    propAperture.value = item.aperture; valAperture.textContent = item.aperture;
    propApertureTotal.value = item.size; valApertureTotal.textContent = item.size;
    if(propApertureOffset){ propApertureOffset.value = (item.apertureOffset || 0); valApertureOffset.textContent = (item.apertureOffset || 0); if(propApertureOffsetNum) propApertureOffsetNum.value = (item.apertureOffset || 0); }
  }
}

// prop events
propBeams.oninput = ()=>{ if(!selected) return; selected.beams=+propBeams.value; valBeams.textContent=selected.beams; render(); scheduleSaveState(); }
if(propShowRays) propShowRays.onchange = ()=>{ if(!selected || selected.type!=='light') return; selected.showRays = !!propShowRays.checked; saveState('Show/hide light'); render(); }
propDir.oninput = ()=>{ if(!selected) return; selected.direction=+propDir.value; selected.angle = selected.direction; if(typeof propAngleRot !== 'undefined'){ propAngleRot.value = selected.angle; propAngleNum.value = selected.angle; } valDir.textContent=selected.direction+"°"; render(); scheduleSaveState(); }
propAngle.oninput = ()=>{ if(!selected) return; selected.spread=+propAngle.value; valAngle.textContent=selected.spread+"°"; render(); scheduleSaveState(); }
propEven.onchange = ()=>{ if(!selected) return; selected.even = propEven.checked; render(); saveState(); }

// aperture offset control
if(propApertureOffset) propApertureOffset.oninput = ()=>{ if(!selected || selected.type!=='aperture') return; const v = +propApertureOffset.value; const halfTotal = (selected.size||120)/2; const halfOpen = (selected.aperture||4)/2; const minOff = -halfTotal + halfOpen; const maxOff = halfTotal - halfOpen; selected.apertureOffset = Math.max(minOff, Math.min(maxOff, v)); valApertureOffset.textContent = selected.apertureOffset; if(propApertureOffsetNum) propApertureOffsetNum.value = selected.apertureOffset; scheduleSaveState(); render(); }
if(propApertureOffsetNum) propApertureOffsetNum.oninput = ()=>{ if(!selected || selected.type!=='aperture') return; const v = +propApertureOffsetNum.value; const halfTotal = (selected.size||120)/2; const halfOpen = (selected.aperture||4)/2; const minOff = -halfTotal + halfOpen; const maxOff = halfTotal - halfOpen; selected.apertureOffset = Math.max(minOff, Math.min(maxOff, v)); if(propApertureOffset) propApertureOffset.value = selected.apertureOffset; valApertureOffset.textContent = selected.apertureOffset; scheduleSaveState(); render(); }

// lens UI toggles
const propLensModel = document.getElementById('prop-lens-model');
const propLensN = document.getElementById('prop-lens-n');
const valLensN = document.getElementById('val-lens-n');
const propLensR1 = document.getElementById('prop-lens-r1');
const propLensR2 = document.getElementById('prop-lens-r2');
const propLensThick = document.getElementById('prop-lens-thick');

// ensure 'thick' option visibility matches the settings, and coerce selection when disabled
function updateLensModelOption(){
  try{
    if(!propLensModel) return;
    const opt = Array.from(propLensModel.options).find(o=>o.value==='thick');
    if(!opt) return;
    opt.hidden = settings.disableThickLens;
    opt.disabled = settings.disableThickLens;
    // if thick just got disabled and dropdown was on 'thick', switch to 'thin' and update selected lens
    if(settings.disableThickLens && propLensModel.value === 'thick'){
      propLensModel.value = 'thin';
      if(selected && selected.type === 'lens'){
        selected.model = 'thin';
        document.getElementById('lens-thin-group').style.display = 'block';
        document.getElementById('lens-thick-group').style.display = 'none';
        showProperties(selected);
        saveState('Coerce lens to thin model');
        render();
      }
    }
  }catch(e){ console.warn('updateLensModelOption failed', e); }
}
// ensure UI reflects current setting at init
updateLensModelOption();

propLensModel.onchange = ()=>{
  if(!selected || selected.type!=='lens') return;
  selected.model = propLensModel.value;
  document.getElementById('lens-thin-group').style.display = selected.model === 'thin' ? 'block' : 'none';
  document.getElementById('lens-thick-group').style.display = selected.model === 'thick' ? 'block' : 'none';
  render(); scheduleSaveState();
}
propLensN.oninput = ()=>{ if(!selected || selected.type!=='lens') return; selected.n = +propLensN.value; valLensN.textContent = selected.n; render(); scheduleSaveState(); }
propLensR1.oninput = ()=>{ if(!selected || selected.type!=='lens') return; selected.r1 = +propLensR1.value; scheduleSaveState(); render(); }
propLensR2.oninput = ()=>{ if(!selected || selected.type!=='lens') return; selected.r2 = +propLensR2.value; scheduleSaveState(); render(); }
propLensThick.oninput = ()=>{ if(!selected || selected.type!=='lens') return; selected.thickness = +propLensThick.value; scheduleSaveState(); render(); };

// aperture handlers
propAperture.oninput = ()=>{ if(!selected || selected.type!=='aperture') return; const v = Math.max(4, Math.min(+propAperture.value, selected.size || 1000)); selected.aperture = v; valAperture.textContent = selected.aperture; // ensure offset stays valid
  const halfTotal = (selected.size||120)/2; const halfOpen = selected.aperture/2; const minOff = -halfTotal + halfOpen; const maxOff = halfTotal - halfOpen; if(typeof selected.apertureOffset === 'undefined') selected.apertureOffset = 0; selected.apertureOffset = Math.max(minOff, Math.min(maxOff, selected.apertureOffset)); if(propApertureOffset){ propApertureOffset.value = selected.apertureOffset; valApertureOffset.textContent = selected.apertureOffset; } scheduleSaveState(); render(); }
propApertureTotal.oninput = ()=>{ if(!selected || selected.type!=='aperture') return; selected.size = +propApertureTotal.value; valApertureTotal.textContent = selected.size; // clamp aperture/offset to fit new total
  const halfTotal = (selected.size||120)/2; const halfOpen = (selected.aperture||4)/2; const minOff = -halfTotal + halfOpen; const maxOff = halfTotal - halfOpen; if(typeof selected.apertureOffset === 'undefined') selected.apertureOffset = 0; selected.apertureOffset = Math.max(minOff, Math.min(maxOff, selected.apertureOffset)); if(propApertureOffset){ propApertureOffset.value = selected.apertureOffset; valApertureOffset.textContent = selected.apertureOffset; } scheduleSaveState(); render(); }

// light color
const propColor = document.getElementById('prop-color'); const valColor = document.getElementById('val-color');
if(propColor) propColor.oninput = ()=>{ if(!selected || selected.type!=='light') return; selected.color = propColor.value; valColor.textContent = propColor.value; scheduleSaveState(); render(); }

// helper: convert #rrggbb to rgba string
function colorToRgba(hex, alpha){ try{ if(!hex) return `rgba(255,100,0,${alpha})`; if(hex[0]==='#'){ let h = hex.substring(1); if(h.length===3) h = h.split('').map(c=>c+c).join(''); const r = parseInt(h.substring(0,2),16); const g = parseInt(h.substring(2,4),16); const b = parseInt(h.substring(4,6),16); return `rgba(${r},${g},${b},${alpha})`; }
    // fallback: return with alpha if already rgba or rgb
    if(hex.startsWith('rgb')){
      const m = hex.match(/rgba?\(([^\)]+)\)/);
      if(m){ const parts = m[1].split(',').map(s=>s.trim()); return `rgba(${parts[0]},${parts[1]},${parts[2]},${alpha})`; }
    }
    return hex;
  }catch(e){ return `rgba(255,100,0,${alpha})`; } }
propFocal.oninput = ()=>{ if(!selected) return; selected.focal=+propFocal.value; valFocal.textContent=selected.focal; render(); scheduleSaveState(); }
propDiam.oninput = ()=>{ if(!selected) return; selected.diam=+propDiam.value; valDiam.textContent=selected.diam; render(); scheduleSaveState(); }
propLength.oninput = ()=>{ if(!selected) return; selected.length=+propLength.value; valLength.textContent=selected.length; render(); scheduleSaveState(); }
propReflect.oninput = ()=>{ if(!selected) return; selected.reflect=+propReflect.value; valReflect.textContent=selected.reflect; render(); scheduleSaveState(); }
propLength2.oninput = ()=>{ if(!selected) return; selected.length=+propLength2.value; valLength2.textContent=selected.length; render(); scheduleSaveState(); }

// rotation handlers
propAngleRot.oninput = ()=>{ if(!selected) return; selected.angle = +propAngleRot.value; propAngleNum.value = selected.angle; if(selected.type==='light'){ selected.direction = selected.angle; propDir.value = selected.direction; valDir.textContent=selected.direction+"°"; } render(); scheduleSaveState(); }
propAngleNum.oninput = ()=>{ if(!selected) return; selected.angle = +propAngleNum.value; propAngleRot.value = selected.angle; if(selected.type==='light'){ selected.direction = selected.angle; propDir.value = selected.direction; valDir.textContent=selected.direction+"°"; } render(); scheduleSaveState(); }

deleteBtn.onclick = ()=>{ if(!selected) return; const i=scene.items.findIndex(it=>it.id===selected.id); if(i>=0) scene.items.splice(i,1); selected=null; showProperties(null); saveState(); render(); }

// Canvas interactions
canvas.addEventListener('mousedown', e=>{
  const pos = getMouse(e);
  // diagnostic marker clicks should take precedence
  if(diagnostics && diagHits && diagHits.length){ for(let i=diagHits.length-1;i>=0;i--){ const h = diagHits[i]; const dx = pos.x - h.x, dy = pos.y - h.y; const d = Math.hypot(dx,dy); if(d < 12/view.scale){ const popup = document.getElementById('diag-popup'); if(popup){ try{ popup.style.display='block'; popup.innerHTML = '<button id="diag-close" style="float:right">Close</button><pre style="white-space:pre-wrap;font-size:13px">'+ safeStringify(h, 2) + '</pre>'; const pc = document.getElementById('diag-close'); if(pc) pc.onclick = ()=>{ popup.style.display='none'; }; }catch(err){ console.error('diag popup error', err); popup.style.display='block'; popup.textContent = 'Diagnostic: ' + String(h); } } e.stopPropagation(); e.preventDefault(); return; } } }
  // panning with middle (button 1) or spacebar + left click
  if(e.button === 1 || e.buttons === 4 || spaceDown){ panning = true; panStart = {x: e.clientX, y: e.clientY, ox: view.offsetX, oy: view.offsetY}; canvas.style.cursor='grabbing'; return }
  // rotation handle hit test (if selected)
  if(selected){ const handleDist = 36; let a = deg2rad(selected.angle||0); if(selected.type === 'aperture') a += Math.PI/2; const hx = selected.x + Math.cos(a)*handleDist, hy = selected.y + Math.sin(a)*handleDist; const d = Math.hypot(pos.x-hx,pos.y-hy); if(d < 10){ rotating = { item: selected, startMouseAngle: Math.atan2(pos.y-selected.y,pos.x-selected.x), startAngle: selected.angle||0 }; rotatingChanged = false; return; } }

  // aperture endpoint handle detection (allow dragging opening endpoints)
  for(let i=scene.items.length-1;i>=0;i--){ const it = scene.items[i]; if(it.type==='aperture'){
    const ang = deg2rad(it.angle); const ux = Math.cos(ang), uy = Math.sin(ang);
    const halfTotal = (it.size || 120)/2; const halfOpen = (it.aperture || 80)/2; const off = it.apertureOffset || 0;
    let left = -halfOpen + off; let right = halfOpen + off; left = Math.max(left, -halfTotal); right = Math.min(right, halfTotal);
    const lx = it.x + ux*left, ly = it.y + uy*left; const rx = it.x + ux*right, ry = it.y + uy*right;
    const dl = Math.hypot(pos.x-lx, pos.y-ly); const dr = Math.hypot(pos.x-rx, pos.y-ry);
    const thresh = 10;
    if(dl < thresh || dr < thresh){ selected = it; draggingApertureHandle = { item: it, which: (dl < dr ? 'left' : 'right'), startLeft: left, startRight: right, changed: false }; try{ showProperties(selected); }catch(e){}; return; }
  } }

  // check items (reverse order)
  for(let i=scene.items.length-1;i>=0;i--){
    const it = scene.items[i];
    if(hitTest(it,pos)) {
      try{
        selected = it; dragging = it; dragOffset.x = pos.x - it.x; dragOffset.y = pos.y - it.y; draggingChanged = false;
        saveState();
        try{ showProperties(selected); }catch(e){ console.error('showProperties error', e); const b=document.getElementById('app-error'); if(b){ b.style.display='block'; b.textContent = 'showProperties error: ' + (e && e.message ? e.message : String(e)); } setStatus('Error', true); }
        try{ render(); }catch(e){ console.error('render error after select', e); const b=document.getElementById('app-error'); if(b){ b.style.display='block'; b.textContent = 'Render error: ' + (e && e.message ? e.message : String(e)); } setStatus('Error', true); }
      }catch(e){ console.error('selection handling error', e); const b=document.getElementById('app-error'); if(b){ b.style.display='block'; b.textContent = 'Selection error: ' + (e && e.message ? e.message : String(e)); } setStatus('Error', true); }
      return }

  }
  // else deselect
  selected=null; showProperties(null); render();
  // start panning on left-drag background (convenience)
  if(e.button === 0){ panning = true; panStart = {x: e.clientX, y: e.clientY, ox: view.offsetX, oy: view.offsetY}; canvas.style.cursor='grabbing'; return; }
});

canvas.addEventListener('mousemove', e=>{
  const pos = getMouse(e);
  if(panning && panStart){
    const dx = (e.clientX - panStart.x);
    const dy = (e.clientY - panStart.y);
    view.offsetX = panStart.ox + dx;
    view.offsetY = panStart.oy + dy;
    render(); return;
  }
  if(rotating){
    const angNow = Math.atan2(pos.y-rotating.item.y, pos.x-rotating.item.x);
    let delta = (angNow - rotating.startMouseAngle) * 180 / Math.PI;
    // normalize to -180..180
    while(delta > 180) delta -= 360; while(delta < -180) delta += 360;
    rotating.item.angle = (rotating.startAngle + delta) % 360; if(rotating.item.angle < 0) rotating.item.angle += 360;
    // snap angles to 15° if enabled
    if(settings.snapAngles){ rotating.item.angle = Math.round(rotating.item.angle / 15) * 15; }
    if(rotating.item.type === 'light'){ rotating.item.direction = rotating.item.angle; propDir.value = rotating.item.direction; valDir.textContent = rotating.item.direction + '°'; }
    propAngleRot.value = rotating.item.angle; propAngleNum.value = rotating.item.angle; rotatingChanged = true; render();
    // show angle hint near handle
    try{
      const handleDist = 36; const a = deg2rad(rotating.item.angle||0);
      const hx = rotating.item.x + Math.cos(a)*handleDist, hy = rotating.item.y + Math.sin(a)*handleDist;
      const screen = worldToScreen(hx, hy);
      const hint = document.getElementById('interaction-hint'); if(hint){ hint.style.display='block'; hint.textContent = Math.round(rotating.item.angle) + '°'; hint.style.left = (screen.x) + 'px'; hint.style.top = (screen.y) + 'px'; }
    }catch(e){}
    return;
  }

  // dragging aperture endpoints
  if(draggingApertureHandle){
    try{
      const it = draggingApertureHandle.item; const ang = deg2rad(it.angle); const ux = Math.cos(ang), uy = Math.sin(ang);
      const dx = pos.x - it.x, dy = pos.y - it.y; let along = dx*ux + dy*uy; const halfTotal = (it.size||120)/2; along = Math.max(-halfTotal, Math.min(halfTotal, along));
      let left = draggingApertureHandle.startLeft, right = draggingApertureHandle.startRight;
      if(draggingApertureHandle.which === 'left'){
        left = Math.min(along, right - 4);
      } else {
        right = Math.max(along, left + 4);
      }
      if(left > right){ const tmp = left; left = right; right = tmp; draggingApertureHandle.which = (draggingApertureHandle.which === 'left') ? 'right' : 'left'; }
      const newAperture = Math.max(4, right - left);
      const newOffset = (left + right)/2;
      it.aperture = newAperture; it.apertureOffset = newOffset;
      if(selected && selected.id === it.id){ propAperture.value = it.aperture; valAperture.textContent = it.aperture; if(propApertureOffset){ propApertureOffset.value = it.apertureOffset; valApertureOffset.textContent = it.apertureOffset; if(propApertureOffsetNum) propApertureOffsetNum.value = it.apertureOffset; } }
      draggingApertureHandle.changed = true; render();
    }catch(e){ console.error('aperture handle drag error', e); }
    return;
  }
  if(dragging){
    const pos2 = pos;
    let nx = pos2.x - dragOffset.x, ny = pos2.y - dragOffset.y;
    if(snapToGrid){ nx = Math.round(nx/gridSize)*gridSize; ny = Math.round(ny/gridSize)*gridSize; }
    dragging.x = nx; dragging.y = ny; draggingChanged = true; render();
  }
});
canvas.addEventListener('mouseup', e=>{ if(draggingChanged){ saveState(); }
  if(rotating){ if(rotatingChanged) saveState('Rotate'); rotating=null; rotatingChanged=false; const hint = document.getElementById('interaction-hint'); if(hint){ hint.style.display='none'; } }
  if(draggingApertureHandle){ if(draggingApertureHandle.changed) saveState('Aperture handle'); draggingApertureHandle = null; }
  dragging=null; draggingChanged=false; panning=false; panStart=null; canvas.style.cursor='default'; });

// wheel zoom
canvas.addEventListener('wheel', e=>{
  e.preventDefault(); const s0 = view.scale; const delta = -e.deltaY * 0.001; const s1 = Math.min(3, Math.max(0.2, s0*(1+delta)));
  // zoom at mouse
  const r = canvas.getBoundingClientRect(); const sx = (e.clientX - r.left)*(canvas.width/r.width); const sy = (e.clientY - r.top)*(canvas.height/r.height);
  const wx = (sx - view.offsetX)/view.scale, wy = (sy - view.offsetY)/view.scale;
  view.scale = s1;
  view.offsetX = sx - wx*view.scale; view.offsetY = sy - wy*view.scale;
  const zs = document.getElementById('zoom-slider'); if(zs) zs.value = view.scale; render(); }, {passive:false});


canvas.addEventListener('mousemove', e=>{
  // (Removed redundant simple drag handler; main drag logic above handles snapping and state saving.)
});
// Note: mouseup and drag termination handled in the primary handlers above.
canvas.addEventListener('dblclick', e=>{
  const pos=getMouse(e);
  // rotate on double-click if selected
  for(let i=scene.items.length-1;i>=0;i--){ const it=scene.items[i]; if(hitTest(it,pos)){ it.angle = (it.angle + 20) % 360; if(it.type==='light'){ it.direction = it.angle; } showProperties(it); render(); saveState(); return }}
});

function getMouse(e){
  const r = canvas.getBoundingClientRect();
  const sx = (e.clientX - r.left)*(canvas.width/r.width);
  const sy = (e.clientY - r.top)*(canvas.height/r.height);
  // transform to world coords
  return {x: (sx - view.offsetX)/view.scale, y: (sy - view.offsetY)/view.scale };
}

function screenToWorld(sx, sy){ const r = canvas.getBoundingClientRect(); const cx = (sx - r.left)*(canvas.width/r.width); const cy = (sy - r.top)*(canvas.height/r.height); return {x: (cx - view.offsetX)/view.scale, y: (cy - view.offsetY)/view.scale }; }
function worldToScreen(px, py){ const r = canvas.getBoundingClientRect(); const sx = px*view.scale + view.offsetX; const sy = py*view.scale + view.offsetY; return {x: sx*(r.width/canvas.width)+r.left, y: sy*(r.height/canvas.height)+r.top}; }
function hitTest(it, pos){
  const dx = pos.x - it.x, dy = pos.y - it.y;
  if(it.type==='light') return Math.hypot(dx,dy) < 18;
  if(it.type==='lens') return Math.hypot(dx,dy) < it.diam/2 + 6;
  if(it.type==='mirror' || it.type==='splitter'){
    // line hit test
    const half = it.length/2; const ang = deg2rad(it.angle);
    const ux = Math.cos(ang), uy = Math.sin(ang);
    // project
    const px = dx*ux + dy*uy;
    const py = -dx*uy + dy*ux; // perpendicular distance
    return (Math.abs(py) < 8 && px > -half-6 && px < half+6);
  }
  if(it.type==='aperture'){
    // orientable linear aperture element — hit if within total length segment
    const halfTotal = (it.size || 120)/2; const ang = deg2rad(it.angle);
    const ax = Math.cos(ang), ay = Math.sin(ang); // axis direction of opening (aligned with element angle)
    const nx = Math.cos(ang + Math.PI/2), ny = Math.sin(ang + Math.PI/2); // plane normal
    const along = dx*ax + dy*ay; const perp = dx*nx + dy*ny;
    return (Math.abs(perp) < 8 && along > -halfTotal - 6 && along < halfTotal + 6);
  }
  return false;
}

// Rendering
function render(){
  ctx.save();
  // apply view transform
  ctx.setTransform(view.scale, 0, 0, view.scale, view.offsetX, view.offsetY);
  ctx.clearRect(-view.offsetX/view.scale, -view.offsetY/view.scale, canvas.width/view.scale, canvas.height/view.scale);

  // grid
  drawGrid();

  // rays
  if(settings.showRays) traceAndDrawRays();

  // draw lens focal markers when selected and it's a lens
  if(selected && selected.type === 'lens') drawLensFocal(selected);

  // items
  for(const it of scene.items) drawItem(it);

  // selection marker
  if(selected){ ctx.save(); ctx.strokeStyle='#ff6600'; ctx.lineWidth=2/view.scale; ctx.beginPath(); ctx.arc(selected.x, selected.y, 20,0,Math.PI*2); ctx.stroke();
    // rotation handle (for aperture point towards ray direction)
    const handleDist = 36; let handleAng = deg2rad(selected.angle||0);
    if(selected.type === 'aperture') handleAng += Math.PI/2; // point normal to the line so it indicates ray passage direction
    const hx = selected.x + Math.cos(handleAng)*handleDist, hy = selected.y + Math.sin(handleAng)*handleDist;
    ctx.beginPath(); ctx.moveTo(selected.x, selected.y); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.beginPath(); ctx.fillStyle='#ff6600'; ctx.arc(hx, hy, 6, 0, Math.PI*2); ctx.fill(); ctx.restore(); }
  ctx.restore();
  try{ renderLightsLegend(); }catch(e){}
}
function drawGrid(){
  ctx.save();
  // background
  ctx.fillStyle = '#fafafa';
  // draw by world coords
  const left = -view.offsetX / view.scale;
  const top = -view.offsetY / view.scale;
  const right = left + canvas.width / view.scale;
  const bottom = top + canvas.height / view.scale;
  ctx.fillRect(left, top, (right-left), (bottom-top));

  // grid lines
  ctx.strokeStyle='#f2f4f8'; ctx.lineWidth=1/view.scale;
  const g = gridSize;
  const startX = Math.floor(left/g)*g;
  const startY = Math.floor(top/g)*g;
  for(let x=startX; x<right; x+=g){ ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke(); }
  for(let y=startY; y<bottom; y+=g){ ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke(); }
  ctx.restore();
}

function computeLensFocalLength(lens){
  if(!lens) return 0;
  if(lens.model !== 'thick') return lens.focal || 200;
  const n = lens.n || 1.5; const d = lens.thickness || 0; const R1 = lens.r1 || 1e9; const R2 = lens.r2 || 1e9;
  if(Math.abs(R1) < 1e-6 || Math.abs(R2) < 1e-6) return lens.focal || 200;
  const invf = (n-1) * ( (1/R1) - (1/R2) + ((n-1)*d)/(n*R1*R2) );
  if(Math.abs(invf) < 1e-9) return lens.focal || 200; return 1/invf;
}

function drawLensFocal(lens){
  const f = computeLensFocalLength(lens);
  if(!isFinite(f)) return;
  const ang = deg2rad(lens.angle);
  const ux = Math.cos(ang), uy = Math.sin(ang);
  const p1 = {x: lens.x + ux*f, y: lens.y + uy*f};
  const p2 = {x: lens.x - ux*f, y: lens.y - uy*f};
  ctx.save(); ctx.strokeStyle='#0b84ff'; ctx.fillStyle='#0b84ff'; ctx.lineWidth = 1/view.scale; ctx.setLineDash([6/view.scale,4/view.scale]);
  ctx.beginPath(); ctx.moveTo(lens.x, lens.y); ctx.lineTo(p1.x, p1.y); ctx.stroke(); ctx.setLineDash([]);
  const r = 6/view.scale;
  ctx.beginPath(); ctx.arc(p1.x,p1.y,r,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(p2.x,p2.y,r,0,Math.PI*2); ctx.fill();
  ctx.font = (12/view.scale) + 'px sans-serif'; ctx.fillText('f', p1.x + 8/view.scale, p1.y - 6/view.scale); ctx.fillText('f', p2.x + 8/view.scale, p2.y - 6/view.scale);
  ctx.restore();
}

function drawItem(it){
  ctx.save(); ctx.translate(it.x,it.y); ctx.rotate(deg2rad(it.angle));
  const scaleFactor = 1 / Math.max(0.0001, view.scale);
  if(it.type==='light'){
    // draw source using its color
    ctx.fillStyle = it.color || '#ffd700'; ctx.beginPath(); ctx.arc(0,0,10,0,Math.PI*2); ctx.fill(); ctx.fillStyle='#000'; ctx.font=(12*scaleFactor)+'px sans-serif'; ctx.fillText('L', -5*scaleFactor,4*scaleFactor);
    // direction arrow
    const a = deg2rad(it.direction||it.angle||0);
    ctx.strokeStyle = it.color || '#c47'; ctx.lineWidth=2*scaleFactor; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(40*Math.cos(a), 40*Math.sin(a)); ctx.stroke();
  }
  if(it.type==='lens'){
    ctx.strokeStyle='#0b84ff'; ctx.lineWidth=3*scaleFactor;
    const r = it.diam/2;
    if(it.model === 'thick'){
      // draw approximate spherical surfaces
      const ang = 0; // already rotated into lens frame
      const ux = Math.cos(ang), uy = Math.sin(ang);
      const half = (it.thickness || 20) / 2;
      const v1 = {x: -ux*half, y: -uy*half}; const v2 = {x: ux*half, y: uy*half};
      const R1 = (typeof it.r1 !== 'undefined') ? it.r1 : 160; const R2 = (typeof it.r2 !== 'undefined') ? it.r2 : 160;
      const c1 = {x: v1.x + ux*R1, y: v1.y + uy*R1};
      const c2 = {x: v2.x - ux*R2, y: v2.y - uy*R2};
      // draw arc overlays when diagnostics enabled and lens selected
      if(diagnostics && selected && selected.id === it.id){ // compute arcs robustly and draw the smaller arc near the vertex
        function normalizeAngle(a){ while(a <= -Math.PI) a += Math.PI*2; while(a > Math.PI) a -= Math.PI*2; return a; }
        function arcSpan(start,end,ccw){ // positive span following ccw=true means start->end ccw
          const s = normalizeAngle(start), e = normalizeAngle(end);
          let span = 0;
          if(!ccw){ // ccw arc from s to e
            if(e >= s) span = e - s; else span = (Math.PI*2 - (s - e));
          } else { // reversed
            if(s >= e) span = s - e; else span = (Math.PI*2 - (e - s));
          }
          return span;
        }
        function chooseArcForSurface(center, R, apertureR, vertex){
          try{
            const arc = computeSurfaceArc(center, R, apertureR, {x:0,y:0}, vertex);
            if(!arc) return null;
            const phiV = Math.atan2(vertex.y - center.y, vertex.x - center.x);
            // build both arc candidates (as-is and flipped)
            const candA = {start: arc.start, end: arc.end, ccw: arc.ccw};
            const candB = {start: arc.end, end: arc.start, ccw: !arc.ccw};
            const spanA = arcSpan(candA.start, candA.end, candA.ccw);
            const spanB = arcSpan(candB.start, candB.end, candB.ccw);
            const aHas = angleInArc(phiV, candA.start, candA.end, candA.ccw, 0.02);
            const bHas = angleInArc(phiV, candB.start, candB.end, candB.ccw, 0.02);
            let chosen = null;
            if(aHas && bHas){ // both contain vertex: prefer smaller span
              chosen = (spanA <= spanB) ? candA : candB;
            } else if(aHas) chosen = candA;
            else if(bHas) chosen = candB;
            else {
              // neither contains the vertex — pick the candidate with smaller angular distance to the vertex
              const dA = angularDistanceToArc(phiV, candA.start, candA.end, candA.ccw);
              const dB = angularDistanceToArc(phiV, candB.start, candB.end, candB.ccw);
              chosen = (dA <= dB) ? candA : candB;
            }
            // prefer the smaller arc span
            if(arcSpan(chosen.start, chosen.end, chosen.ccw) > Math.PI) chosen = {start: chosen.end, end: chosen.start, ccw: !chosen.ccw};
            // final attempt: if vertex still not inside, try flipping once more and warn
            if(!angleInArc(phiV, chosen.start, chosen.end, chosen.ccw, 0.02)){
              const flipped = {start: chosen.end, end: chosen.start, ccw: !chosen.ccw};
              if(angleInArc(phiV, flipped.start, flipped.end, flipped.ccw, 0.02)) chosen = flipped;
              else console.warn('chooseArcForSurface: chosen arc does not include vertex', {center, R, apertureR, vertex, chosen});
            }
            return chosen;
          }catch(e){ console.error('chooseArcForSurface failed', e, {center,R,apertureR,vertex}); return null; }
        }
        ctx.save(); ctx.strokeStyle='rgba(10,140,255,0.65)'; ctx.lineWidth = Math.max(1, 2/view.scale);
        const a1 = chooseArcForSurface(c1, R1, it.diam/2, v1);
        if(a1){
          // draw the chosen arc
          ctx.beginPath(); ctx.arc(c1.x,c1.y,Math.abs(R1), a1.start, a1.end, a1.ccw); ctx.stroke();
          try{
            // draw arc endpoints and vertex marker for debugging
            const e1s = {x: c1.x + Math.cos(a1.start)*Math.abs(R1), y: c1.y + Math.sin(a1.start)*Math.abs(R1)};
            const e1e = {x: c1.x + Math.cos(a1.end)*Math.abs(R1), y: c1.y + Math.sin(a1.end)*Math.abs(R1)};
            ctx.save(); ctx.fillStyle='rgba(255,0,0,0.95)'; ctx.beginPath(); ctx.arc(e1s.x,e1s.y,4/view.scale,0,Math.PI*2); ctx.fill(); ctx.fillStyle='rgba(0,200,0,0.95)'; ctx.beginPath(); ctx.arc(e1e.x,e1e.y,4/view.scale,0,Math.PI*2); ctx.fill();
            // vertex marker
            ctx.fillStyle='rgba(255,215,0,0.95)'; ctx.beginPath(); ctx.arc(v1.x,v1.y,4/view.scale,0,Math.PI*2); ctx.fill();
            // angle labels
            const deg = a=>Math.round((a*180/Math.PI)*100)/100;
            ctx.fillStyle='rgba(0,0,0,0.8)'; ctx.font=(10/view.scale)+'px sans-serif'; ctx.fillText(`${deg(a1.start)}°`, e1s.x + 6/view.scale, e1s.y - 6/view.scale); ctx.fillText(`${deg(a1.end)}°`, e1e.x + 6/view.scale, e1e.y - 6/view.scale);
            // console log for deeper inspection
            console.log('Lens arc1', {center:c1, R:R1, arc:a1, vertex:v1, e1s, e1e});
            ctx.restore();
          }catch(e){ console.warn('arc1 debug draw failed', e); }
        }
        const a2 = chooseArcForSurface(c2, R2, it.diam/2, v2);
        if(a2){
          ctx.beginPath(); ctx.arc(c2.x,c2.y,Math.abs(R2), a2.start, a2.end, a2.ccw); ctx.stroke();
          try{
            const e2s = {x: c2.x + Math.cos(a2.start)*Math.abs(R2), y: c2.y + Math.sin(a2.start)*Math.abs(R2)};
            const e2e = {x: c2.x + Math.cos(a2.end)*Math.abs(R2), y: c2.y + Math.sin(a2.end)*Math.abs(R2)};
            ctx.save(); ctx.fillStyle='rgba(255,0,0,0.95)'; ctx.beginPath(); ctx.arc(e2s.x,e2s.y,4/view.scale,0,Math.PI*2); ctx.fill(); ctx.fillStyle='rgba(0,200,0,0.95)'; ctx.beginPath(); ctx.arc(e2e.x,e2e.y,4/view.scale,0,Math.PI*2); ctx.fill();
            ctx.fillStyle='rgba(255,215,0,0.95)'; ctx.beginPath(); ctx.arc(v2.x,v2.y,4/view.scale,0,Math.PI*2); ctx.fill();
            const deg = a=>Math.round((a*180/Math.PI)*100)/100;
            ctx.fillStyle='rgba(0,0,0,0.8)'; ctx.font=(10/view.scale)+'px sans-serif'; ctx.fillText(`${deg(a2.start)}°`, e2s.x + 6/view.scale, e2s.y - 6/view.scale); ctx.fillText(`${deg(a2.end)}°`, e2e.x + 6/view.scale, e2e.y - 6/view.scale);
            console.log('Lens arc2', {center:c2, R:R2, arc:a2, vertex:v2, e2s, e2e});
            ctx.restore();
          }catch(e){ console.warn('arc2 debug draw failed', e); }
        }
        ctx.restore(); }
      // draw arcs using computed surface arcs when possible (preferred over naïve top/bottom)
      const dispArc1 = computeSurfaceArc(c1, R1, it.diam/2, {x:0,y:0}, v1);
      if(dispArc1){ ctx.beginPath(); ctx.arc(c1.x, c1.y, Math.abs(R1), dispArc1.start, dispArc1.end, dispArc1.ccw); ctx.stroke(); }
      else { const top1 = Math.atan2(-r - c1.y, 0 - c1.x); const bot1 = Math.atan2(r - c1.y, 0 - c1.x); ctx.beginPath(); ctx.arc(c1.x, c1.y, Math.abs(R1), top1, bot1, R1 < 0); ctx.stroke(); }
      const dispArc2 = computeSurfaceArc(c2, R2, it.diam/2, {x:0,y:0}, v2);
      if(dispArc2){ ctx.beginPath(); ctx.arc(c2.x, c2.y, Math.abs(R2), dispArc2.start, dispArc2.end, dispArc2.ccw); ctx.stroke(); }
      else { const top2 = Math.atan2(-r - c2.y, 0 - c2.x); const bot2 = Math.atan2(r - c2.y, 0 - c2.x); ctx.beginPath(); ctx.arc(c2.x, c2.y, Math.abs(R2), top2, bot2, R2 < 0); ctx.stroke(); }
      // subtle fill and central marker
      ctx.fillStyle='#0b84ff22'; ctx.beginPath(); ctx.ellipse(0,0,20,r,0,0,Math.PI*2); ctx.fill();
      if(diagnostics && selected && selected.id === it.id){ // show centers and radii when selected for debugging
        ctx.save(); ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.arc(c1.x,c1.y,3,0,Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(c2.x,c2.y,3,0,Math.PI*2); ctx.fill(); ctx.font=(10/view.scale)+'px sans-serif'; ctx.fillText(`R1=${R1}`, c1.x+6, c1.y+6); ctx.fillText(`R2=${R2}`, c2.x+6, c2.y+6); ctx.restore(); }
    } else {
      ctx.beginPath(); ctx.moveTo(-20,-r); ctx.quadraticCurveTo(0,-r,20,-r); ctx.moveTo(-20,r); ctx.quadraticCurveTo(0,r,20,r); ctx.stroke();
      ctx.fillStyle='#0b84ff22'; ctx.beginPath(); ctx.ellipse(0,0,20,r,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#0b84ff'; ctx.fillRect(90*scaleFactor, -2*scaleFactor, 6*scaleFactor,4*scaleFactor); ctx.fillRect(-96*scaleFactor,-2*scaleFactor,6*scaleFactor,4*scaleFactor);
    }
  }
  if(it.type==='mirror'){
    ctx.strokeStyle='#6b7280'; ctx.lineWidth=4*scaleFactor; ctx.beginPath(); ctx.moveTo(-it.length/2,0); ctx.lineTo(it.length/2,0); ctx.stroke();
  }
  if(it.type==='splitter'){
    ctx.strokeStyle='#9a4dff'; ctx.lineWidth=3*scaleFactor; ctx.beginPath(); ctx.moveTo(-it.length/2,0); ctx.lineTo(it.length/2,0); ctx.stroke();
    ctx.fillStyle='#9a4dff22'; ctx.fillRect(-8*scaleFactor,-8*scaleFactor,16*scaleFactor,16*scaleFactor);
  }
  if(it.type==='aperture'){
    ctx.strokeStyle='#0b84ff'; ctx.lineWidth=4*scaleFactor;
    const halfTotal = it.size/2; const halfOpen = it.aperture/2; const off = it.apertureOffset || 0;
    // compute left/right endpoints in local coords and clamp to total
    let left = -halfOpen + off; let right = halfOpen + off; left = Math.max(left, -halfTotal); right = Math.min(right, halfTotal);
    // axis line: draw two segments leaving a gap for the opening
    ctx.beginPath(); ctx.moveTo(-halfTotal,0); ctx.lineTo(left,0); ctx.stroke(); ctx.beginPath(); ctx.moveTo(right,0); ctx.lineTo(halfTotal,0); ctx.stroke();
    // small markers at opening edges
    ctx.save(); ctx.fillStyle='rgba(10,140,255,0.9)'; ctx.beginPath(); ctx.arc(left,0,3/view.scale,0,Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(right,0,3/view.scale,0,Math.PI*2); ctx.fill(); ctx.restore();
    // subtle fill to indicate blocked area on either side
    ctx.save(); ctx.fillStyle='#0b84ff22'; ctx.fillRect(-halfTotal, -6, left + halfTotal, 12); ctx.fillRect(right, -6, halfTotal - right, 12); ctx.restore();
    if(diagnostics && selected && selected.id === it.id){ ctx.save(); ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.font=(10/view.scale)+'px sans-serif'; ctx.fillText(`opening=${it.aperture}`, 10, -10); ctx.fillText(`total=${it.size}`, 10, 6); ctx.fillText(`offset=${it.apertureOffset || 0}`, 10, 18); ctx.restore(); }
  }
  ctx.restore();
}

function renderLightsLegend(){ const container = document.getElementById('lights-legend'); if(!container) return; container.innerHTML = ''; const title = document.createElement('div'); title.style.fontWeight='600'; title.style.marginBottom='6px'; title.textContent = 'Lights'; container.appendChild(title);
  const lights = scene.items.filter(i=>i.type==='light'); if(lights.length===0){ const p = document.createElement('div'); p.style.color='#666'; p.textContent = 'No lights in scene'; container.appendChild(p); return; }
  for(const src of lights){ const row = document.createElement('div'); row.style.display='flex'; row.style.alignItems='center'; row.style.gap='8px'; row.style.marginBottom='6px'; const cb = document.createElement('input'); cb.type='checkbox'; cb.checked = (src.showRays !== false); cb.onchange = ()=>{ src.showRays = cb.checked; if(selected && selected.id === src.id && propShowRays) propShowRays.checked = cb.checked; saveState(); render(); };
    const sw = document.createElement('div'); sw.style.width='16px'; sw.style.height='14px'; sw.style.backgroundColor = src.color || '#ffd700'; sw.style.borderRadius='3px'; sw.style.border='1px solid #ddd'; sw.title = src.color || '';
    const lbl = document.createElement('span'); lbl.textContent = 'Light #' + src.id; lbl.style.cursor='pointer'; lbl.style.userSelect='none'; lbl.onclick = ()=>{ selected = src; showProperties(src); render(); };
    row.appendChild(cb); row.appendChild(sw); row.appendChild(lbl);
    sw.onclick = ()=>{ selected = src; showProperties(src); render(); };
    container.appendChild(row); }
  const actions = document.createElement('div'); actions.style.display='flex'; actions.style.gap='6px'; const showAll = document.createElement('button'); showAll.textContent='Show all'; showAll.onclick=()=>{ for(const s of lights) s.showRays=true; saveState(); render(); }; const hideAll = document.createElement('button'); hideAll.textContent='Hide all'; hideAll.onclick=()=>{ for(const s of lights) s.showRays=false; saveState(); render(); }; actions.appendChild(showAll); actions.appendChild(hideAll); container.appendChild(actions); }

// Ray tracing logic
function traceAndDrawRays(){
  // diagnostic clear
  if(diagnostics) clearDiagnostics();
  // for each light source, generate rays
  const rayLines = [];
  for(const src of scene.items.filter(i=>i.type==='light' && (i.showRays !== false))){
    const N = Math.max(1, Math.min(500, src.beams || settings.raySamples));
    const angleCenter = deg2rad(src.direction || 0);
    const spread = deg2rad(src.spread || 0);
    const angles = [];
    if(src.even){
      if(N===1) angles.push(angleCenter);
      else for(let i=0;i<N;i++) angles.push(angleCenter - spread/2 + (spread*(i/(N-1))));
    } else {
      for(let i=0;i<N;i++) angles.push(angleCenter - spread/2 + Math.random()*spread);
    }
    for(const a of angles){
      const start = {x:src.x, y:src.y};
      const dir = {x:Math.cos(a), y:Math.sin(a)};
      traceRay(start, dir, settings.maxDepth, rayLines, 1, diagnostics ? diagHits : null, src.color || '#ffd700');
    }
  }

  // draw ray lines
  ctx.save(); ctx.lineWidth=1.2;
  for(const seg of rayLines){ ctx.strokeStyle = seg.color || 'rgba(255,0,0,0.9)'; ctx.beginPath(); ctx.moveTo(seg.x1,seg.y1); ctx.lineTo(seg.x2,seg.y2); ctx.stroke(); }
  ctx.restore();

  // diagnostics: intersection points + normals
  if(diagnostics && diagHits.length){ try{ ctx.save(); ctx.strokeStyle='rgba(0,200,200,0.9)'; ctx.fillStyle='rgba(0,200,200,0.95)'; ctx.lineWidth=2/view.scale; const fontPx = Math.max(12, Math.round(16/view.scale)); ctx.font = (fontPx) + 'px sans-serif'; for(const h of diagHits){ try{ ctx.beginPath(); ctx.arc(h.x,h.y,4/view.scale,0,Math.PI*2); ctx.fill();
      if(h.center){ try{ ctx.save(); ctx.strokeStyle='rgba(0,100,255,0.95)'; ctx.beginPath(); ctx.moveTo(h.center.x,h.center.y); ctx.lineTo(h.x,h.y); ctx.stroke(); ctx.fillStyle='rgba(0,100,255,0.95)'; ctx.beginPath(); ctx.arc(h.center.x,h.center.y,3/view.scale,0,Math.PI*2); ctx.fill(); ctx.restore(); }catch(e){ console.warn('diag center draw failed', e, h); } } if(h.normal){ ctx.beginPath(); ctx.moveTo(h.x,h.y); ctx.lineTo(h.x + h.normal.x*20/view.scale, h.y + h.normal.y*20/view.scale); ctx.stroke(); }
      if(h.action){ let col = 'rgba(0,120,200,0.95)'; if(h.action.startsWith('R')) col = 'rgba(200,30,30,0.95)'; else if(h.action.startsWith('F')) col = 'rgba(160,0,160,0.95)'; ctx.fillStyle = col; ctx.fillText(h.action, h.x + 6/view.scale, h.y - 6/view.scale); ctx.fillStyle='rgba(0,200,200,0.95)'; }
      // show detailed values for T-thin
      if(h.action === 'T-thin' && h.detail){ const deltaLabel = (h.detail.deltaDeg !== undefined) ? `${h.detail.deltaDeg}°` : (h.detail.delta !== undefined ? h.detail.delta : 'undefined'); const txt = `ly=${h.detail.ly} m_in=${h.detail.m_in} m_out=${h.detail.m_out} tin=${h.detail.theta_in_deg} Δ=${deltaLabel} tout=${h.detail.theta_out_deg}`; ctx.fillStyle='rgba(0,120,200,0.9)'; ctx.fillText(txt, h.x + 8/view.scale, h.y + 12/view.scale); ctx.fillStyle='rgba(0,200,200,0.95)'; }
      // show additional detail for thick lens fails
      if(h.action && h.action.startsWith('F-') && h.detail){ const jd = safeStringify(h.detail); ctx.fillStyle='rgba(160,0,160,0.9)'; ctx.fillText(jd, h.x + 8/view.scale, h.y + 18/view.scale); ctx.fillStyle='rgba(0,200,200,0.95)'; }
    }catch(e){ console.warn('diag draw error', e, h); }
    } ctx.restore(); }catch(e){ console.error('diag overlay failed', e); } }
}


actionCount=0;
function traceRay(start, dir, depth, out, intensity, diagCollector, baseColor){ baseColor = baseColor || '#ff6400';
  diagCollector = diagCollector || null;
  if(depth<=0 || intensity < 0.02) return;
  // find nearest intersection with items
  let nearest = null; let tMin = Infinity; let hitInfo = null;
  for(const it of scene.items){
    // don't hit same light source as obstacle
    const hit = intersectSegmentWithRay(it, start, dir);
    if(hit && hit.t>1e-6 && hit.t < tMin){ tMin = hit.t; nearest = it; hitInfo = hit; }
  }
  if(!nearest){ // no intersection — draw to border
    const far = {x: start.x + dir.x*3000, y: start.y + dir.y*3000};
    out.push({x1:start.x,y1:start.y,x2:far.x,y2:far.y, color: colorToRgba(baseColor, Math.min(1,intensity))});
    return;
  }
  const hitPoint = {x: start.x + dir.x*hitInfo.t, y: start.y + dir.y*hitInfo.t};
  out.push({x1:start.x,y1:start.y,x2:hitPoint.x,y2:hitPoint.y, color: colorToRgba(baseColor, Math.min(1,intensity))});

  // handle interaction
  if(nearest.type==='mirror'){
    const newDir = reflectDir(dir, nearest.angle);
    // diagnostics label: reflection with mirror normal
    if(diagnostics){ const segAngle = deg2rad(nearest.angle); let normal = {x:Math.cos(segAngle+Math.PI/2), y:Math.sin(segAngle+Math.PI/2)}; if((newDir.x*normal.x + newDir.y*normal.y) < 0){ normal.x *= -1; normal.y *= -1; } (diagCollector || diagHits).push({x:hitPoint.x,y:hitPoint.y,normal, type:'mirror', action:'R'}); }
    // continue slightly offset
    const eps = 0.01;
    const p2 = {x: hitPoint.x + newDir.x*eps, y: hitPoint.y + newDir.y*eps};
    traceRay(p2, newDir, depth-1, out, intensity, diagCollector, baseColor);
  }
  else if(nearest.type==='aperture'){
    // aperture blocks rays outside its opening — stop here
    if(diagnostics){ (diagCollector || diagHits).push({x:hitPoint.x,y:hitPoint.y,type:'aperture',action:'A-block',detail:{aperture:nearest.aperture,size:nearest.size}}); }
    return; // blocked
  }
  else if(nearest.type==='lens'){
    const lens = nearest;
    // plane normal (defines front side)
    const angPlane = deg2rad(lens.angle);
    // lens is symmetric — do not treat back-side incidence as mirror
    const planeNormal = {x: Math.cos(angPlane), y: Math.sin(angPlane)};

    if(lens.model === 'thick' && !settings.disableThickLens){
      // approximate spherical thick lens refraction (2 surface intersections)
      const res = refractThroughThickLens(lens, start, dir, diagCollector);
      if(res && res.length){
        // mark hit and exit normals/actions
        if(diagnostics){ const c=(diagCollector && diagCollector.push)?diagCollector:diagHits; c.push({x:hitPoint.x,y:hitPoint.y,normal:res[0].nEntry || null,type:'lens',action:'T-entry'}); c.push({x:res[0].x,y:res[0].y,normal:res[0].nExit || null,type:'lens',action:'T-exit'}); }
        for(const r of res){ const eps = 0.01; const p2 = {x: r.x + r.dir.x*eps, y: r.y + r.dir.y*eps}; traceRay(p2, r.dir, depth-1, out, intensity, diagCollector, baseColor); }
      } else {
        // fallback to thin model
        if(diagnostics){ (diagCollector || diagHits).push({x:hitPoint.x,y:hitPoint.y,type:'lens',action:'F-thick-fallback',detail:{r1:lens.r1||null,r2:lens.r2||null,n:lens.n||null}}); }
        const f = lens.focal || 200;
        const ang = deg2rad(lens.angle);
        const sin = Math.sin(-ang), cos = Math.cos(-ang);
        const dx = hitPoint.x - lens.x, dy = hitPoint.y - lens.y;
        const lx = dx*cos - dy*sin; const ly = dx*sin + dy*cos;
        // rotate incident direction into lens frame to compute slope reliably
        const incomingAngle = Math.atan2(dir.y, dir.x) - ang;
        const cosA = Math.cos(ang), sinA = Math.sin(ang);
        const dirLensX = dir.x * cosA + dir.y * sinA; // component along optical axis
        const dirLensY = -dir.x * sinA + dir.y * cosA; // component perpendicular (height rate)
        // slope dy/dx in lens frame (m = dirY / dirX)
        const m_in = dirLensY / (dirLensX || (dirLensX === 0 ? 1e-9 : dirLensX));
        const delta = (Math.sign(dirLensX) || 1) * (ly / f); // signed radians (flip for rays coming from back)
        const m_out = m_in - delta;
        // preserve propagation direction (sign of x component)
        const xSign = Math.sign(dirLensX) || 1;
        const len = Math.sqrt(1 + m_out*m_out);
        const newDirLens = { x: xSign / len, y: (xSign * m_out) / len };
        // rotate back to world frame
        const newDir = { x: newDirLens.x * cosA - newDirLens.y * sinA, y: newDirLens.x * sinA + newDirLens.y * cosA };
        const eps = 0.01;
        const p2 = {x: hitPoint.x + newDir.x*eps, y: hitPoint.y + newDir.y*eps};
        if(diagnostics){ (diagCollector || diagHits).push({x:hitPoint.x,y:hitPoint.y,type:'lens',action:'F-thick-disabled',detail:{note:'thick model disabled - using thin fallback'}}); (diagCollector || diagHits).push({x:hitPoint.x,y:hitPoint.y,normal:{x:Math.cos(ang),y:Math.sin(ang)},type:'lens', action:'T-thin', detail:{ly:Number(ly.toFixed(2)), m_in:Number(m_in.toFixed(3)), m_out:Number(m_out.toFixed(3)), theta_in_deg:Number((incomingAngle*180/Math.PI).toFixed(2)), deltaDeg:Number((delta*180/Math.PI).toFixed(3)), theta_out_deg:Number((Math.atan(m_out)*180/Math.PI).toFixed(2)), outDeg:Math.round(Math.atan2(newDir.y,newDir.x)*180/Math.PI)}}); }
        traceRay(p2, newDir, depth-1, out, intensity, diagCollector, baseColor);
      }
    } else {
      // thin lens (paraxial thin-lens approximation)
      const f = lens.focal || 200;
      const ang = deg2rad(lens.angle);
      const cosA = Math.cos(ang), sinA = Math.sin(ang);
      const dx = hitPoint.x - lens.x, dy = hitPoint.y - lens.y;
      // rotate into lens frame (x along optical axis, y height)
      const lx = dx * cosA + dy * sinA;
      const ly = -dx * sinA + dy * cosA; // signed height above axis
      // rotate incident direction into lens frame to compute slope reliably
      const incomingAngle = Math.atan2(dir.y, dir.x) - ang;
      const dirLensX = dir.x * cosA + dir.y * sinA;
      const dirLensY = -dir.x * sinA + dir.y * cosA;
      const m_in = dirLensY / (dirLensX || (dirLensX === 0 ? 1e-9 : dirLensX));
      const delta = (Math.sign(dirLensX) || 1) * (ly / f); // signed radians (flip for rays coming from back)
      const m_out = m_in - delta;
      const xSign = Math.sign(dirLensX) || 1;
      const len = Math.sqrt(1 + m_out*m_out);
      const newDirLens = { x: xSign / len, y: (xSign * m_out) / len };
      const newDir = { x: newDirLens.x * cosA - newDirLens.y * sinA, y: newDirLens.x * sinA + newDirLens.y * cosA };
      // diagnostics details
      if(diagnostics){ (diagCollector || diagHits).push({x:hitPoint.x,y:hitPoint.y,normal:{x:Math.cos(ang),y:Math.sin(ang)},type:'lens', action:'T-thin', detail:{ly:Number(ly.toFixed(2)), m_in:Number(m_in.toFixed(3)), m_out:Number(m_out.toFixed(3)), theta_in_deg:Number((incomingAngle*180/Math.PI).toFixed(2)), deltaDeg:Number((delta*180/Math.PI).toFixed(3)), theta_out_deg:Number((Math.atan(m_out)*180/Math.PI).toFixed(2)), outDeg:Math.round(Math.atan2(newDir.y,newDir.x)*180/Math.PI)}}); }
      const eps = 0.01;
      const p2 = {x: hitPoint.x + newDir.x*eps, y: hitPoint.y + newDir.y*eps};
      traceRay(p2, newDir, depth-1, out, intensity, diagCollector, baseColor);
    }
  }
  else if(nearest.type==='splitter'){
    const spl = nearest; const refl = spl.reflect || 0.5;
    // reflected
    const rDir = reflectDir(dir, spl.angle);
    if(diagnostics){ const segAngle = deg2rad(spl.angle); let normal = {x:Math.cos(segAngle+Math.PI/2), y:Math.sin(segAngle+Math.PI/2)}; if((rDir.x*normal.x + rDir.y*normal.y) < 0){ normal.x *= -1; normal.y *= -1; } (diagCollector || diagHits).push({x:hitPoint.x,y:hitPoint.y,normal,type:'splitter',action:'R'}); }    const eps = 0.01;
    const pRef = {x: hitPoint.x + rDir.x*eps, y: hitPoint.y + rDir.y*eps};
    traceRay(pRef, rDir, depth-1, out, intensity*refl, diagCollector, baseColor);
    // transmitted (assume straight through with slight reduction)
    const tDir = dir; if(diagnostics) (diagCollector || diagHits).push({x:hitPoint.x,y:hitPoint.y,normal:{x:tDir.x,y:tDir.y},type:'splitter',action:'T'});
    const pTr = {x: hitPoint.x + tDir.x*eps, y: hitPoint.y + tDir.y*eps};
    traceRay(pTr, tDir, depth-1, out, intensity*(1-refl), diagCollector, baseColor);
  }
}

function reflectDir(dir, segAngleDeg){
  // compute normal vector (perp to segment)
  const segAngle = deg2rad(segAngleDeg);
  const nx = Math.cos(segAngle+Math.PI/2), ny = Math.sin(segAngle+Math.PI/2);
  // normalize
  const nlen = Math.hypot(nx,ny); if(nlen===0) return dir;
  const nxn = nx/nlen, nyn = ny/nlen;
  const dot = dir.x*nxn + dir.y*nyn;
  const rx = dir.x - 2*dot*nxn; const ry = dir.y - 2*dot*nyn;
  const rlen = Math.hypot(rx,ry); return {x:rx/rlen, y:ry/rlen};
}

// Snell refraction helper: n1*sin(theta1)=n2*sin(theta2)
function refract(dir, normal, n1, n2){
  // dir and normal are normalized
  const cosi = -(dir.x*normal.x + dir.y*normal.y);
  const eta = n1 / n2;
  const k = 1 - eta*eta*(1 - cosi*cosi);
  if(k < 0) return null; // total internal reflection
  const rx = eta*dir.x + (eta*cosi - Math.sqrt(k))*normal.x;
  const ry = eta*dir.y + (eta*cosi - Math.sqrt(k))*normal.y;
  const rlen = Math.hypot(rx, ry); return {x: rx/rlen, y: ry/rlen};
}

// helper: compute arc angles (in radians) of circle (center c, radius R) that intersect aperture circle (apertureCenter, radius apertureR). If vertex provided, prefer arc containing vertex.
function computeSurfaceArc(c, R, apertureR, apertureCenter, vertex){
  const absR = Math.abs(R);
  const dx = apertureCenter.x - c.x, dy = apertureCenter.y - c.y; const d = Math.hypot(dx,dy);
  // no overlap
  if(d > absR + apertureR) return null;

  // helper to compute span length
  const computeSpan = (arc)=>{ const norm=x=>{while(x<=-Math.PI)x+=2*Math.PI;while(x>Math.PI)x-=2*Math.PI;return x;}; const s=norm(arc.start), e=norm(arc.end); if(!arc.ccw){ if(e>=s) return e-s; return 2*Math.PI - (s-e); } else { if(s>=e) return s-e; return 2*Math.PI - (e-s); } };

  // build candidates helper (returns candidate that contains vertex if possible)
  const chooseCandidate = (arc, vertex)=>{
    const candA = {start: arc.start, end: arc.end, ccw: arc.ccw};
    const candB = {start: arc.end, end: arc.start, ccw: !arc.ccw};
    const phiV = vertex ? Math.atan2(vertex.y - c.y, vertex.x - c.x) : null;
    const aHas = vertex ? angleInArc(phiV, candA.start, candA.end, candA.ccw, 0.02) : false;
    const bHas = vertex ? angleInArc(phiV, candB.start, candB.end, candB.ccw, 0.02) : false;
    if(aHas && bHas) return (computeSpan(candA) <= computeSpan(candB)) ? candA : candB;
    if(aHas) return candA;
    if(bHas) return candB;
    // neither contains vertex: pick the one with smaller span
    return (computeSpan(candA) <= computeSpan(candB)) ? candA : candB;
  };

  // one circle contains the other or tangent
  if(d < Math.abs(absR - apertureR)){
    // surface circle entirely contains the aperture circle (or vice versa)
    const top = Math.atan2(apertureCenter.y - apertureR - c.y, apertureCenter.x - c.x);
    const bottom = Math.atan2(apertureCenter.y + apertureR - c.y, apertureCenter.x - c.x);
    const raw = {start: top, end: bottom, ccw: (R < 0)};
    const chosen = chooseCandidate(raw, vertex);
    // ensure smaller span
    if(computeSpan(chosen) > Math.PI) return {start: chosen.end, end: chosen.start, ccw: !chosen.ccw};
    return chosen;
  }

  // chord intersection case: compute intersection points explicitly
  const a = (absR*absR - apertureR*apertureR + d*d) / (2*d);
  let h = absR*absR - a*a; if(h < 0) h = 0; else h = Math.sqrt(h);
  const xm = c.x + (a * (apertureCenter.x - c.x)) / d;
  const ym = c.y + (a * (apertureCenter.y - c.y)) / d;
  const rx = -(apertureCenter.y - c.y) * (h / d);
  const ry = (apertureCenter.x - c.x) * (h / d);
  const p1 = {x: xm + rx, y: ym + ry};
  const p2 = {x: xm - rx, y: ym - ry};
  const ang1 = Math.atan2(p1.y - c.y, p1.x - c.x);
  const ang2 = Math.atan2(p2.y - c.y, p2.x - c.x);

  // build two candidate arcs (CCW from start->end): cand1 from ang1->ang2, cand2 is the complement ang2->ang1
  const cand1 = {start: ang1, end: ang2, ccw: false};
  const cand2 = {start: ang2, end: ang1, ccw: false};
  const span1 = computeSpan(cand1), span2 = computeSpan(cand2);
  const normAng = x=>{ while(x <= -Math.PI) x += 2*Math.PI; while(x > Math.PI) x -= 2*Math.PI; return x; };
  const angleAdvance = (a, delta)=> normAng(a + delta);
  const midAngle = (arc)=>{ const s = arc.start; const span = computeSpan(arc); return angleAdvance(s, span/2); };
  const mid1 = midAngle(cand1), mid2 = midAngle(cand2);
  const pMid1 = {x: c.x + Math.cos(mid1)*absR, y: c.y + Math.sin(mid1)*absR};
  const pMid2 = {x: c.x + Math.cos(mid2)*absR, y: c.y + Math.sin(mid2)*absR};
  const in1 = Math.hypot(pMid1.x - apertureCenter.x, pMid1.y - apertureCenter.y) <= (apertureR + 1e-6);
  const in2 = Math.hypot(pMid2.x - apertureCenter.x, pMid2.y - apertureCenter.y) <= (apertureR + 1e-6);

  // prefer candidate that includes the vertex angle, otherwise prefer the one whose midpoint is inside the aperture, otherwise take smaller span
  const phiV = vertex ? Math.atan2(vertex.y - c.y, vertex.x - c.x) : null;
  const vIn1 = vertex ? angleInArc(phiV, cand1.start, cand1.end, cand1.ccw, 0.02) : false;
  const vIn2 = vertex ? angleInArc(phiV, cand2.start, cand2.end, cand2.ccw, 0.02) : false;
  let chosen = null;
  if(vIn1 && !vIn2) chosen = cand1;
  else if(vIn2 && !vIn1) chosen = cand2;
  else if(in1 && !in2) chosen = cand1;
  else if(in2 && !in1) chosen = cand2;
  else chosen = (span1 <= span2) ? cand1 : cand2;

  // final normalization: prefer smaller span (flip if >PI)
  if(computeSpan(chosen) > Math.PI) chosen = {start: chosen.end, end: chosen.start, ccw: true};
  // warn if vertex not included (rare) and widen the inclusion adaptively
  if(vertex && !angleInArc(phiV, chosen.start, chosen.end, chosen.ccw, 0.02)){
    const angDist = angularDistanceToArc(phiV, chosen.start, chosen.end, chosen.ccw);
    // margin: at least 0.08 rad, up to 0.6 rad, help include the vertex when it's nearby
    const margin = Math.min(0.6, Math.max(0.08, angDist + 0.05));
    console.warn('computeSurfaceArc: final chosen arc does not include vertex, expanding around vertex', {c,R,apertureR,vertex,chosen, angDist, margin});
    chosen = {start: phiV - margin, end: phiV + margin, ccw: false};
  }
  return chosen;
}

function angleInArc(a, start, end, ccw, eps = 0.02){
  // normalize to -PI..PI
  const norm = x=>{ while(x <= -Math.PI) x += Math.PI*2; while(x > Math.PI) x -= Math.PI*2; return x; };
  a = norm(a); start = norm(start); end = norm(end);
  if(!ccw){ // treat as normal ccw arc from start->end
    if(start <= end) return (a+eps) >= start && (a-eps) <= end;
    return (a+eps) >= start || (a-eps) <= end;
  } else {
    // reversed direction (arc goes from end->start)
    if(end <= start) return (a-eps) <= start && (a+eps) >= end;
    return (a-eps) <= start || (a+eps) >= end;
  }
}

function angNormDiff(a,b){ const diff = Math.abs(((a - b + Math.PI) % (2*Math.PI) + 2*Math.PI) % (2*Math.PI) - Math.PI); return diff; }

function angularDistanceToArc(a, start, end, ccw){ if(angleInArc(a,start,end,ccw,0.0)) return 0; const d1 = angNormDiff(a,start); const d2 = angNormDiff(a,end); return Math.min(d1,d2); }

// approximate refraction through thick spherical lens
function refractThroughThickLens(lens, origin, dir, diagCollector){
  const ang = deg2rad(lens.angle);
  const ux = Math.cos(ang), uy = Math.sin(ang);
  const half = (lens.thickness || 20) / 2;
  const v1 = {x: lens.x - ux*half, y: lens.y - uy*half}; // one vertex
  const v2 = {x: lens.x + ux*half, y: lens.y + uy*half}; // other vertex
  const R1 = lens.r1 || 160; const R2 = lens.r2 || 160; const n = lens.n || 1.5;
  // centers
  const c1 = {x: v1.x + ux*R1, y: v1.y + uy*R1};
  const c2 = {x: v2.x - ux*R2, y: v2.y - uy*R2};

  // try intersecting both surfaces and pick the earliest positive intersection
  const t1 = intersectRayCircle(origin, dir, c1, Math.abs(R1));
  const t2 = intersectRayCircle(origin, dir, c2, Math.abs(R2));
  const hits = [];
  if(t1 !== null) hits.push({t:t1, center:c1, R:R1, which:1});
  if(t2 !== null) hits.push({t:t2, center:c2, R:R2, which:2});
  if(hits.length === 0) return null;
  hits.sort((a,b)=>a.t-b.t);
  // compute allowed arc for each surface (in world coords)
  const apertureR = lens.diam/2;
  const arc1 = computeSurfaceArc(c1, R1, apertureR, {x: lens.x, y: lens.y}, v1);
  const arc2 = computeSurfaceArc(c2, R2, apertureR, {x: lens.x, y: lens.y}, v2);

  // first hit (choose the first hit that lies within allowed arc)
  let first = null;
  for(const h of hits){ const pTest = {x: origin.x + dir.x*h.t, y: origin.y + dir.y*h.t}; const angP = Math.atan2(pTest.y - h.center.y, pTest.x - h.center.x); let arc = (h.which===1 ? arc1 : arc2);
    // prefer arc that contains the surface vertex (v1/v2) if possible
    if(arc){ const v = (h.which===1 ? v1 : v2); const phiV = Math.atan2(v.y - h.center.y, v.x - h.center.x); if(!angleInArc(phiV, arc.start, arc.end, arc.ccw, 0.02)){ // try flip
        const flipped = {start: arc.end, end: arc.start, ccw: !arc.ccw}; if(angleInArc(phiV, flipped.start, flipped.end, flipped.ccw, 0.02)) arc = flipped; }
    }
    let accepted = false; let chosen = null; let angDist = null;
    if(arc && angleInArc(angP, arc.start, arc.end, arc.ccw, 0.02)){ accepted = true; chosen = arc; angDist = 0; }
    else if(arc){ // try flipped arc
      const flipped = {start: arc.end, end: arc.start, ccw: !arc.ccw}; if(angleInArc(angP, flipped.start, flipped.end, flipped.ccw, 0.02)){ accepted = true; chosen = flipped; angDist = 0; }
    }
    if(!accepted && arc){ // pick arc (or flipped) that minimizes angular distance to angP, within threshold
      const dA = angularDistanceToArc(angP, arc.start, arc.end, arc.ccw); const flipped = {start: arc.end, end: arc.start, ccw: !arc.ccw}; const dF = angularDistanceToArc(angP, flipped.start, flipped.end, flipped.ccw);
      if(dA <= dF){ angDist = dA; chosen = arc; } else { angDist = dF; chosen = flipped; }
      const acceptThresh = 0.17; // ~9.7 degrees
      if(angDist < acceptThresh) accepted = true;
    }
    if(accepted){ first = h; h.chosenArc = chosen; h.angP = angP; h.angDist = angDist; console.log('thick-lens: accepted surface', {which:h.which, t:h.t, angP:Number(angP.toFixed(6)), angDist, chosen}); break; }
    else { if(diagnostics){ const c=(diagCollector && diagCollector.push)?diagCollector:diagHits; const vphi = (h.which===1?Math.atan2(v1.y - h.center.y, v1.x - h.center.x):Math.atan2(v2.y - h.center.y, v2.x - h.center.x)); c.push({x:pTest.x,y:pTest.y,type:'lens',action:'F-outside-arc',detail:{which:h.which,t:h.t,angP:Number(angP.toFixed(6)),phiV:Number(vphi.toFixed(6))}}); } console.log('thick-lens: rejected surface', {which:h.which, t:h.t, angP:Number(angP.toFixed(6)), arc1, arc2}); }
  }
  if(!first) return null;
  const p1 = {x: origin.x + dir.x*first.t, y: origin.y + dir.y*first.t};
  // aperture check at intersection point (redundant, but keep)
  const px = Math.cos(ang + Math.PI/2), py = Math.sin(ang + Math.PI/2);
  const ly1 = (p1.x - lens.x)*px + (p1.y - lens.y)*py;
  if(Math.abs(ly1) > (lens.diam/2 + 1)) return null;

  // normal at first surface (points outward from center)
  let n1 = {x: (p1.x - first.center.x), y: (p1.y - first.center.y)}; let nl = Math.hypot(n1.x, n1.y); if(nl===0){ if(diagnostics) { const c = (diagCollector && diagCollector.push) ? diagCollector : diagHits; c.push({x:p1.x,y:p1.y,type:'lens',action:'F-no-normal',detail:{center:first.center}}); } return null; } n1.x/=nl; n1.y/=nl;
  // ensure normal points opposite to incoming ray (so cosi = -(dir·normal) is positive)
  if((dir.x*n1.x + dir.y*n1.y) > 0){ n1.x *= -1; n1.y *= -1; }
  // refract into lens (air -> n)
  const dirInside = refract(dir, n1, 1, n);
  if(!dirInside){ // could not refract into lens (TIR or invalid) -> diagnostic and fallback
    if(diagnostics){ const c = (diagCollector && diagCollector.push) ? diagCollector : diagHits; c.push({x:p1.x,y:p1.y,type:'lens',action:'F-entry-TIR',detail:{n1,dir,n}}); }
    return null;
  }

  // find intersection with the other surface
  const other = hits.length > 1 ? hits.find(h=>h!==first) : {center: first.which===1 ? c2 : c1, R: first.which===1 ? R2 : R1, which: first.which===1?2:1};
  const pStart = p1; const dirStart = dirInside;
  // try intersection with other surface; allow small numerical nudges if direct intersection misses
  let tOther = intersectRayCircle(pStart, dirStart, other.center, Math.abs(other.R));
  if(tOther === null){ // try nudging start point slightly along dirStart
    const epsN = 1e-4; const pTry = {x: pStart.x + dirStart.x*epsN, y: pStart.y + dirStart.y*epsN};
    tOther = intersectRayCircle(pTry, dirStart, other.center, Math.abs(other.R));
    if(tOther !== null) tOther += epsN;
  }
  if(tOther === null){ if(diagnostics){ const c=(diagCollector && diagCollector.push)?diagCollector:diagHits; c.push({x:pStart.x,y:pStart.y,type:'lens',action:'F-no-other-intersection',detail:{which:other.which}}); } return null; }
  const p2 = {x: pStart.x + dirStart.x*tOther, y: pStart.y + dirStart.y*tOther};
  // ensure p2 is on the allowed arc of 'other' surface
  const arcOther = (other.which === 1 ? arc1 : arc2);
  const angP2 = Math.atan2(p2.y - other.center.y, p2.x - other.center.x);
  if(!arcOther || !angleInArc(angP2, arcOther.start, arcOther.end, arcOther.ccw)){ if(diagnostics){ const c=(diagCollector && diagCollector.push)?diagCollector:diagHits; c.push({x:p2.x,y:p2.y,type:'lens',action:'F-other-outside-arc',detail:{which:other.which}}); } return null; }
  const ly2 = (p2.x - lens.x)*px + (p2.y - lens.y)*py;
  if(Math.abs(ly2) > (lens.diam/2 + 1)) return null;

  // normal at exit surface (points outward from center)
  let n2 = {x: (p2.x - other.center.x), y: (p2.y - other.center.y)}; let nl2 = Math.hypot(n2.x, n2.y); if(nl2===0){ if(diagnostics){ const c=(diagCollector && diagCollector.push)?diagCollector:diagHits; c.push({x:p2.x,y:p2.y,type:'lens',action:'F-no-exit-normal',detail:{center:other.center}}); } return null; } n2.x/=nl2; n2.y/=nl2;
  // ensure normal points opposite to internal ray
  if((dirStart.x*n2.x + dirStart.y*n2.y) > 0){ n2.x *= -1; n2.y *= -1; }
  // refract out (n -> air)
  const outDir = refract(dirStart, n2, n, 1);
  if(!outDir){ // TIR inside lens: diagnostic and reflect
    if(diagnostics){ const c=(diagCollector && diagCollector.push)?diagCollector:diagHits; c.push({x:p2.x,y:p2.y,type:'lens',action:'F-exit-TIR',detail:{n2,dirStart,n}}); }
    const ref2 = reflectVec(dirStart, n2); return [{x: p2.x, y: p2.y, dir: ref2, nEntry: n1, nExit: n2}];
  }
  // success
  if(diagnostics){ const c = (diagCollector && diagCollector.push) ? diagCollector : diagHits;
    // include surface normal and center so the diag overlay can draw helpful geometry
    c.push({x:p1.x,y:p1.y,type:'lens',action:'T-entry',normal:n1,center:first.center, detail:{r1:R1,r2:R2,n}});
    c.push({x:p2.x,y:p2.y,type:'lens',action:'T-exit',normal:n2,center:other.center, detail:{r1:R1,r2:R2,n}});
    // console log full context for easier reproduction
    console.log('thick-lens: refract success', {p1:Number(p1.x.toFixed(3))+','+Number(p1.y.toFixed(3)), p2:Number(p2.x.toFixed(3))+','+Number(p2.y.toFixed(3)), first, other, arc1, arc2}); }
  return [{x: p2.x, y: p2.y, dir: outDir, nEntry: n1, nExit: n2}];
}

function intersectRayCircle(origin, dir, center, R){
  // solve ||origin + t*dir - center||^2 = R^2
  const ox = origin.x - center.x, oy = origin.y - center.y;
  const a = dir.x*dir.x + dir.y*dir.y;
  const b = 2*(ox*dir.x + oy*dir.y);
  const c = ox*ox + oy*oy - R*R;
  const disc = b*b - 4*a*c; if(disc < 0) return null;
  const sq = Math.sqrt(disc);
  const t0 = (-b - sq)/(2*a), t1 = (-b + sq)/(2*a);
  const ts = [t0, t1].filter(t=>t>1e-6);
  if(ts.length===0) return null; return Math.min(...ts);
}

function reflectVec(v, n){ const dot = v.x*n.x + v.y*n.y; const rx = v.x - 2*dot*n.x; const ry = v.y - 2*dot*n.y; const rlen = Math.hypot(rx,ry); return {x:rx/rlen, y:ry/rlen}; }

function intersectSegmentWithRay(it, origin, dir){
  if(it.type==='mirror' || it.type==='splitter'){
    // segment endpoints in world coords
    const ang = deg2rad(it.angle);
    const hx = Math.cos(ang)*it.length/2, hy = Math.sin(ang)*it.length/2;
    const a = {x: it.x - hx, y: it.y - hy};
    const b = {x: it.x + hx, y: it.y + hy};
    // ray p = origin + t*dir, segment s = a + u*(b-a), u in [0,1]
    const r = dir; const s = {x: b.x - a.x, y: b.y - a.y};
    const denom = r.x*s.y - r.y*s.x;
    if(Math.abs(denom) < 1e-6) return null; // parallel
    const dx = a.x - origin.x, dy = a.y - origin.y;
    const t = (dx*s.y - dy*s.x)/denom;
    const u = (dx*r.y - dy*r.x)/denom;
    if(t>=0 && u>=0 && u<=1) return {t,u,pt:{x:origin.x+t*r.x,y:origin.y+t*r.y}};
    return null;
  }
  if(it.type==='lens'){
    // treat lens as infinitesimally thin plane perpendicular to lens axis (for thin model)
    const ang = deg2rad(it.angle);
    const nx = Math.cos(ang), ny = Math.sin(ang);
    const denom = dir.x*nx + dir.y*ny;
    if(Math.abs(denom) < 1e-6) return null; // nearly parallel
    const t = ((it.x - origin.x)*nx + (it.y - origin.y)*ny) / denom;
    if(t < 0) return null;
    const hit = {x: origin.x + dir.x*t, y: origin.y + dir.y*t};
    const px = Math.cos(ang + Math.PI/2), py = Math.sin(ang + Math.PI/2);
    const dx = hit.x - it.x, dy = hit.y - it.y;
    const ly = dx*px + dy*py;
    if(Math.abs(ly) <= it.diam/2 + 1) return {t,pt:hit};
    return null;
  }
  if(it.type==='aperture'){
    // thin linear aperture element — project intersection onto opening axis
    const ang = deg2rad(it.angle);
    const nx = Math.cos(ang + Math.PI/2), ny = Math.sin(ang + Math.PI/2); // plane normal (perp to axis)
    const denom = dir.x*nx + dir.y*ny;
    if(Math.abs(denom) < 1e-6) return null; // nearly parallel
    const t = ((it.x - origin.x)*nx + (it.y - origin.y)*ny) / denom;
    if(t < 0) return null;
    const hit = {x: origin.x + dir.x*t, y: origin.y + dir.y*t};
    const ax = Math.cos(ang), ay = Math.sin(ang); // axis direction (aligned with angle)
    const dx = hit.x - it.x, dy = hit.y - it.y;
    const along = dx*ax + dy*ay; // coordinate along element axis
    const halfTotal = (it.size || 120)/2; const halfOpen = (it.aperture || 80)/2; const off = it.apertureOffset || 0;
    const left = Math.max(-halfTotal, -halfOpen + off); const right = Math.min(halfTotal, halfOpen + off);
    if(Math.abs(along) > halfTotal + 1) return null; // missed element
    // if inside opening, pass through (no hit)
    if(along >= left + 1e-6 && along <= right - 1e-6) return null;
    // otherwise hit and block
    return {t, pt: hit};
  }
  // lights do not block
  return null;
}

// initial sample content (single light + lens)
scene.items.push(Object.assign(makeItem('light'),{x:150,y:180,direction:0,spread:12,beams:18,even:true,color:'#ff0000'}));
scene.items.push(Object.assign(makeItem('lens'),{x:480,y:220,angle:0,focal:200,diam:120,model:'thin'}));

showProperties(null);
render();

// Resize handling
window.addEventListener('resize', ()=>{ const r = canvas.getBoundingClientRect(); /* keep fixed canvas */ });

// keyboard shortcuts
window.addEventListener('keydown', e=>{
  // delete
  if(e.key==='Delete' && selected){ const i=scene.items.findIndex(it=>it.id===selected.id); if(i>=0) scene.items.splice(i,1); selected=null; showProperties(null); saveState(); render(); }
  // undo/redo
  const isCmd = e.ctrlKey || e.metaKey;
  if(isCmd && e.key.toLowerCase() === 'z' && !e.shiftKey){ e.preventDefault(); undo(); }
  else if(isCmd && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))){ e.preventDefault(); redo(); }
});

// load autosaved scene if exists
try{
  const saved = localStorage.getItem('optics-sandbox-scene');
  if(saved){ const doc = JSON.parse(saved); if(doc && doc.items){ scene.items = doc.items; scene.nextId = scene.items.reduce((m,it)=>Math.max(m,it.id||0),0)+1; if(doc.view) Object.assign(view, doc.view); }
  }
}catch(e){console.warn('no autosave loaded')}

showProperties(null);
// ensure canvas fills viewport and stays crisp on HiDPI
function adjustCanvasSize(){ try{ const vp = document.getElementById('viewport'); const r = vp.getBoundingClientRect(); const padding = 16; const targetW = Math.max(240, r.width - padding*2); const targetH = Math.max(200, r.height - padding*2); const dpr = window.devicePixelRatio || 1; canvas.style.width = targetW + 'px'; canvas.style.height = targetH + 'px'; canvas.width = Math.round(targetW * dpr); canvas.height = Math.round(targetH * dpr); W = Math.round(canvas.width / dpr); H = Math.round(canvas.height / dpr); }catch(e){ console.warn('adjustCanvasSize failed', e); } }
adjustCanvasSize();
setStatus('Scene seeded');
// ensure a final layout pass after load (fixes canvas disappearing until click)
window.addEventListener('load', ()=>{ try{ setTimeout(()=>{ adjustCanvasSize(); render(); }, 20); }catch(e){ console.warn('post-load render failed', e); } });

// seed history
saveState();
updateUndoButtons();
renderHistoryList();

// sync control UI with state
const snapGridEl2 = document.getElementById('snap-grid'); const gridSizeEl2 = document.getElementById('grid-size'); const autosaveEl2 = document.getElementById('autosave'); const zoomSlider2 = document.getElementById('zoom-slider');
if(snapGridEl2) snapGridEl2.checked = snapToGrid;
if(gridSizeEl2) gridSizeEl2.value = gridSize;
if(autosaveEl2) autosaveEl2.checked = autosave;
if(zoomSlider2) zoomSlider2.value = view.scale;
// restore diagnostics checkbox state
const diagToggle2 = document.getElementById('diag-toggle'); if(diagToggle2) diagToggle2.checked = diagnostics;

// show ready
const status = document.getElementById('app-status'); if(status){ status.textContent = 'Ready'; }

// Resize handling — adjust canvas on resize
window.addEventListener('resize', ()=>{ try{ adjustCanvasSize(); }catch(e){} render(); });
