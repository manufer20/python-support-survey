import { endpoint, STORAGE, state, linkToken, qpWD } from './config.js';
import { getSavedKey } from './auth.js';
import { showError, friendlyError } from './errors.js';
import { syncFabVisibility } from './kiosk.js';


// Center the survey card in the viewport (used on tablet mode open/close keyboard)
function centerSurveyCard(smooth = true) {
  const card = document.getElementById('surveyCard');
  if (!card) return;
  const behavior = smooth ? 'smooth' : 'auto';
  try {
    // Compute a stable center using the scrollingElement to avoid other listeners (like kiosk focusout) fighting us.
    const rect = card.getBoundingClientRect();
    const scrollEl = document.scrollingElement || document.documentElement;
    const currentTop = (scrollEl.scrollTop ?? window.pageYOffset ?? 0);
    const targetTop  = currentTop + rect.top + (rect.height / 2) - (window.innerHeight / 2);
    scrollEl.scrollTo({ top: Math.max(0, Math.floor(targetTop)), behavior });
  } catch {
    try { card.scrollIntoView({ block: 'center', inline: 'nearest', behavior }); } catch {}
  }
}

// After a pick/blur on mobile, guard against Samsung/Android jump-to-top and re-center
function recenterAfterPick(delay = 260, guardMs = 1200) {
  try {
    const sc = document.scrollingElement || document.documentElement;
    const before = sc ? sc.scrollTop : 0;

    // Guard for a short period: if the browser jumps upward, immediately restore.
    let rafId = 0;
    const endAt = performance.now() + guardMs;
    const guard = () => {
      // Only act while in kiosk (tablet) mode
      if (!document.body.classList.contains('kiosk-mode')) return;
      try {
        if ((sc.scrollTop || 0) + 5 < before) sc.scrollTop = before;
      } catch {}
      if (performance.now() < endAt) { rafId = requestAnimationFrame(guard); }
    };
    rafId = requestAnimationFrame(guard);

    // Final re-center after keyboard/UI settles
    setTimeout(() => {
      try {
        if ((sc.scrollTop || 0) + 5 < before) sc.scrollTop = before;
        centerSurveyCard(true);
      } catch {}
      cancelAnimationFrame(rafId);
    }, delay);
  } catch {}
}

export async function verifyOneTimeToken() {
  if (!linkToken) return true;
  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-token': linkToken },
      body: JSON.stringify({ ping: true })
    });
    if (!resp.ok) {
      showError('Oops, this link has expired. Please request a new one-time link from your supporter.', resp.status);
      document.querySelectorAll('#surveyForm input, #surveyForm select, #surveyForm textarea, #surveyForm button')
        .forEach(el => { if (el.id !== 'closeErrorModal') el.disabled = true; });
      return false;
    }
    return true;
  } catch { return true; }
}

function loadCourses() {
  (async () => {
    try {
      const res = await fetch('./data/courses.csv');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const csv = await res.text();
      const lines = csv.split('\n');
      const records = [];
      let buffer = '', inQuotes = false;
      lines.forEach(line => {
        const quoteCount = (line.match(/"/g) || []).length;
        if (!inQuotes) { buffer = line; if (quoteCount % 2 !== 0) inQuotes = true; else records.push(buffer); }
        else { buffer += '\n' + line; if (quoteCount % 2 !== 0) { inQuotes = false; records.push(buffer); } }
      });
      // Remove header
      if (records.length && records[0].toLowerCase().includes('course')) { records.shift(); }

      const options = [];
      records.forEach(record => {
        const idx = record.indexOf(',');
        if (idx === -1) return;
        const code = record.slice(0, idx).trim();
        let rawName = record.slice(idx + 1);
        rawName = rawName.replace(/\r/g, '').replace(/CR$/, '').replace(/^"+|"+$/g, '').trim();
        if (!code || !rawName) return;
        options.push(`${code} - ${rawName}`);
      });

      // Expose for JS autocomplete and also populate datalist for desktop
      window.__COURSE_OPTIONS = options;

      const dl = document.getElementById('courses');
      if (dl) {
        dl.innerHTML = '';
        options.forEach(v => {
          const opt = document.createElement('option');
          opt.value = v;
          dl.appendChild(opt);
        });
      }
      // Announce readiness
      document.dispatchEvent(new CustomEvent('courses:ready'));
    } catch (err) {
      console.error('Error loading courses.csv:', err);
    }
  })();
}

let __courseAutoOnce = false;

function isTouchDevice() {
  return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (navigator.msMaxTouchPoints > 0);
}

function onCoursesReady(cb) {
  if (Array.isArray(window.__COURSE_OPTIONS) && window.__COURSE_OPTIONS.length) {
    cb();
    return;
  }
  const handler = () => { document.removeEventListener('courses:ready', handler); cb(); };
  document.addEventListener('courses:ready', handler);
}

function setupCourseAutocomplete() {
  if (__courseAutoOnce) return;
  __courseAutoOnce = true;

  const input = document.getElementById('course_number');
  if (!input) return;

  // Only apply on touch devices (desktop keeps native datalist UX)
  if (!isTouchDevice()) return;

  // So iOS/Android don't try to show native dropdown simultaneously
  try { input.setAttribute('autocomplete', 'off'); } catch {}

  // Inject minimal CSS once
  if (!document.getElementById('course-autocomplete-css')) {
    const st = document.createElement('style');
    st.id = 'course-autocomplete-css';
    st.textContent = `
      .course-autocomplete{
        position:fixed;z-index:10000;background:#fff;border:1px solid #e5e7eb;border-radius:.5rem;
        box-shadow:0 10px 25px rgba(17,24,39,.12);max-height:40vh;overflow:auto;display:none;
        -webkit-overflow-scrolling: touch; /* iOS smooth scroll */
        touch-action: pan-y;               /* allow vertical panning without triggering taps */
        overscroll-behavior: contain;      /* keep page from stealing the scroll */
      }
      .course-autocomplete .item{
        padding:.5rem .75rem;cursor:pointer;
        touch-action: manipulation;        /* taps okay, avoid gesture side-effects */
      }
      .course-autocomplete .item:hover,.course-autocomplete .item.active{background:#f3f4f6;}
      .course-autocomplete .item.disabled{opacity:.6;cursor:default}
      @media (prefers-color-scheme: dark){
        .course-autocomplete{background:#111827;color:#e5e7eb;border-color:#374151}
        .course-autocomplete .item:hover,.course-autocomplete .item.active{background:#1f2937}
      }
    `;
    document.head.appendChild(st);
  }

  // Create dropdown container in body so it can overlay properly
  const box = document.createElement('div');
  box.className = 'course-autocomplete ui-keep-focus';
  document.body.appendChild(box);

  let results = [];
  let activeIndex = -1;

  function positionBox() {
    const r = input.getBoundingClientRect();

    // Prepare for measurement
    box.style.visibility = 'hidden';
    box.style.display = 'block';

    // Set width and horizontal position
    const width = Math.max(260, Math.floor(r.width));
    box.style.minWidth = width + 'px';
    box.style.width = width + 'px';
    box.style.left = Math.floor(r.left) + 'px';

    // Compute available space above and cap height for comfort
    const pad = 8;
    const availableAbove = Math.max(0, r.top - pad);
    const maxH = Math.floor(Math.min(availableAbove, window.innerHeight * 0.45));
    box.style.maxHeight = (maxH > 0 ? maxH : 160) + 'px';

    // Measure natural height (clamped by maxHeight)
    const natural = Math.min(box.scrollHeight, maxH || box.scrollHeight);

    // Place the dropdown just above the input; clamp to viewport top
    let top = r.top - natural - 6;
    if (top < pad) top = pad;

    box.style.top = Math.floor(top) + 'px';

    // Reveal
    box.style.visibility = 'visible';
  }

  function showBox() {
    // Ensure content is measured then positioned
    positionBox();
    box.style.display = 'block';
  }

  function hideBox() {
    box.style.display = 'none';
    activeIndex = -1;
  }

  function render(list) {
    results = list;
    if (!results.length) {
      box.innerHTML = `<div class="item disabled ui-keep-focus">No matches</div>`;
      // Show above the input even for the empty state
      showBox();
      // A second pass after layout settle (fonts/images) for accuracy
      requestAnimationFrame(() => { if (box.style.display !== 'none') positionBox(); });
      return;
    }
    box.innerHTML = results.map((v,i)=>`<div class="item ui-keep-focus" data-i="${i}">${v}</div>`).join('');
    activeIndex = 0;
    highlight(activeIndex);
    showBox();
    requestAnimationFrame(() => { if (box.style.display !== 'none') positionBox(); });
  }

  function highlight(i) {
    Array.from(box.querySelectorAll('.item')).forEach(el => el.classList.remove('active'));
    const el = box.querySelector(`.item[data-i="${i}"]`);
    if (el) el.classList.add('active');
  }

  function pick(i) {
    const v = results[i];
    if (!v) return;
    input.value = v;
    input.dispatchEvent(new Event('input', { bubbles:true }));
    input.dispatchEvent(new Event('change', { bubbles:true }));
    hideBox();
    // Desktop keeps caret; kiosk avoids refocus jank and recenters robustly
    if (document.body.classList.contains('kiosk-mode')) {
      try { input.blur(); } catch {}
      recenterAfterPick(240);
    } else {
      try {
        input.focus({ preventScroll: true });
        const len = input.value.length;
        input.setSelectionRange(len, len);
      } catch {}
    }
  }

  function filterNow() {
    const q = (input.value || '').toLowerCase().trim();
    const all = Array.isArray(window.__COURSE_OPTIONS) ? window.__COURSE_OPTIONS : [];
    const list = !q ? all.slice(0, 10)
                    : all.filter(v => v.toLowerCase().includes(q)).slice(0, 10);
    render(list);
  }

  input.addEventListener('focus', () => { filterNow(); });
  input.addEventListener('input', () => { filterNow(); });
  input.addEventListener('keydown', (e) => {
    if (box.style.display === 'none') return;
    if (e.key === 'ArrowDown') { e.preventDefault(); if (activeIndex < results.length - 1) { activeIndex++; highlight(activeIndex); } }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (activeIndex > 0) { activeIndex--; highlight(activeIndex); } }
    else if (e.key === 'Enter') { e.preventDefault(); if (activeIndex >= 0) pick(activeIndex); }
    else if (e.key === 'Escape') { e.preventDefault(); hideBox(); }
  });

  // Touch-friendly: only pick on a TAP (no significant movement). Allow vertical scrolling without selecting.
  let tap = { down:false, moved:false, x:0, y:0, id:null };
  const MOVE_THRESH = 8; // px

  box.addEventListener('pointerdown', (e) => {
    // Start tracking only if the press is on an item
    const it = e.target.closest('.item');
    tap.down = !!it && !it.classList.contains('disabled');
    tap.moved = false;
    tap.id = e.pointerId;
    tap.x = e.clientX;
    tap.y = e.clientY;
  }, { passive: true });

  box.addEventListener('pointermove', (e) => {
    if (!tap.down) return;
    const dx = Math.abs((e.clientX ?? 0) - tap.x);
    const dy = Math.abs((e.clientY ?? 0) - tap.y);
    if (dx > MOVE_THRESH || dy > MOVE_THRESH) tap.moved = true; // treat as scroll/drag
  }, { passive: true });

  function endTap(e){
    if (!tap.down) return;
    const wasTap = !tap.moved;
    tap.down = false;
    if (!wasTap) return;
    const it = e.target.closest('.item');
    if (!it || it.classList.contains('disabled')) return;
    const i = Number(it.getAttribute('data-i'));
    pick(i);
  }
  box.addEventListener('pointerup', endTap, { passive: true });
  box.addEventListener('pointercancel', () => { tap.down = false; }, { passive: true });

  // Mouse support (desktop) — normal clicks still pick.
  box.addEventListener('click', (e) => {
    const it = e.target.closest('.item');
    if (!it || it.classList.contains('disabled')) return;
    const i = Number(it.getAttribute('data-i'));
    pick(i);
  });

  // Hide when tapping outside
  document.addEventListener('pointerdown', (e) => {
    const t = e.target;
    if (t === input || box.contains(t)) return;
    hideBox();
  });

  // Keep box positioned on scroll/resize (important for kiosk)
  ['scroll','resize','orientationchange'].forEach(evt => {
    window.addEventListener(evt, () => { if (box.style.display !== 'none') positionBox(); }, { passive:true });
  });
}

export function wireSurveyForm(){
  loadCourses();
  verifyOneTimeToken();
  try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch {}
  onCoursesReady(() => {
    try { setupCourseAutocomplete(); } catch (e) { console.error('autocomplete init failed', e); }
  });

  // Intercept focusout in kiosk mode to prevent external handlers from forcing scrollTop=0
  if (!window.__kioskFocusoutInterceptorAttached) {
    document.addEventListener('focusout', (e) => {
      if (!document.body.classList.contains('kiosk-mode')) return;
      const card = document.getElementById('surveyCard');
      if (!card) return;
      if (!(e.target && card.contains(e.target))) return;
      try { e.stopImmediatePropagation(); e.stopPropagation(); } catch {}
      // After focus moves (e.g., closing keyboard or picking a course), re-center the card
      recenterAfterPick(180);
    }, { capture: true });
    window.__kioskFocusoutInterceptorAttached = true;
  }

  // If starting in kiosk, center the card once the layout settles
  if (typeof inKiosk === 'function' && inKiosk()) {
    setTimeout(() => centerSurveyCard(true), 150);
  }

  // If tablet mode is toggled later, re-apply
  try {
    const __kioskClassWatcher = new MutationObserver(() => {
      if (document.body.classList.contains('kiosk-mode')) {
        setTimeout(() => centerSurveyCard(true), 150);
      }
    });
    __kioskClassWatcher.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  } catch {}

  // Re-center on viewport changes in kiosk mode (e.g., orientation or keyboard height changes)
  window.addEventListener('resize', () => {
    if (typeof inKiosk === 'function' && inKiosk()) {
      setTimeout(() => centerSurveyCard(false), 200);
    }
  });

  const form = document.getElementById("surveyForm");
  const thankYou = document.getElementById("thankYouModal");
  const closeBtn = document.getElementById("closeModal");
  const submitButton = document.getElementById("submitButton");

  const studentWrapper  = document.getElementById('studentWrapper');
  const usernameWrapper = document.getElementById('usernameWrapper');
  const studentNumInput = document.getElementById('student_number');
  const usernameInput   = document.getElementById('dtu_username');

  // --- Kiosk UX helpers & hardening for inputs ---
  // Hint mobile keyboards and constrain length at the DOM level
  if (studentNumInput) {
    try {
      studentNumInput.setAttribute('inputmode', 'numeric');
      studentNumInput.setAttribute('enterkeyhint', 'next');
      studentNumInput.setAttribute('maxlength', '6');
      studentNumInput.setAttribute('autocomplete', 'one-time-code');
    } catch {}
  }

  // Local helper to jump to the satisfaction row without auto-selecting
  function jumpToSatisfaction() {
    const firstSmile = document.querySelector('input[name="satisfaction"]');
    if (firstSmile) {
      try { firstSmile.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch {}
      try { firstSmile.focus({ preventScroll: true }); } catch {}
    }
  }

  // Digits-only enforcement for the student number
  if (studentNumInput) {
    // Block non-digits before they land
    studentNumInput.addEventListener('beforeinput', (e) => {
      // Allow deletions/moves
      const t = e.inputType || '';
      if (t.startsWith('delete') || t.startsWith('history') || t.includes('format')) return;
      const data = (e.data ?? '');
      if (data && /\D/.test(data)) { e.preventDefault(); }
    });

    // Strip any stray non-digits (incl. from auto-fill) and cap to 6
    studentNumInput.addEventListener('input', () => {
      const cleaned = (studentNumInput.value || '').replace(/\D/g, '').slice(0, 6);
      if (studentNumInput.value !== cleaned) studentNumInput.value = cleaned;
    });

    // Guard paste
    studentNumInput.addEventListener('paste', (e) => {
      e.preventDefault();
      const txt = (e.clipboardData || window.clipboardData)?.getData('text') || '';
      const cleaned = txt.replace(/\D/g, '').slice(0, 6);
      const start = studentNumInput.selectionStart ?? studentNumInput.value.length;
      const end   = studentNumInput.selectionEnd ?? studentNumInput.value.length;
      const v = studentNumInput.value;
      const next = (v.slice(0, start) + cleaned + v.slice(end)).replace(/\D/g, '').slice(0, 6);
      studentNumInput.value = next;
      // Trigger validation UI
      studentNumInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // Allow only control keys + digits on keydown
    studentNumInput.addEventListener('keydown', (e) => {
      const allowedKeys = new Set(['Backspace','Delete','ArrowLeft','ArrowRight','Home','End','Tab']);
      const isDigit = (e.key && /^[0-9]$/.test(e.key)) || (e.code && /^Numpad[0-9]$/.test(e.code));
      if (e.key === 'Enter') {
        // Enter/Next moves to satisfaction
        e.preventDefault();
        jumpToSatisfaction();
        return;
      }
      if (allowedKeys.has(e.key) || isDigit) return;
      // Allow shortcuts like Cmd/Ctrl+A/C/V/X
      if ((e.ctrlKey || e.metaKey) && ['a','c','v','x','A','C','V','X'].includes(e.key)) return;
      e.preventDefault();
    });
  }

  // Smoothly center the active input in kiosk mode
  [studentNumInput, usernameInput].forEach((inp) => {
    if (!inp) return;
    inp.addEventListener('focus', () => {
      if (inKiosk && typeof inKiosk === 'function' && inKiosk()) {
        setTimeout(() => { try { inp.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' }); } catch {} }, 120);
      }
    });
    inp.addEventListener('blur', () => {
      if (inKiosk && typeof inKiosk === 'function' && inKiosk()) {
        // Let the keyboard retract, then center the card
        setTimeout(() => centerSurveyCard(true), 220);
      }
    });
  });

  // Tap anywhere outside inputs to dismiss the keyboard (tablet mode only)
  if (!window.__surveyTapToDismissAttached) {
    document.addEventListener('pointerdown', (e) => {
      if (!(inKiosk && typeof inKiosk === 'function' && inKiosk())) return;
      const t = e.target;
      // Keep focus if tapping an input/select/textarea/datalist or their UI
      if (t && (t.closest('input, textarea, select, datalist, .ui-keep-focus'))) return;
      const active = document.activeElement;
      if (active && active.matches && active.matches('input, textarea, select')) {
        try { active.blur(); } catch {}
        // After dismissing, re-center the survey card
        setTimeout(() => { if (inKiosk && typeof inKiosk === 'function' && inKiosk()) centerSurveyCard(true); }, 180);
      }
    }, { passive: true });
    window.__surveyTapToDismissAttached = true;
  }

  // role toggle + clean abandoned field
  function toggleRole() {
    const isStudent = form.role.value === 'student';
    studentWrapper.classList.toggle('hidden', !isStudent);
    usernameWrapper.classList.toggle('hidden',  isStudent);
    studentNumInput.required = isStudent;
    usernameInput.required   = !isStudent;
    if (isStudent) {
      studentNumInput.disabled = false;
      usernameInput.disabled = true;
      usernameInput.value = '';
      usernameInput.setCustomValidity('');
    } else {
      usernameInput.disabled = false;
      studentNumInput.disabled = true;
      studentNumInput.value = '';
      studentNumInput.setCustomValidity('');
    }
  }
  form.querySelectorAll('input[name="role"]').forEach(r => r.addEventListener('change', toggleRole));
  toggleRole();


  function setStudentCustomValidation() {
    const isStudent = (form.role.value === 'student');
    if (!isStudent || studentNumInput.disabled) { studentNumInput.setCustomValidity(''); return; }
    const v = (studentNumInput.value || '').trim();
    if (!v)      studentNumInput.setCustomValidity("Please enter your student number: type the 6 digits after 's' (e.g. s123456).");
    else if (!/^\d{6}$/.test(v)) studentNumInput.setCustomValidity("Format: exactly 6 digits. Example: s123456. Don’t type the 's'—it's already filled in.");
    else         studentNumInput.setCustomValidity('');
  }
  studentNumInput.addEventListener('input', () => studentNumInput.setCustomValidity(''));
  studentNumInput.addEventListener('blur', setStudentCustomValidation);
  studentNumInput.addEventListener('invalid', setStudentCustomValidation);

  let redirectOnThankYouClose = false;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    submitButton.disabled = true;
    submitButton.textContent = 'Submitting...';
    submitButton.classList.add('opacity-50', 'cursor-not-allowed');

    const isStudent = form.role.value === 'student';
    const payload = {
      role: form.role.value,
      student_number: isStudent ? 's' + studentNumInput.value.trim() : null,
      username:        !isStudent ? usernameInput.value.trim() : null,
      satisfaction: Number(form.querySelector('input[name="satisfaction"]:checked').value),
      course_number: (document.getElementById('course_number').value || '').trim() || null,
      building_Number: linkToken ? null : state.selectedBuilding,
      workshop: (form.elements['workshop'] && form.elements['workshop'].value === 'yes'),
      token: linkToken || null,
    };

    try {
      const headers = { "Content-Type": "application/json" };
      if (linkToken) { headers["x-token"] = linkToken; } else { headers["x-api-key"] = getSavedKey()[1] || ""; }
      const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(payload) });

      if (response.ok) {
        if (linkToken) {
          thankYou.classList.remove('hidden');
          redirectOnThankYouClose = true;
          setTimeout(() => { window.location.replace('https://pythonsupport.dtu.dk/'); }, 7000);
        } else {
          thankYou.classList.remove('hidden');
          if (document.body.classList.contains('kiosk-mode')) { setTimeout(() => centerSurveyCard(true), 220); }
          form.reset();
          form.role.value = 'student';
          toggleRole();
          const preferWD = qpWD || (localStorage.getItem(STORAGE.WORKSHOP) === 'true');
          document.getElementById('workshop_yes').checked = !!preferWD;
          document.getElementById('workshop_no').checked  = !preferWD;
          studentNumInput.value = '';
          studentNumInput.focus();
          document.activeElement?.blur();
          setTimeout(() => { 
            thankYou.classList.add('hidden'); 
            if (document.body.classList.contains('kiosk-mode')) { centerSurveyCard(true); }
          }, 3000);
        }
      } else {
        let raw = '';
        try {
          const ct = (response.headers.get('Content-Type') || '').toLowerCase();
          if (ct.includes('application/json')) {
            const j = await response.json();
            raw = j?.message || (typeof j === 'string' ? j : JSON.stringify(j));
          } else {
            const t = await response.text(); if (t && t.trim().length) raw = t.trim();
          }
        } catch {}
        showError(friendlyError(raw, response.status, !!linkToken), response.status);
        if (form.role.value === 'student') { studentNumInput.focus(); } else { usernameInput?.focus(); }
      }
    } catch (err) {
      console.error("submit failed:", err);
      showError('A network error occurred. Please check your connection and try again.');
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'Submit Survey';
      submitButton.classList.remove('opacity-50', 'cursor-not-allowed');
      syncFabVisibility();
    }
  });

  closeBtn.addEventListener('click', () => {
    if (redirectOnThankYouClose && linkToken) window.location.replace('https://pythonsupport.dtu.dk/');
    else thankYou.classList.add('hidden');
  });
}

(function () {
  const courseInput = document.getElementById('course_number');
  if (!courseInput) return;

  // Helper: does current value exactly match a known course option?
  function isExactCourseMatch(val) {
    const v = String(val || '').trim();
    if (!v) return false;

    // Check datalist options if present
    const dl = document.getElementById('courses');
    if (dl) {
      const opts = Array.from(dl.querySelectorAll('option')).map(o => o.value);
      if (opts.includes(v)) return true;
    }
    // Check JS-loaded options (mobile autocomplete)
    if (Array.isArray(window.__COURSE_OPTIONS)) {
      if (window.__COURSE_OPTIONS.includes(v)) return true;
    }
    return false;
  }

  // On touch/datalist flows some browsers only fire 'input'. If the value equals an option, treat it as a pick.
  courseInput.addEventListener('input', () => {
    if (!document.body.classList.contains('kiosk-mode')) return;
    if (!isExactCourseMatch(courseInput.value)) return;

    // Consider it selected: blur to close keyboard, then center the card
    try { courseInput.blur(); } catch {}
    recenterAfterPick(220);
  });

  // Re-center and keep the caret editable after choosing an option
  courseInput.addEventListener('change', () => {
    if (!document.body.classList.contains('kiosk-mode')) return;

    // Treat change as a confirmed pick: blur to close keyboard, then re-center the whole card
    try { courseInput.blur(); } catch {}
    recenterAfterPick(220);
  });

  // Also center on plain focus
  courseInput.addEventListener('focus', () => {
    if (document.body.classList.contains('kiosk-mode')) {
      setTimeout(() => { try { courseInput.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' }); } catch {} }, 150);
    }
  });

  // When leaving the field (keyboard hides), center the whole card again
  courseInput.addEventListener('blur', () => {
    if (document.body.classList.contains('kiosk-mode')) {
      setTimeout(() => { try { centerSurveyCard(true); } catch {} }, 220);
    }
  });
})();


function inKiosk() {
  return document.body.classList.contains('kiosk-mode');
}