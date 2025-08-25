// js/boot.js
async function loadInto(id, url) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Mount ${id} not found`);
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  el.innerHTML = await res.text();
}

(async function boot() {
  await Promise.all([
    loadInto('sidebarMount',   'partials/sidebar.html'),
    loadInto('buildingMount',  'partials/building-selection.html'),
    loadInto('surveyMount',    'partials/survey-form.html'),
    loadInto('analyticsMount', 'partials/analytics.html'),
    loadInto('modalsMount',    'partials/modals.html'),
  ]);

  // Now that the DOM exists, run your original app logic
  await import('./app.js');
})().catch(err => {
  console.error('Boot error:', err);
  alert('Error loading the app. Please refresh.');
});