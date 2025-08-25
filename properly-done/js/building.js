/* ===== Centering + base type scale (app-wide) ===== */
:root{
  --base-font: 17px;          /* slightly larger than default */
  --card-max: 920px;          /* max width for cards */
  --page-pad: 24px;
}
html{ font-size: var(--base-font); }
body{ min-height:100vh; }

/* Center the three top-level containers and constrain inner width */
#buildingSelectionContainer,
#surveyContainer,
#analyticsContainer{
  display:flex;
  align-items:flex-start;           /* align content near top but centered horizontally */
  justify-content:center;
  padding: var(--page-pad);
}
#buildingSelectionContainer &gt; *:first-child,
#surveyContainer &gt; *:first-child,
#analyticsContainer &gt; *:first-child{
  width:min(96vw, var(--card-max));
  margin-inline:auto;
}

/* Comfortable headings and controls */
h1,h2{ font-weight:700; line-height:1.25; }
h1{ font-size: clamp(1.6rem, 1.1rem + 1.2vw, 2.1rem); }
h2{ font-size: clamp(1.3rem, 1rem + 0.9vw, 1.75rem); }

label, .label{ font-size:1.0625rem; }
input, select, textarea, button{ font-size:1rem; }

/* ===== Kiosk (tablet) scale + card look ===== */
html.kiosk, body.kiosk{
  /* 15% type scale up while keeping layout responsive */
  font-size: calc(var(--base-font, 16px) * 1.15);
}

body.kiosk{
  /* keep the page centered and fixed */
  position: fixed;
  inset: 0;
  overflow: hidden;
  width: 100vw;
  height: 100vh;
  display:flex;
  align-items:center;
  justify-content:center;
  background: #f7f7f8;
  padding: 0 12px;
}

/* keep the survey "card" appearance in kiosk mode */
body.kiosk #surveyContainer &gt; *:first-child{
  background:#fff;
  border:1px solid #e5e7eb;
  border-radius:14px;
  box-shadow: 0 1px 2px rgba(0,0,0,.06), 0 8px 24px rgba(0,0,0,.08);
  padding: 24px;
  width:min(96vw, var(--card-max, 920px));
  margin:0 auto;
}

/* make headings a touch larger in kiosk */
body.kiosk h1{ font-size: clamp(1.8rem, 1.2rem + 1.6vw, 2.4rem); }
body.kiosk h2{ font-size: clamp(1.5rem, 1.1rem + 1.2vw, 2rem); }

/* ===== Survey page tweaks for better centering ===== */
#surveyContainer{ scroll-behavior:smooth; }
#surveyContainer form{ max-width: 100%; }
#surveyContainer .actions button{ font-size:1.0625rem; }

/* Bigger helper text without breaking mobile */
.help, .hint{ font-size:0.95rem; color:#6b7280; }