(function () {
  const courseInput = document.getElementById('course_number');
  if (!courseInput) return;

  function getScroller() {
    return document.getElementById('mainWrapper') || document.scrollingElement || document.documentElement;
  }
  function isBodyScroller(sc) {
    return sc === document.body || sc === document.documentElement;
  }
  function withTempScrollable(fn) {
    const sc = getScroller();
    // Temporarily allow vertical scrolling so programmatic centering works
    let prev = '';
    try { prev = sc.style.overflowY || ''; } catch {}
    try { sc.style.overflowY = 'auto'; } catch {}
    try { fn(sc); } finally {
      // Restore after animation finishes
      setTimeout(() => { try { sc.style.overflowY = prev; } catch {} }, 400);
    }
  }
  function centerNow() {
    if (!document.body.classList.contains('kiosk-mode')) return;
    withTempScrollable((sc) => {
      const rect = courseInput.getBoundingClientRect();
      const scRect = sc.getBoundingClientRect ? sc.getBoundingClientRect() : { top: 0, height: (window.visualViewport?.height || window.innerHeight) };
      const current = isBodyScroller(sc) ? window.pageYOffset : sc.scrollTop;
      const midOffset = (rect.top - scRect.top) - (scRect.height / 2) + (rect.height / 2);
      const target = current + midOffset;

      try {
        if (isBodyScroller(sc)) {
          window.scrollTo({ top: target, behavior: 'smooth' });
        } else {
          sc.scrollTo({ top: target, behavior: 'smooth' });
        }
      } catch {}
    });
  }

  // When a datalist option is chosen: keep caret, then center (twice to account for keyboard animation)
  courseInput.addEventListener('change', () => {
    if (!document.body.classList.contains('kiosk-mode')) return;
    courseInput.focus({ preventScroll: true });
    const len = courseInput.value.length;
    try { courseInput.setSelectionRange(len, len); } catch {}
    setTimeout(centerNow, 50);
    setTimeout(centerNow, 350);
  });

  // Also center on plain focus (run twice to catch viewport resize after keyboard shows)
  courseInput.addEventListener('focus', () => {
    if (!document.body.classList.contains('kiosk-mode')) return;
    setTimeout(centerNow, 120);
    setTimeout(centerNow, 420);
  });
})();