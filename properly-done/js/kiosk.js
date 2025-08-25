import { STORAGE, linkToken } from './config.js';

const kioskEnterBtn = () => document.getElementById('kioskEnter');
const kioskExitBtn  = () => document.getElementById('kioskExit');

export function isKiosk(){ try { return localStorage.getItem(STORAGE.KIOSK) === '1'; } catch { return false; } }

function setViewportLock(lock, scale = 1.0) {
  const vp = document.querySelector('meta[name="viewport"]');
  if (!vp) return;
  vp.setAttribute('content', lock
    ? `width=device-width, initial-scale=${scale}, maximum-scale=${scale}, user-scalable=no`
    : 'width=device-width, initial-scale=1.0');
}

export function applyKiosk(state){
  if(state){
    document.body.classList.add('kiosk-mode');
    setViewportLock(true, 1.30); // 15% more than the 1.15 you asked before
    try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('portrait').catch(()=>{}); } catch {}
    try { const el=document.documentElement; if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(()=>{}); } catch {}
    window.scrollTo(0,0);
  } else {
    document.body.classList.remove('kiosk-mode');
    setViewportLock(false);
    try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(()=>{}); } catch {}
  }
  syncFabVisibility();
}

export function setKiosk(v){
  try { v ? localStorage.setItem(STORAGE.KIOSK,'1') : localStorage.removeItem(STORAGE.KIOSK); } catch {}
  applyKiosk(v);
}

export function wireKiosk() {
  // enter
  kioskEnterBtn()?.addEventListener('click', ()=> setKiosk(true));

  // exit by 5 taps (top-right)
  let taps = 0, timer = null;
  const reset = ()=>{ taps = 0; if (timer) { clearTimeout(timer); timer = null; } };
  const handleTap = ()=>{ taps += 1; if (!timer) { timer = setTimeout(reset, 1500); } if (taps >= 5) { reset(); setKiosk(false); } };

  kioskExitBtn()?.addEventListener('click', handleTap, {passive:true});
  kioskExitBtn()?.addEventListener('touchstart', (e)=>{ e.preventDefault(); handleTap(); }, {passive:false});

  // block navigation keys in kiosk
  window.addEventListener('keydown', (e)=>{
    if (!isKiosk()) return;
    const tag = (e.target && e.target.tagName) || '';
    const editable = tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable;
    if (e.key === 'Backspace' && !editable) e.preventDefault();
    const ctrlOrCmd = e.ctrlKey || e.metaKey;
    if (e.key === 'F5' || (ctrlOrCmd && (e.key.toLowerCase() === 'r' || e.key.toLowerCase() === 'w' || e.key.toLowerCase() === 'n'))) e.preventDefault();
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) e.preventDefault();
    if (e.key === 'Escape') e.preventDefault();
  });
  window.addEventListener('contextmenu', (e)=>{ if (isKiosk()) e.preventDefault(); });
  window.addEventListener('touchmove', (e)=>{ if (isKiosk()) e.preventDefault(); }, {passive:false});
  window.addEventListener('wheel', (e)=>{ if (isKiosk()) e.preventDefault(); }, {passive:false});
  document.addEventListener('focusout', () => { if (isKiosk()) { setTimeout(() => { window.scrollTo(0,0); }, 50); } });

  // leave kiosk if fullscreen gets closed via ESC (prevents freeze)
  function fsChange(){ if (isKiosk() && !document.fullscreenElement) { setKiosk(false); } }
  document.addEventListener('fullscreenchange', fsChange);
  document.addEventListener('webkitfullscreenchange', fsChange);

  // initial FAB visibility
  syncFabVisibility();
}

export function syncFabVisibility(){
  const onSurvey = !document.getElementById('surveyContainer').classList.contains('hidden');
  const kioskActive = isKiosk();
  if (kioskEnterBtn()) kioskEnterBtn().style.display = (!linkToken && onSurvey && !kioskActive) ? '' : 'none';
}