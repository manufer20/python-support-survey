
import { STORAGE, linkToken } from './config.js';

// --- HARD KIOSK & WAKE LOCK SUPPORT ---
// If true, users cannot exit via the 5‑tap corner or other soft exits,
// and we will try to auto‑recover fullscreen/orientation/wake lock.
const HARD_KIOSK = true;

// Screen Wake Lock (modern browsers) + NoSleep fallback (older iOS)
let __wakeLock = null;
let __noSleep = null;
let __wakeHandlersBound = false;

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator && navigator.wakeLock?.request) {
      __wakeLock = await navigator.wakeLock.request('screen');
      __wakeLock.addEventListener?.('release', () => {
        // If kiosk is still active, try to reacquire
        if (isKiosk()) { tryReacquireWakeLockSoon(); }
      });
    } else {
      // Fallback: dynamically load NoSleep.js and enable it on a user gesture
      if (!__noSleep) {
        await loadNoSleepLib();
        __noSleep = new window.NoSleep();
      }
      try { __noSleep.enable(); } catch {}
    }
  } catch (e) {
    // Some platforms require visibility; try again shortly
    tryReacquireWakeLockSoon();
  }
}

function releaseWakeLock() {
  try { if (__wakeLock) { __wakeLock.release?.(); } } catch {}
  __wakeLock = null;
  try { if (__noSleep) { __noSleep.disable?.(); } } catch {}
}

function tryReacquireWakeLockSoon() {
  if (!isKiosk()) return;
  setTimeout(() => { if (isKiosk()) requestWakeLock(); }, 600);
}

function loadNoSleepLib() {
  return new Promise((resolve) => {
    if (window.NoSleep) return resolve();
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/nosleep.js@0.12.0/dist/NoSleep.min.js';
    s.onload = () => resolve();
    s.onerror = () => resolve(); // fail silently; nothing else we can do
    document.head.appendChild(s);
  });
}

async function ensureFullscreen() {
  try {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) {
      await el.requestFullscreen().catch(()=>{});
    }
  } catch {}
}

async function ensureOrientation() {
  try { if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('portrait').catch(()=>{}); } catch {}
}

function bindWakeLockWatchers() {
  if (__wakeHandlersBound) return;
  document.addEventListener('visibilitychange', onVisibilityChange, false);
  window.addEventListener('focus', onWindowFocus, false);
  window.addEventListener('orientationchange', onOrientationChange, false);
  __wakeHandlersBound = true;
}
function unbindWakeLockWatchers() {
  if (!__wakeHandlersBound) return;
  document.removeEventListener('visibilitychange', onVisibilityChange, false);
  window.removeEventListener('focus', onWindowFocus, false);
  window.removeEventListener('orientationchange', onOrientationChange, false);
  __wakeHandlersBound = false;
}
function onVisibilityChange() { if (isKiosk() && document.visibilityState === 'visible') { tryReacquireWakeLockSoon(); ensureFullscreen(); } }
function onWindowFocus()      { if (isKiosk()) { tryReacquireWakeLockSoon(); } }
function onOrientationChange(){ if (isKiosk()) { ensureOrientation(); } }

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
    // Keep the screen awake and auto-recover fullscreen/orientation
    requestWakeLock();
    bindWakeLockWatchers();
    // A small delayed re-ensure helps on iPad after keyboard/URL bar animations
    setTimeout(() => { try { ensureFullscreen(); ensureOrientation(); } catch {} }, 400);
  } else {
    document.body.classList.remove('kiosk-mode');
    setViewportLock(false);
    try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(()=>{}); } catch {}
    releaseWakeLock();
    unbindWakeLockWatchers();
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

  if (!HARD_KIOSK) {
    kioskExitBtn()?.addEventListener('click', handleTap, {passive:true});
    kioskExitBtn()?.addEventListener('touchstart', (e)=>{ e.preventDefault(); handleTap(); }, {passive:false});
  }

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

  // leave kiosk if fullscreen gets closed via ESC (prevents freeze)
  function fsChange(){
    if (isKiosk() && !document.fullscreenElement) {
      // In hard kiosk we immediately try to recover fullscreen
      ensureFullscreen();
      // Do NOT drop out of kiosk mode
    }
  }
  document.addEventListener('fullscreenchange', fsChange);
  document.addEventListener('webkitfullscreenchange', fsChange);
  window.addEventListener('focus', () => { if (isKiosk()) tryReacquireWakeLockSoon(); }, {passive:true});

  // initial FAB visibility
  syncFabVisibility();
}

// export function syncFabVisibility(){
//   const onSurvey = !document.getElementById('surveyContainer').classList.contains('hidden');
//   const kioskActive = isKiosk();
//   if (kioskEnterBtn()) kioskEnterBtn().style.display = (!linkToken && onSurvey && !kioskActive) ? '' : 'none';
// }

// Ensure the "Enter Tablet mode" FAB appears whenever the survey is visible
export function syncFabVisibility() {
  const btn = document.getElementById('kioskEnter');
  if (!btn) return;

  // Students coming via Discord/QR (token or building in URL) never see the FAB
  const params = new URLSearchParams(location.search);
  const tokenMode = !!(params.get('t') || params.get('token') || params.get('b'));

  const sc = document.getElementById('surveyContainer'); // container that gets toggled
  const sp = document.getElementById('surveyPage');      // inner partial (may not be mounted yet)

  const containerVisible = sc && !sc.classList.contains('hidden');
  const innerVisible     = !sp || !sp.classList.contains('hidden'); // if not present yet, don't block

  const onSurvey = containerVisible && innerVisible;
  const kioskActive = typeof isKiosk === 'function' ? isKiosk() : false;

  // Show only when: not token/QR, on the survey, and not already in kiosk
  btn.style.display = (!tokenMode && onSurvey && !kioskActive) ? '' : 'none';
}