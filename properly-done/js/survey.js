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
    // Compute a stable center using the scrollingElement to avoid other listeners fighting us.
    const rect = card.getBoundingClientRect();
    const scrollEl = document.scrollingElement || document.documentElement;
    const currentTop = (scrollEl.scrollTop ?? window.pageYOffset ?? 0);
    const targetTop  = currentTop + rect.top + (rect.height / 2) - (window.innerHeight / 2);
    scrollEl.scrollTo({ top: Math.max(0, Math.floor(targetTop)), behavior });
  } catch {
    try { card.scrollIntoView({ block: 'center', inline: 'nearest', behavior }); } catch {}
  }
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

export function wireSurveyForm(){
  verifyOneTimeToken();
  try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch {}

  // If starting in kiosk, center the card once the layout settles
  if (typeof inKiosk === 'function' && inKiosk()) {
    setTimeout(() => centerSurveyCard(true), 150);
  }

  // If tablet mode is toggled later, re-center
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
      studentNumInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // Allow only control keys + digits on keydown
    studentNumInput.addEventListener('keydown', (e) => {
      const allowedKeys = new Set(['Backspace','Delete','ArrowLeft','ArrowRight','Home','End','Tab']);
      const isDigit = (e.key && /^[0-9]$/.test(e.key)) || (e.code && /^Numpad[0-9]$/.test(e.code));
      if (e.key === 'Enter') {
        e.preventDefault();
        jumpToSatisfaction();
        return;
      }
      if (allowedKeys.has(e.key) || isDigit) return;
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
        setTimeout(() => centerSurveyCard(true), 220);
      }
    });
  });

  // Tap anywhere outside inputs to dismiss the keyboard (tablet mode only)
  if (!window.__surveyTapToDismissAttached) {
    document.addEventListener('pointerdown', (e) => {
      if (!(inKiosk && typeof inKiosk === 'function' && inKiosk())) return;
      const t = e.target;
      if (t && (t.closest('input, textarea, select, datalist, .ui-keep-focus'))) return;
      const active = document.activeElement;
      if (active && active.matches && active.matches('input, textarea, select')) {
        try { active.blur(); } catch {}
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

function inKiosk() {
  return document.body.classList.contains('kiosk-mode');
}