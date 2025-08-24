// ===== Simple component loader =====
(async function mount() {
  async function load(id, file) {
    const el = document.getElementById(id);
    el.innerHTML = await (await fetch(file)).text();
  }
  await Promise.all([
    load('sidebarMount',   'components/sidebar.html'),
    load('buildingMount',  'components/building-selection.html'),
    load('surveyMount',    'components/survey-form.html'),
    load('analyticsMount', 'components/analytics.html'),
    load('modalsMount',    'components/modals.html'),
  ]);
  initApp();
})();

// ===== App logic (merged) =====
function initApp() {
  // --- endpoints / storage
  const endpoint       = "https://python-support-proxy.azurewebsites.net/api/surveyProxy";
  const tokenEndpoint  = "https://python-support-proxy.azurewebsites.net/api/issueToken";
  const qrSignEndpoint = "https://python-support-proxy.azurewebsites.net/api/qrRedirect";
  const STORAGE_KEY    = "surveySupportAuth";

  // --- reset helper
  (function maybeReset(){
    const params = new URLSearchParams(location.search);
    if (params.get('reset') === '1') {
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
      try { localStorage.removeItem('selectedBuilding'); } catch {}
      ['reset','t','token','b','wd'].forEach(k=>params.delete(k));
      const next = location.pathname + (params.toString() ? `?${params}` : '');
      location.replace(next);
    }
  })();

  // --- auth helpers
  function getSavedKey(){
    try { const v = localStorage.getItem(STORAGE_KEY); return v ? v.split("|") : [null,null]; }
    catch { return [null,null]; }
  }
  function isAuthValid() {
    const [date, key] = getSavedKey();
    const today = new Date().toISOString().slice(0,10);
    return date === today && !!key;
  }
  function showLogin(){
    document.getElementById("loginModal").classList.remove("hidden");
    document.getElementById("mainWrapper").classList.add("pointer-events-none","opacity-40");
    setTimeout(()=>{ const i=document.getElementById("accessCodeInput"); if(i){ i.focus(); i.select(); } },0);
  }
  function hideLogin(){
    document.getElementById("loginModal").classList.add("hidden");
    document.getElementById("mainWrapper").classList.remove("pointer-events-none","opacity-40");
    document.getElementById("loginError").classList.add("hidden");
  }

  // --- params / state
  const sp           = new URLSearchParams(location.search);
  const linkToken    = sp.get('t') || sp.get('token');
  const qpBuilding   = sp.get('b');
  const qpWD         = sp.get('wd') === '1';
  const tokenOrQr    = !!(linkToken || qpBuilding);

  let selectedBuilding = (()=>{ try{ const v=localStorage.getItem('selectedBuilding'); return v?Number(v):null; }catch{ return null; }})();
  if (qpBuilding) { selectedBuilding = Number(qpBuilding); try{ localStorage.setItem('selectedBuilding', String(selectedBuilding)); }catch{} }
  if (linkToken)   { selectedBuilding = null; }

  // --- ensure kiosk OFF if supporter login required
  if (!tokenOrQr && !isAuthValid()) { try { localStorage.removeItem('kioskMode'); } catch {} document.body.classList.remove('kiosk-mode'); }

  if (tokenOrQr || isAuthValid()) hideLogin(); else showLogin();

  document.getElementById("codeSubmit").addEventListener("click", async () => {
    const input = document.getElementById("accessCodeInput").value.trim();
    const ok = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": input },
      body: JSON.stringify({ ping: true })
    }).then(r=>r.ok).catch(()=>false);
    if (ok) {
      const today = new Date().toISOString().slice(0,10);
      try { localStorage.setItem(STORAGE_KEY, `${today}|${input}`); } catch {}
      hideLogin(); document.getElementById("accessCodeInput").value = "";
    } else { document.getElementById("loginError").classList.remove("hidden"); }
  });
  document.addEventListener('keydown', (e)=>{
    const modal = document.getElementById('loginModal');
    if (modal && !modal.classList.contains('hidden') && e.key === 'Enter') {
      e.preventDefault(); document.getElementById('codeSubmit')?.click();
    }
  });

  // --- error helpers
  function friendlyError(raw, status=0, usingToken=false){
    const text=(typeof raw==='string')?raw:(raw?.message||'');
    const l=(text||'').toLowerCase();
    let title="We couldn't submit your response";
    let message='Please try again in a moment.';
    const roleNow = (document.querySelector('input[name="role"]:checked')?.value || 'student');
    if (l.includes('study number does not exist') || l.includes('student number does not exist')) {
      if (roleNow==='employee'){ title='DTU username not found'; message="We couldn't find that DTU username. Please enter your DTU credentials (letters only, e.g. 'manufer') and try again."; }
      else { title='Student number not found'; message="Please check the six digits after 's' on your DTU ID (e.g. s123456) and try again."; }
    } else if (l.includes('invalid or used token') || l.includes('token expired') || (status===401 && usingToken) || l.includes('link has expired')) {
      title="Oops, this link has expired"; message='This one-time link has already been used or expired. Please request a new link from your supporter.';
    } else if (l.includes('unauthorized')) {
      title='Not authorised'; message='Your session has expired. Please refresh and try again.';
    } else if (status>=500) {
      title='Service temporarily unavailable'; message='Please try again in a minute.';
    } else if (status===429) {
      title='Too many attempts'; message='Please wait a moment and try again.';
    } else if (text && text.trim()) { message=text; }
    return { title, message };
  }
  function showError(input, status){
    const usingToken = !!(sp.get('t') || sp.get('token'));
    const { title, message } = (typeof input==='string') ? friendlyError(input,status,usingToken)
      : (input && typeof input==='object') ? input : friendlyError('',status,usingToken);

    const titleEl = document.getElementById('errorTitle'); if (titleEl) titleEl.textContent = title;
    document.querySelector('.error-message').textContent = message;

    const combo=(title+' '+message).toLowerCase();
    const expired = usingToken && (combo.includes('expired') || combo.includes('invalid or used token') || combo.includes('token expired'));
    const btn = document.getElementById('closeErrorModal');
    if (btn) {
      btn.textContent = expired ? 'Go to Python Support' : 'Try Again';
      btn.onclick = () => {
        document.getElementById('errorModal').classList.add('hidden');
        if (expired) window.location.replace('https://pythonsupport.dtu.dk/');
      };
    }
    document.getElementById('errorModal').classList.remove('hidden');
  }

  // --- DOM refs (after components loaded)
  const buildingSelectionPage = document.getElementById('buildingSelectionPage');
  const surveyPage            = document.getElementById('surveyPage');
  const analyticsPage         = document.getElementById('analyticsPage');

  // --- student-flow & sidebar visibility
  function isKiosk(){ try { return localStorage.getItem('kioskMode')==='1'; } catch { return false; } }
  function applyStudentFlowLayout(){
    const on = tokenOrQr || isKiosk();
    document.body.classList.toggle('student-flow', on);
  }
  function applySidebarVisibility(){
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const openBtn = document.getElementById('openSidebar');
    const hide = tokenOrQr || isKiosk();

    if (sidebar) {
      if (hide) { sidebar.hidden=true; sidebar.style.display='none'; sidebar.setAttribute('aria-hidden','true'); sidebar.setAttribute('inert',''); }
      else { sidebar.hidden=false; sidebar.style.display=''; sidebar.removeAttribute('aria-hidden'); sidebar.removeAttribute('inert'); }
    }
    if (overlay){ overlay.classList.add('hidden'); overlay.style.display='none'; }
    if (openBtn){ openBtn.style.display = hide ? 'none' : ''; }

    if (hide && analyticsPage && !analyticsPage.classList.contains('hidden')) { switchToSurvey(); }
    applyStudentFlowLayout();
  }

  // --- QR modal
  (function wireQR(){
    const btnQR  = document.getElementById('btnGenerateQR');
    const modal  = document.getElementById('qrModal');
    if (!btnQR || !modal) return;

    const qrCreate  = document.getElementById('qrCreate');
    const qrClose   = document.getElementById('qrClose');
    const qrCopy    = document.getElementById('qrCopy');
    const qrCanvas  = document.getElementById('qrCanvas');
    const qrImg     = document.getElementById('qrImg');
    const qrLinkInp = document.getElementById('qrLink');
    const qrResult  = document.getElementById('qrResult');
    const qrBuildingInp = document.getElementById('qrBuilding');
    const qrWorkshopDay = document.getElementById('qrWorkshopDay');
    const qrInlineError = document.getElementById('qrInlineError');

    function openQr(){
      if (isKiosk()) return;
      if (selectedBuilding!==null && !isNaN(selectedBuilding)) qrBuildingInp.value = String(selectedBuilding);
      else qrBuildingInp.value = '';
      try { qrWorkshopDay.checked = (localStorage.getItem('workshopDay')==='true'); } catch {}
      if (qrImg) { qrImg.src=''; qrImg.classList.add('hidden'); }
      qrCanvas.classList.remove('hidden');
      qrResult.classList.add('hidden');
      qrInlineError.textContent=''; qrInlineError.classList.add('hidden');
      modal.classList.remove('hidden');
    }
    function closeQr(){ modal.classList.add('hidden'); }

    btnQR.addEventListener('click', openQr);
    qrClose.addEventListener('click', closeQr);

    modal.querySelectorAll('.qr-quick').forEach(btn=>{
      btn.addEventListener('click', ()=>{ qrBuildingInp.value = btn.getAttribute('data-building') || ''; qrInlineError.textContent=''; qrInlineError.classList.add('hidden'); });
    });
    qrBuildingInp.addEventListener('input', ()=>{ qrInlineError.textContent=''; qrInlineError.classList.add('hidden'); });

    qrCreate.addEventListener('click', async ()=>{
      if (isKiosk()) return;
      const bVal = qrBuildingInp.value.trim();
      const bNum = Number(bVal);
      if (!bVal || isNaN(bNum) || bNum<0 || bNum>990) {
        qrInlineError.textContent='Please enter a valid building between 000 and 990 or use a quick option.';
        qrInlineError.classList.remove('hidden');
        return;
      }
      try{
        const resp = await fetch(`${qrSignEndpoint}?sign=1&b=${encodeURIComponent(String(bNum))}&wd=${qrWorkshopDay.checked?1:0}`, {
          method:'GET', headers:{ 'x-api-key': getSavedKey()[1] || '' }
        });
        if (!resp.ok) { const t=await resp.text().catch(()=> ''); showError('Could not create static QR. '+(t||''), resp.status); return; }
        const data = await resp.json();
        const url = data.url;
        qrLinkInp.value = url;

        if (window.QRCode?.toCanvas) {
          const ctx = qrCanvas.getContext('2d'); ctx.clearRect(0,0,qrCanvas.width,qrCanvas.height);
          await QRCode.toCanvas(qrCanvas, url, { width: 280, margin: 2 });
          qrCanvas.classList.remove('hidden'); qrImg.classList.add('hidden');
        } else {
          const enc = encodeURIComponent(url);
          qrCanvas.classList.add('hidden'); qrImg.classList.remove('hidden');
          qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${enc}`;
          qrImg.onerror = function(){ qrImg.onerror=null; qrImg.src=`https://chart.googleapis.com/chart?chs=280x280&cht=qr&chl=${enc}`; };
        }
        qrResult.classList.remove('hidden');
      }catch(e){ console.error(e); showError('Unexpected error while generating the QR.'); }
    });

    qrCopy.addEventListener('click', async ()=>{ try{ await navigator.clipboard.writeText(qrLinkInp.value); }catch{} });
  })();

  // --- One-time (Discord) link
  (function wireOneTimeLink(){
    const btn = document.getElementById('btnGenerateLink');
    if (!btn) return;
    btn.addEventListener('click', async ()=>{
      if (isKiosk()) return;
      try {
        const resp = await fetch(tokenEndpoint, {
          method:'POST',
          headers:{ 'Content-Type':'application/json', 'x-api-key': getSavedKey()[1] || '' },
          body: JSON.stringify({ expiresHours:24, building_Number:'Online' })
        });
        if (!resp.ok) { const t=await resp.text().catch(()=> ''); showError('Could not generate link. '+(t||''), resp.status); return; }
        const data = await resp.json().catch(()=> ({}));
        const base = window.location.origin + window.location.pathname;
        const wd = (document.getElementById('workshopDayToggle')?.checked) ? '&wd=1' : '';
        const url = data.url || data.oneTimeUrl || `${base}?token=${encodeURIComponent(data.token)}${wd}`;
        try{ await navigator.clipboard.writeText(url); }catch{}
        alert('Discord link copied to clipboard:\n' + url);
      } catch(e){ console.error(e); showError('Unexpected error while generating the link.'); }
    });
  })();

  // --- Workshop Day toggle persistence
  (function(){
    const t = document.getElementById('workshopDayToggle');
    if (!t) return;
    try { t.checked = localStorage.getItem('workshopDay')==='true'; } catch {}
    t.addEventListener('change', ()=>{ try{ localStorage.setItem('workshopDay', String(t.checked)); }catch{} });
  })();

  // --- Building selection (global for onclick)
  function selectBuilding(n){
    if (isKiosk()) return;
    selectedBuilding = Number(n);
    try { localStorage.setItem('selectedBuilding', String(selectedBuilding)); } catch {}
    showSurveyForm();
  }
  function selectCustomBuilding(){
    if (isKiosk()) return;
    const inp = document.getElementById('customBuilding');
    const v = parseInt(inp.value,10);
    if (!inp.value || isNaN(v) || v<=100 || v>=500) { showError('Please enter a valid building number (101-499).'); return; }
    selectBuilding(v);
  }
  function handleEnterKey(e){ if (e.key==='Enter') selectCustomBuilding(); }
  window.selectBuilding = selectBuilding;
  window.selectCustomBuilding = selectCustomBuilding;
  window.handleEnterKey = handleEnterKey;

  // --- Navigation / sidebar
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const openBtn = document.getElementById('openSidebar');
  const closeBtn= document.getElementById('closeSidebar');
  const surveyTab = document.getElementById('surveyTab');
  const analyticsTab = document.getElementById('analyticsTab');
  const backSelectorTab = document.getElementById('backSelectorTab');
  const resetTab = document.getElementById('resetTab');

  function openSidebar(){ if (isKiosk() || tokenOrQr) return; sidebar.classList.remove('-translate-x-full'); overlay.classList.remove('hidden'); document.body.classList.add('overflow-hidden'); }
  function closeSidebar(){ sidebar.classList.add('-translate-x-full'); overlay.classList.add('hidden'); document.body.classList.remove('overflow-hidden'); }
  openBtn?.addEventListener('click', openSidebar);
  closeBtn?.addEventListener('click', closeSidebar);
  overlay?.addEventListener('click', closeSidebar);

  function switchToSurvey(e){
    if (e) e.preventDefault();
    if (isKiosk()) { showSurveyForm(); return; }
    if (selectedBuilding===null && !tokenOrQr) showBuildingSelection(); else showSurveyForm();
    surveyTab?.classList.add('border-r-4','border-red-500','bg-gray-50');
    analyticsTab?.classList.remove('border-r-4','border-red-500','bg-gray-50');
    closeSidebar();
  }
  function switchToAnalytics(e){
    if (e) e.preventDefault();
    if (isKiosk() || tokenOrQr) return;
    buildingSelectionPage.classList.add('hidden');
    surveyPage.classList.add('hidden');
    analyticsPage.classList.remove('hidden');
    analyticsTab?.classList.add('border-r-4','border-red-500','bg-gray-50');
    surveyTab?.classList.remove('border-r-4','border-red-500','bg-gray-50');
    closeSidebar();
    syncFabVisibility();
    syncBackSelectorVisibility();
  }
  surveyTab?.addEventListener('click', switchToSurvey);
  analyticsTab?.addEventListener('click', switchToAnalytics);
  backSelectorTab?.addEventListener('click', e=>{ e.preventDefault(); showBuildingSelection(); closeSidebar(); });
  resetTab?.addEventListener('click', e=>{ e.preventDefault(); location.href = location.pathname + '?reset=1'; });

  function syncBackSelectorVisibility(){
    if (!backSelectorTab) return;
    const onSelector = !buildingSelectionPage.classList.contains('hidden');
    backSelectorTab.style.display = onSelector ? 'none' : '';
  }

  // --- Show pages
  async function verifyOneTimeToken(){
    if (!linkToken) return true;
    try{
      const r = await fetch(endpoint, { method:'POST', headers:{ 'Content-Type':'application/json','x-token':linkToken }, body: JSON.stringify({ ping:true }) });
      if (!r.ok) {
        showError('Oops, this link has expired. Please request a new one-time link from your supporter.');
        document.querySelectorAll('#surveyForm input, #surveyForm select, #surveyForm textarea, #surveyForm button')
          .forEach(el=>{ if (el.id!=='closeErrorModal') el.disabled = true; });
        return false;
      }
      return true;
    }catch{ return true; }
  }
  function showBuildingSelection(){
    if (isKiosk()) return;
    buildingSelectionPage.classList.remove('hidden');
    surveyPage.classList.add('hidden');
    analyticsPage.classList.add('hidden');
    syncFabVisibility();
    syncBackSelectorVisibility();
  }
  function showSurveyForm(){
    buildingSelectionPage.classList.add('hidden');
    surveyPage.classList.remove('hidden');
    analyticsPage.classList.add('hidden');
    const preferWD = qpWD || (localStorage.getItem('workshopDay')==='true');
    const wy = document.getElementById('workshop_yes');
    const wn = document.getElementById('workshop_no');
    if (wy && wn) { wy.checked = !!preferWD; wn.checked = !preferWD; }
    if (linkToken) verifyOneTimeToken();
    syncFabVisibility();
    syncBackSelectorVisibility();
  }

  // --- Survey logic
  (function wireSurvey(){
    const form = document.getElementById('surveyForm');
    const thankYouModal = document.getElementById('thankYouModal');
    const closeTY = document.getElementById('closeModal');
    const submitBtn = document.getElementById('submitButton');

    const studentWrapper  = document.getElementById('studentWrapper');
    const usernameWrapper = document.getElementById('usernameWrapper');
    const studentNumInput = document.getElementById('student_number');
    const usernameInput   = document.getElementById('dtu_username');

    form.querySelectorAll('input[name="role"]').forEach(r=> r.addEventListener('change', toggleRole));
    function toggleRole(){
      const isStudent = form.role.value==='student';
      studentWrapper.classList.toggle('hidden', !isStudent);
      usernameWrapper.classList.toggle('hidden',  isStudent);
      studentNumInput.required = isStudent;
      usernameInput.required   = !isStudent;
      if (isStudent) {
        studentNumInput.disabled=false;
        usernameInput.disabled=true; usernameInput.value=''; usernameInput.setCustomValidity('');
      } else {
        usernameInput.disabled=false;
        studentNumInput.disabled=true; studentNumInput.value=''; studentNumInput.setCustomValidity('');
      }
    }
    toggleRole();

    function setStudentCustomValidation(){
      const isStudent = (form.role.value==='student');
      if (!isStudent || studentNumInput.disabled) { studentNumInput.setCustomValidity(''); return; }
      const v = (studentNumInput.value||'').trim();
      if (!v) studentNumInput.setCustomValidity("Please enter your student number: type the 6 digits after 's' (e.g. s123456).");
      else if (!/^\d{6}$/.test(v)) studentNumInput.setCustomValidity("Format: exactly 6 digits. Example: s123456. Don’t type the 's'—it's already filled in.");
      else studentNumInput.setCustomValidity('');
    }
    studentNumInput.addEventListener('input', ()=> studentNumInput.setCustomValidity(''));
    studentNumInput.addEventListener('blur', setStudentCustomValidation);
    studentNumInput.addEventListener('invalid', setStudentCustomValidation);

    // courses.csv datalist
    (async ()=>{
      try{
        const res = await fetch('./courses.csv');
        if(!res.ok) throw new Error('csv');
        const csv = await res.text();
        const lines = csv.split('\n');
        const records=[]; let buf='', inQ=false;
        lines.forEach(line=>{
          const q=(line.match(/"/g)||[]).length;
          if(!inQ){ buf=line; if(q%2!==0) inQ=true; else records.push(buf); }
          else { buf+='\n'+line; if(q%2!==0){ inQ=false; records.push(buf); } }
        });
        records.shift();
        const dl=document.getElementById('courses');
        records.forEach(r=>{
          const i=r.indexOf(','); const code=r.slice(0,i).trim();
          let name=r.slice(i+1).replace(/\r/g,'').replace(/CR$/,'').replace(/^"+|"+$/g,'').trim();
          const opt=document.createElement('option'); opt.value=`${code} - ${name}`; dl.appendChild(opt);
        });
      }catch{}
    })();

    let redirectOnTY = false;

    form.addEventListener('submit', async (e)=>{
      e.preventDefault();
      submitBtn.disabled=true; submitBtn.textContent='Submitting...'; submitBtn.classList.add('opacity-50','cursor-not-allowed');

      const isStudent = form.role.value==='student';
      const payload = {
        role: form.role.value,
        student_number: isStudent ? 's'+studentNumInput.value.trim() : null,
        username:       !isStudent ? usernameInput.value.trim() : null,
        satisfaction: Number(form.querySelector('input[name="satisfaction"]:checked').value),
        course_number: (document.getElementById('course_number').value||'').trim() || null,
        building_Number: linkToken ? null : selectedBuilding,
        workshop: (form.elements['workshop'] && form.elements['workshop'].value==='yes'),
        token: linkToken || null,
      };

      try{
        const headers = { 'Content-Type':'application/json' };
        if (linkToken) headers['x-token']=linkToken; else headers['x-api-key']=(getSavedKey()[1]||'');
        const resp = await fetch(endpoint, { method:'POST', headers, body: JSON.stringify(payload) });

        if (resp.ok){
          if (linkToken) {
            thankYouModal.classList.remove('hidden');
            redirectOnTY = true;
            setTimeout(()=>{ window.location.replace('https://pythonsupport.dtu.dk/'); }, 7000);
            return;
          }
          thankYouModal.classList.remove('hidden');
          form.reset();
          form.role.value='student'; toggleRole();
          const preferWD = qpWD || (localStorage.getItem('workshopDay')==='true');
          const wy=document.getElementById('workshop_yes'), wn=document.getElementById('workshop_no');
          if (wy && wn) { wy.checked=!!preferWD; wn.checked=!preferWD; }
          studentNumInput.value=''; studentNumInput.focus(); document.activeElement?.blur();
          setTimeout(()=>{ thankYouModal.classList.add('hidden'); }, 3000);
        } else {
          let raw=''; try{
            const ct=(resp.headers.get('Content-Type')||'').toLowerCase();
            if (ct.includes('application/json')) { const j=await resp.json(); raw=j?.message || (typeof j==='string'?j:JSON.stringify(j)); }
            else { const t=await resp.text(); if (t && t.trim().length) raw=t.trim(); }
          }catch{}
          showError(friendlyError(raw, resp.status, !!linkToken), resp.status);
          if (isStudent) studentNumInput.focus(); else usernameInput?.focus();
        }
      }catch(err){
        console.error(err); showError('A network error occurred. Please try again.');
      }finally{
        submitBtn.disabled=false; submitBtn.textContent='Submit Survey'; submitBtn.classList.remove('opacity-50','cursor-not-allowed');
      }
    });

    closeTY.addEventListener('click', ()=>{
      if (redirectOnTY && linkToken) window.location.replace('https://pythonsupport.dtu.dk/');
      else thankYouModal.classList.add('hidden');
    });

    document.getElementById('backToSetupBtn')?.addEventListener('click', showBuildingSelection);
  })();

  // --- Kiosk (tablet) mode (+15% more than previous: scale 1.30)
  (function kiosk(){
    const enter = document.getElementById('kioskEnter');
    const exit  = document.getElementById('kioskExit');
    const KEY   = 'kioskMode';

    function setViewportLock(lock, scale=1.30){
      const vp=document.querySelector('meta[name="viewport"]');
      if(!vp) return;
      vp.setAttribute('content', lock
        ? `width=device-width, initial-scale=${scale}, maximum-scale=${scale}, user-scalable=no`
        : 'width=device-width, initial-scale=1.0');
    }
    function setKiosk(v){
      try{ v ? localStorage.setItem(KEY,'1') : localStorage.removeItem(KEY); }catch{}
      if(v){
        document.body.classList.add('kiosk-mode');
        setViewportLock(true, 1.30);
        try{ if (screen.orientation?.lock) screen.orientation.lock('portrait').catch(()=>{}); }catch{}
        try{ const el=document.documentElement; if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(()=>{}); }catch{}
        try{ history.pushState({k:1},'',location.href); }catch{}
        window.addEventListener('popstate', onPop);
        window.scrollTo(0,0);
      } else {
        document.body.classList.remove('kiosk-mode');
        setViewportLock(false);
        window.removeEventListener('popstate', onPop);
        try{ if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(()=>{}); }catch{}
      }
      syncFabVisibility();
      applySidebarVisibility();
      applyStudentFlowLayout();
    }
    function onPop(){ if (isKiosk()) { try{ history.pushState({k:1},'',location.href); }catch{} } }

    function syncFabVisibility(){
      const onSurvey = !document.getElementById('surveyPage').classList.contains('hidden');
      const active   = isKiosk();
      enter.style.display = (!tokenOrQr && onSurvey && !active) ? '' : 'none';
    }

    function blockScroll(e){ if (isKiosk()) e.preventDefault(); }
    window.addEventListener('touchmove', blockScroll, {passive:false});
    window.addEventListener('wheel', blockScroll, {passive:false});
    document.addEventListener('focusout', ()=>{ if (isKiosk()) setTimeout(()=>window.scrollTo(0,0),50); });
    enter?.addEventListener('click', ()=> setKiosk(true));

    // 5 taps on top-right to exit
    let taps=0, timer=null;
    function reset(){ taps=0; if(timer){ clearTimeout(timer); timer=null; } }
    function tap(){ taps+=1; if(!timer) timer=setTimeout(reset,1500); if(taps>=5){ reset(); setKiosk(false); } }
    exit?.addEventListener('click', tap, {passive:true});
    exit?.addEventListener('touchstart', (e)=>{ e.preventDefault(); tap(); }, {passive:false});

    document.addEventListener('fullscreenchange', ()=>{ if (isKiosk() && !document.fullscreenElement) setKiosk(false); });

    // expose for other funcs
    window.__syncFabVisibility = syncFabVisibility;
    function initialSync(){ syncFabVisibility(); }
    initialSync();
  })();

  // --- initial route
  if (linkToken)            switchToSurvey();
  else if (selectedBuilding===null && !qpBuilding) showBuildingSelection();
  else                       switchToSurvey();

  applySidebarVisibility();
  applyStudentFlowLayout();
  syncBackSelectorVisibility();

  // --- expose show* to other handlers
  function switchToSurvey(){ if (selectedBuilding===null && !tokenOrQr) showBuildingSelection(); else showSurveyForm(); }
}