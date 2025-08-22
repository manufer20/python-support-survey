// Bundled JavaScript - All modules combined for file:// protocol compatibility

// Configuration and constants
const CONFIG = {
  endpoints: {
    survey: "https://python-support-proxy.azurewebsites.net/api/surveyProxy",
    token: "https://python-support-proxy.azurewebsites.net/api/issueToken",
    qrSign: "https://python-support-proxy.azurewebsites.net/api/qrRedirect"
  },
  storage: {
    auth: "surveySupportAuth",
    building: "selectedBuilding",
    workshopDay: "workshopDay"
  },
  urls: {
    pythonSupport: "https://pythonsupport.dtu.dk/"
  },
  timing: {
    thankYouDisplay: 3000,
    redirectDelay: 7000
  }
};

// QR Code settings
const QR_CONFIG = {
  size: 280,
  margin: 2,
  fallbackServices: [
    "https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=",
    "https://chart.googleapis.com/chart?chs=280x280&cht=qr&chl="
  ]
};

// Error handling
function friendlyError(raw, status = 0, usingToken = false) {
  const text = (typeof raw === 'string') ? raw : (raw?.message || '');
  const l = (text || '').toLowerCase();
  let title = "We couldn't submit your response";
  let message = 'Please try again in a moment.';

  const roleNow = (document.querySelector('input[name="role"]:checked')?.value || 'student');
  
  if (l.includes('study number does not exist') || l.includes('student number does not exist')) {
    if (roleNow === 'employee') {
      title = 'DTU username not found';
      message = "We couldn't find that DTU username. Please enter your DTU credentials (letters only, e.g. 'manufer') and try again.";
    } else {
      title = 'Student number not found';
      message = "We couldn't find that student number. Please check the six digits after 's' on your DTU ID (e.g. s123456) and try again.";
    }
  } else if (l.includes('invalid or used token') || l.includes('token expired') || (status === 401 && usingToken) || l.includes('link has expired')) {
    title = "Oops, this link has expired";
    message = 'This one-time link has already been used or expired. Please request a new link from your supporter.';
  } else if (l.includes('unauthorized')) {
    title = 'Not authorised';
    message = 'Your session has expired. Please refresh and try again.';
  } else if (l.includes('triggerinputschemamismatch') || l.includes('invalid type') || l.includes('schema')) {
    title = 'Form not recognised';
    message = 'Some information was in the wrong format. Please refresh the page and try again.';
  } else if (status >= 500) {
    title = 'Service temporarily unavailable';
    message = 'We are experiencing a temporary problem. Please try again in a minute.';
  } else if (status === 429) {
    title = 'Too many attempts';
    message = 'Please wait a moment and try again.';
  } else if (l.includes('could not generate link')) {
    title = 'Could not generate link';
    message = 'Please confirm you are signed in and try again.';
  } else if (l.includes('qr generator failed')) {
    title = 'QR generator unavailable';
    message = 'Network access to the QR service is blocked. Try again or use the copy-link option.';
  } else if (text && text.trim()) {
    try {
      const maybe = JSON.parse(text);
      if (maybe && typeof maybe.message === 'string') {
        message = maybe.message;
      } else {
        message = text;
      }
    } catch { 
      message = text; 
    }
  }
  
  return { title, message };
}

function showError(input, status) {
  const linkToken = new URLSearchParams(window.location.search).get('t') || 
                   new URLSearchParams(window.location.search).get('token');
  const usingToken = !!linkToken;
  
  const { title, message } = (typeof input === 'string')
    ? friendlyError(input, status, usingToken)
    : (input && typeof input === 'object') ? input : friendlyError('', status, usingToken);
    
  const titleEl = document.getElementById('errorTitle');
  if (titleEl) titleEl.textContent = title;
  
  const messageEl = document.querySelector('.error-message');
  if (messageEl) messageEl.textContent = message;

  // For expired/invalid token, closing should redirect
  let redirectOnErrorClose = false;
  const combo = (title + ' ' + message).toLowerCase();
  const isExpiredTokenError = usingToken && (
    combo.includes('link has expired') ||
    combo.includes('invalid or used token') ||
    combo.includes('token expired')
  );
  
  const closeBtn = document.getElementById('closeErrorModal');
  if (closeBtn) {
    if (isExpiredTokenError) {
      redirectOnErrorClose = true;
      closeBtn.textContent = 'Go to Python Support';
    } else {
      closeBtn.textContent = 'Try Again';
    }
    
    closeBtn.onclick = () => {
      document.getElementById('errorModal').classList.add('hidden');
      if (redirectOnErrorClose && linkToken) {
        window.location.replace(CONFIG.urls.pythonSupport);
      }
    };
  }

  document.getElementById('errorModal').classList.remove('hidden');
}

// Authentication Manager
class AuthManager {
  constructor() {
    this.handleReset();
    this.setupLoginHandler();
  }

  handleReset() {
    const params = new URLSearchParams(location.search);
    if (params.get('reset') === '1') {
      try { 
        localStorage.removeItem(CONFIG.storage.auth); 
        localStorage.removeItem(CONFIG.storage.building); 
      } catch {}
      
      params.delete('reset');
      params.delete('t');
      params.delete('token');
      params.delete('b');
      params.delete('wd');
      
      const next = location.pathname + (params.toString() ? `?${params.toString()}` : '');
      location.replace(next);
    }
  }

  getSavedKey() {
    const saved = localStorage.getItem(CONFIG.storage.auth);
    if (!saved) return [null, null];
    return saved.split("|");
  }

  isAuthValid() {
    const [date] = this.getSavedKey();
    const today = new Date().toISOString().slice(0, 10);
    return date === today;
  }

  showLogin() {
    document.getElementById("loginModal").classList.remove("hidden");
    document.getElementById("mainWrapper").classList.add("pointer-events-none", "opacity-40");
  }

  hideLogin() {
    document.getElementById("loginModal").classList.add("hidden");
    document.getElementById("mainWrapper").classList.remove("pointer-events-none", "opacity-40");
  }

  checkAuthStatus() {
    const hasOneTimeToken = new URLSearchParams(window.location.search).get('t') || 
                           new URLSearchParams(window.location.search).get('token');
    
    if (hasOneTimeToken) {
      this.hideLogin();
    } else if (this.isAuthValid()) {
      this.hideLogin();
    } else {
      this.showLogin();
    }
  }

  setupLoginHandler() {
    document.getElementById("codeSubmit").addEventListener("click", async () => {
      const input = document.getElementById("accessCodeInput").value.trim();
      const ok = await fetch(CONFIG.endpoints.survey, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": input },
        body: JSON.stringify({ ping: true })
      }).then(r => r.ok).catch(() => false);

      if (ok) {
        const today = new Date().toISOString().slice(0, 10);
        localStorage.setItem(CONFIG.storage.auth, `${today}|${input}`);
        this.hideLogin();
        document.getElementById("loginError").classList.add("hidden");
        document.getElementById("accessCodeInput").value = "";
      } else {
        document.getElementById("loginError").classList.remove("hidden");
      }
    });
  }

  getApiKey() {
    return this.getSavedKey()[1] || "";
  }
}

// Building Manager
class BuildingManager {
  constructor() {
    this.selectedBuilding = this.loadSelectedBuilding();
    this.setupEventListeners();
  }

  loadSelectedBuilding() {
    const saved = localStorage.getItem(CONFIG.storage.building);
    if (saved) return Number(saved);

    // Check URL parameters
    const urlParams = new URLSearchParams(location.search);
    const qpBuilding = urlParams.get('b');
    if (qpBuilding) {
      const building = Number(qpBuilding);
      localStorage.setItem(CONFIG.storage.building, building);
      return building;
    }

    return null;
  }

  selectBuilding(buildingNumber) {
    this.selectedBuilding = buildingNumber;
    localStorage.setItem(CONFIG.storage.building, buildingNumber);
    this.showSurveyForm();
  }

  selectCustomBuilding() {
    const customInput = document.getElementById('customBuilding');
    const buildingNumber = parseInt(customInput.value);
    
    if (!customInput.value || isNaN(buildingNumber) || buildingNumber <= 100 || buildingNumber >= 500) {
      showError('Please enter a valid building number (101-499).');
      return;
    }
    
    this.selectBuilding(buildingNumber);
  }

  handleEnterKey(event) {
    if (event.key === 'Enter') {
      this.selectCustomBuilding();
    }
  }

  showBuildingSelection() {
    localStorage.removeItem(CONFIG.storage.building);
    this.selectedBuilding = null;
    
    document.getElementById('buildingSelectionPage').classList.remove('hidden');
    document.getElementById('surveyPage').classList.add('hidden');
    document.getElementById('analyticsPage').classList.add('hidden');
    
    // Preserve Workshop Day checkbox state
    const workshopToggle = document.getElementById('workshopDayToggle');
    if (workshopToggle) {
      const isWorkshopDay = localStorage.getItem(CONFIG.storage.workshopDay) === 'true';
      workshopToggle.checked = isWorkshopDay;
    }
  }

  showSurveyForm() {
    document.getElementById('buildingSelectionPage').classList.add('hidden');
    document.getElementById('surveyPage').classList.remove('hidden');
    document.getElementById('analyticsPage').classList.add('hidden');
    
    // Set workshop preference
    const urlParams = new URLSearchParams(location.search);
    const qpWD = urlParams.get('wd') === '1';
    const preferWD = qpWD || (localStorage.getItem(CONFIG.storage.workshopDay) === 'true');
    
    const workshopYes = document.getElementById('workshop_yes');
    const workshopNo = document.getElementById('workshop_no');
    
    if (workshopYes && workshopNo) {
      workshopYes.checked = !!preferWD;
      workshopNo.checked = !preferWD;
    }
  }

  setupEventListeners() {
    // Note: Back tab navigation is now handled in app.js
    
    // Workshop day toggle
    const wdToggle = document.getElementById('workshopDayToggle');
    if (wdToggle) {
      wdToggle.checked = localStorage.getItem(CONFIG.storage.workshopDay) === 'true';
      wdToggle.addEventListener('change', () => {
        localStorage.setItem(CONFIG.storage.workshopDay, String(wdToggle.checked));
      });
    }

    // Make methods available globally
    window.selectBuilding = (buildingNumber) => this.selectBuilding(buildingNumber);
    window.selectCustomBuilding = () => this.selectCustomBuilding();
    window.handleEnterKey = (event) => this.handleEnterKey(event);
    window.showBuildingSelection = () => this.showBuildingSelection();
  }

  getSelectedBuilding() {
    return this.selectedBuilding;
  }
}

// Survey Manager  
class SurveyManager {
  constructor(authManager, buildingManager) {
    this.authManager = authManager;
    this.buildingManager = buildingManager;
    this.setupForm();
    this.loadCourseData();
  }

  setupForm() {
    const form = document.getElementById("surveyForm");
    const roleInputs = form.querySelectorAll('input[name="role"]');
    const studentNumInput = document.getElementById('student_number');
    
    // Role switching
    roleInputs.forEach(radio => radio.addEventListener('change', () => this.toggleRole()));
    
    // Student number validation
    if (studentNumInput) {
      studentNumInput.addEventListener('input', () => {
        studentNumInput.setCustomValidity('');
      });
      studentNumInput.addEventListener('blur', () => this.setStudentCustomValidation());
      studentNumInput.addEventListener('invalid', () => this.setStudentCustomValidation());
    }
    
    // Form submission
    form.addEventListener("submit", (e) => this.handleSubmit(e));
    
    // Thank you modal close
    document.getElementById("closeModal").addEventListener('click', () => {
      this.handleThankYouClose();
    });
    
    this.toggleRole();
  }

  toggleRole() {
    const form = document.getElementById("surveyForm");
    const studentWrapper = document.getElementById('studentWrapper');
    const usernameWrapper = document.getElementById('usernameWrapper');
    
    const isStudent = form.role.value === 'student';
    studentWrapper.classList.toggle('hidden', !isStudent);
    usernameWrapper.classList.toggle('hidden', isStudent);
    form.student_number.required = isStudent;
    form.dtu_username.required = !isStudent;
    
    this.setStudentCustomValidation();
  }

  setStudentCustomValidation() {
    const form = document.getElementById("surveyForm");
    const studentNumInput = document.getElementById('student_number');
    const isStudent = (form.role.value === 'student');
    
    if (!isStudent) {
      studentNumInput.setCustomValidity('');
      return;
    }
    
    const v = (studentNumInput.value || '').trim();
    if (!v) {
      studentNumInput.setCustomValidity("Please enter your student number: type the 6 digits after 's' (e.g. s123456).");
    } else if (!/^\d{6}$/.test(v)) {
      studentNumInput.setCustomValidity("Format: exactly 6 digits. Example: s123456. Don't type the 's'—it's already filled in.");
    } else {
      studentNumInput.setCustomValidity('');
    }
  }

  async loadCourseData() {
    try {
      const res = await fetch('./data/courses.csv');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      const csv = await res.text();
      const lines = csv.split('\n');
      const records = [];
      let buffer = '';
      let inQuotes = false;
      
      lines.forEach(line => {
        const quoteCount = (line.match(/"/g) || []).length;
        if (!inQuotes) {
          buffer = line;
          if (quoteCount % 2 !== 0) {
            inQuotes = true;
          } else {
            records.push(buffer);
          }
        } else {
          buffer += '\n' + line;
          if (quoteCount % 2 !== 0) {
            inQuotes = false;
            records.push(buffer);
          }
        }
      });
      
      records.shift(); // Remove header
      const dl = document.getElementById('courses');
      
      records.forEach(record => {
        const idx = record.indexOf(',');
        const code = record.slice(0, idx).trim();
        let rawName = record.slice(idx + 1)
          .replace(/\r/g, '')
          .replace(/CR$/, '')
          .replace(/^"+|"+$/g, '')
          .trim();
        
        const opt = document.createElement('option');
        opt.value = `${code} - ${rawName}`;
        dl.appendChild(opt);
      });
    } catch (err) {
      console.error('Error loading courses.csv:', err);
    }
  }

  getLinkToken() {
    const urlParams = new URLSearchParams(location.search);
    return urlParams.get('t') || urlParams.get('token');
  }

  async handleSubmit(e) {
    e.preventDefault();
    
    const form = document.getElementById("surveyForm");
    const submitButton = document.getElementById("submitButton");
    
    submitButton.disabled = true;
    submitButton.textContent = 'Submitting...';
    submitButton.classList.add('opacity-50', 'cursor-not-allowed');
    
    const isStudent = form.role.value === 'student';
    const linkToken = this.getLinkToken();
    
    const payload = {
      role: form.role.value,
      student_number: isStudent ? 's' + form.student_number.value.trim() : null,
      username: !isStudent ? form.dtu_username.value.trim() : null,
      satisfaction: Number(form.querySelector('input[name="satisfaction"]:checked').value),
      course_number: form.course_number.value.trim() || null,
      building_Number: this.buildingManager.getSelectedBuilding(),
      workshop: (form.elements['workshop'] && form.elements['workshop'].value === 'yes'),
      token: linkToken || null,
    };

    try {
      const headers = { "Content-Type": "application/json" };
      if (linkToken) {
        headers["x-token"] = linkToken;
      } else {
        headers["x-api-key"] = this.authManager.getApiKey();
      }
      
      const response = await fetch(CONFIG.endpoints.survey, {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      });
      
      if (response.ok) {
        this.handleSuccessfulSubmission(linkToken);
      } else {
        await this.handleSubmissionError(response, linkToken);
      }
    } catch (err) {
      console.error("Background submit failed:", err);
      showError('A network error occurred. Please check your connection and try again.');
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'Submit Survey';
      submitButton.classList.remove('opacity-50', 'cursor-not-allowed');
    }
  }

  handleSuccessfulSubmission(linkToken) {
    const thankYouModal = document.getElementById("thankYouModal");
    
    if (linkToken) {
      thankYouModal.classList.remove('hidden');
      this.redirectOnThankYouClose = true;
      setTimeout(() => {
        window.location.replace(CONFIG.urls.pythonSupport);
      }, CONFIG.timing.redirectDelay);
      return;
    }
    
    thankYouModal.classList.remove('hidden');
    this.resetForm();
    setTimeout(() => {
      thankYouModal.classList.add('hidden');
    }, CONFIG.timing.thankYouDisplay);
  }

  async handleSubmissionError(response, linkToken) {
    let raw = '';
    try {
      const ct = (response.headers.get('Content-Type') || '').toLowerCase();
      if (ct.includes('application/json')) {
        const j = await response.json();
        raw = j?.message || (typeof j === 'string' ? j : JSON.stringify(j));
      } else {
        const t = await response.text();
        if (t && t.trim().length) raw = t.trim();
      }
    } catch {}
    
    showError(friendlyError(raw, response.status, !!linkToken), response.status);
  }

  resetForm() {
    const form = document.getElementById("surveyForm");
    form.reset();
    form.role.value = 'student';
    this.toggleRole();
    
    const urlParams = new URLSearchParams(location.search);
    const qpWD = urlParams.get('wd') === '1';
    const preferWD = qpWD || (localStorage.getItem(CONFIG.storage.workshopDay) === 'true');
    
    const workshopYes = document.getElementById('workshop_yes');
    const workshopNo = document.getElementById('workshop_no');
    
    if (workshopYes && workshopNo) {
      workshopYes.checked = !!preferWD;
      workshopNo.checked = !preferWD;
    }
    
    document.getElementById('student_number').value = '';
    document.getElementById('student_number').focus();
  }

  handleThankYouClose() {
    const linkToken = this.getLinkToken();
    if (this.redirectOnThankYouClose && linkToken) {
      window.location.replace(CONFIG.urls.pythonSupport);
    } else {
      document.getElementById("thankYouModal").classList.add('hidden');
    }
  }
}

// Kiosk/Tablet Lock Mode Manager
class KioskManager {
  constructor() {
    this.isKioskMode = false;
    this.setupKioskMode();
  }

  setupKioskMode() {
    // Check for kiosk mode URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    const kioskMode = urlParams.get('kiosk') === '1' || urlParams.get('tablet') === '1';
    
    if (kioskMode) {
      this.enableKioskMode();
    }

    // Add kiosk toggle for testing (remove in production)
    this.addKioskToggle();
  }

  async enableKioskMode() {
    this.isKioskMode = true;
    document.body.classList.add('kiosk-mode');
    
    // Request fullscreen
    await this.requestFullscreen();
    
    // Disable context menu
    this.disableContextMenu();
    
    // Disable text selection
    this.disableTextSelection();
    
    // Disable keyboard shortcuts
    this.disableKeyboardShortcuts();
    
    // Hide navigation elements
    this.hideNavigationElements();
    
    // Lock orientation (if supported)
    this.lockOrientation();
    
    // Prevent page unload
    this.preventPageUnload();
    
    // Setup hidden exit mechanism
    this.setupHiddenExit();
    
    console.log('Kiosk mode enabled');
  }

  disableKioskMode() {
    this.isKioskMode = false;
    document.body.classList.remove('kiosk-mode');
    
    // Exit fullscreen
    if (document.fullscreenElement) {
      document.exitFullscreen();
    }
    
    // Re-enable interactions
    document.removeEventListener('contextmenu', this.preventEvent);
    document.removeEventListener('selectstart', this.preventEvent);
    document.removeEventListener('dragstart', this.preventEvent);
    document.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('beforeunload', this.preventUnload);
    
    // Clean up hidden exit elements
    if (this.exitCornerZone) {
      this.exitCornerZone.remove();
      this.exitCornerZone = null;
    }
    const exitBtn = document.getElementById('kioskExitBtn');
    if (exitBtn) {
      exitBtn.remove();
    }
    
    // Show navigation elements
    this.showNavigationElements();
    
    console.log('Kiosk mode disabled');
  }

  async requestFullscreen() {
    const element = document.documentElement;
    
    try {
      if (element.requestFullscreen) {
        await element.requestFullscreen();
        console.log('Fullscreen activated via requestFullscreen');
      } else if (element.webkitRequestFullscreen) {
        await element.webkitRequestFullscreen();
        console.log('Fullscreen activated via webkitRequestFullscreen');
      } else if (element.msRequestFullscreen) {
        await element.msRequestFullscreen();
        console.log('Fullscreen activated via msRequestFullscreen');
      } else {
        console.warn('Fullscreen API not supported by this browser');
      }
    } catch (error) {
      console.error('Fullscreen request failed:', error);
      
      // Show user-friendly message if fullscreen fails
      if (error.name === 'NotAllowedError') {
        console.warn('Fullscreen was denied by user or browser policy');
        this.showFullscreenMessage();
      } else {
        console.warn('Fullscreen request failed with error:', error.message);
      }
    }
  }

  showFullscreenMessage() {
    const message = document.createElement('div');
    message.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #3b82f6;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      z-index: 10000;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      max-width: 300px;
    `;
    message.textContent = 'For the best tablet experience, allow fullscreen when prompted or press F11';
    
    document.body.appendChild(message);
    
    // Remove message after 5 seconds
    setTimeout(() => {
      if (message.parentNode) {
        message.remove();
      }
    }, 5000);
  }

  disableContextMenu() {
    this.preventEvent = (e) => {
      e.preventDefault();
      return false;
    };
    
    document.addEventListener('contextmenu', this.preventEvent);
  }

  disableTextSelection() {
    document.addEventListener('selectstart', this.preventEvent);
    document.addEventListener('dragstart', this.preventEvent);
  }

  disableKeyboardShortcuts() {
    this.handleKeyDown = (e) => {
      // Secret exit combination: Ctrl+Shift+Alt+E
      if (e.ctrlKey && e.shiftKey && e.altKey && (e.key === 'e' || e.key === 'E')) {
        this.disableKioskMode();
        return;
      }
      
      // Disable common shortcuts
      if (
        e.key === 'F5' || 
        e.key === 'F11' ||
        e.key === 'F12' ||
        (e.ctrlKey && (e.key === 'r' || e.key === 'R')) || // Ctrl+R (refresh)
        (e.ctrlKey && (e.key === 'w' || e.key === 'W')) || // Ctrl+W (close)
        (e.ctrlKey && (e.key === 't' || e.key === 'T')) || // Ctrl+T (new tab)
        (e.ctrlKey && e.shiftKey && (e.key === 'i' || e.key === 'I')) || // Ctrl+Shift+I (dev tools)
        (e.altKey && e.key === 'F4') || // Alt+F4
        e.key === 'Escape'
      ) {
        e.preventDefault();
        return false;
      }
    };
    
    document.addEventListener('keydown', this.handleKeyDown);
  }

  hideNavigationElements() {
    // Hide header navigation in kiosk mode
    const header = document.querySelector('header');
    if (header) {
      header.classList.add('hidden');
    }
    
    // Hide sidebar permanently
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
      sidebar.style.display = 'none';
    }
  }

  showNavigationElements() {
    const header = document.querySelector('header');
    if (header) {
      header.classList.remove('hidden');
    }
    
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
      sidebar.style.display = '';
    }
  }

  lockOrientation() {
    // Lock to portrait mode for tablets
    if (screen.orientation && screen.orientation.lock) {
      screen.orientation.lock('portrait').catch(err => {
        console.log('Orientation lock not supported:', err);
      });
    }
  }

  preventPageUnload() {
    this.preventUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    
    window.addEventListener('beforeunload', this.preventUnload);
  }

  addKioskToggle() {
    // Create floating toggle button for testing
    const toggle = document.createElement('button');
    toggle.innerHTML = 'Enter Tablet Mode';
    toggle.className = 'fixed bottom-4 right-4 bg-gray-800 text-white rounded-lg shadow-lg hover:bg-gray-700 transition-colors z-50 text-sm px-4 py-2 kiosk-hide';
    toggle.title = 'Enter Tablet Mode';
    toggle.id = 'kioskToggle';
    
    toggle.addEventListener('click', async () => {
      if (this.isKioskMode) {
        this.disableKioskMode();
        toggle.innerHTML = 'Enter Tablet Mode';
        toggle.title = 'Enter Tablet Mode';
      } else {
        await this.enableKioskMode();
        toggle.innerHTML = 'Exit Tablet Mode';
        toggle.title = 'Exit Tablet Mode';
      }
    });
    
    document.body.appendChild(toggle);
    
    // Update button visibility based on current page
    this.updateKioskToggleVisibility();
    
    // Listen for page changes to show/hide toggle
    this.setupPageChangeListeners();
  }

  updateKioskToggleVisibility() {
    const toggle = document.getElementById('kioskToggle');
    if (!toggle) return;
    
    // Show only when survey form is visible
    const surveyPage = document.getElementById('surveyPage');
    const buildingSelectionPage = document.getElementById('buildingSelectionPage');
    
    const isSurveyVisible = surveyPage && !surveyPage.classList.contains('hidden');
    const isBuildingSelectionVisible = buildingSelectionPage && !buildingSelectionPage.classList.contains('hidden');
    
    if (isSurveyVisible && !isBuildingSelectionVisible) {
      toggle.style.display = 'block';
    } else {
      toggle.style.display = 'none';
    }
  }

  setupPageChangeListeners() {
    // Use MutationObserver to watch for page visibility changes
    const observer = new MutationObserver(() => {
      this.updateKioskToggleVisibility();
    });
    
    const surveyPage = document.getElementById('surveyPage');
    const buildingSelectionPage = document.getElementById('buildingSelectionPage');
    
    if (surveyPage) {
      observer.observe(surveyPage, { attributes: true, attributeFilter: ['class'] });
    }
    
    if (buildingSelectionPage) {
      observer.observe(buildingSelectionPage, { attributes: true, attributeFilter: ['class'] });
    }
  }

  setupHiddenExit() {
    // Create invisible corner tap zone
    this.exitTapCount = 0;
    this.exitTapTimer = null;
    
    const cornerZone = document.createElement('div');
    cornerZone.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 50px;
      height: 50px;
      background: transparent;
      z-index: 9998;
      cursor: default;
    `;
    
    cornerZone.addEventListener('click', () => {
      this.exitTapCount++;
      
      // Clear previous timer
      if (this.exitTapTimer) {
        clearTimeout(this.exitTapTimer);
      }
      
      // If 5 taps within 3 seconds, show exit button
      if (this.exitTapCount >= 5) {
        this.showExitButton();
        this.exitTapCount = 0;
      } else {
        // Reset count after 3 seconds
        this.exitTapTimer = setTimeout(() => {
          this.exitTapCount = 0;
        }, 3000);
      }
    });
    
    document.body.appendChild(cornerZone);
    this.exitCornerZone = cornerZone;
  }
  
  showExitButton() {
    // Remove existing exit button if any
    const existingBtn = document.getElementById('kioskExitBtn');
    if (existingBtn) {
      existingBtn.remove();
    }
    
    // Create temporary exit button
    const exitBtn = document.createElement('button');
    exitBtn.id = 'kioskExitBtn';
    exitBtn.innerHTML = '✕ Exit Kiosk';
    exitBtn.style.cssText = `
      position: fixed;
      top: 20px;
      left: 20px;
      background: #dc2626;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 5px;
      font-size: 14px;
      z-index: 9999;
      cursor: pointer;
      box-shadow: 0 4px 8px rgba(0,0,0,0.3);
    `;
    
    exitBtn.addEventListener('click', () => {
      this.disableKioskMode();
    });
    
    document.body.appendChild(exitBtn);
    
    // Auto-hide after 10 seconds
    setTimeout(() => {
      if (exitBtn && exitBtn.parentNode) {
        exitBtn.remove();
      }
    }, 10000);
  }

  isKioskModeActive() {
    return this.isKioskMode;
  }
}

// Main Application
class SurveyApp {
  constructor() {
    this.init();
  }

  init() {
    // Initialize all managers
    this.authManager = new AuthManager();
    this.buildingManager = new BuildingManager();
    this.surveyManager = new SurveyManager(this.authManager, this.buildingManager);
    this.kioskManager = new KioskManager();
    
    // Setup sidebar
    this.setupSidebar();
    
    // Initialize the application state
    this.initializeAppState();
  }

  setupSidebar() {
    const openSidebarBtn = document.getElementById('openSidebar');
    const closeSidebarBtn = document.getElementById('closeSidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const sidebar = document.getElementById('sidebar');

    const openSidebar = () => {
      sidebar.classList.add('sidebar-open');
      sidebarOverlay.classList.remove('hidden');
    };

    const closeSidebar = () => {
      sidebar.classList.remove('sidebar-open');
      sidebarOverlay.classList.add('hidden');
    };

    if (openSidebarBtn) openSidebarBtn.addEventListener('click', openSidebar);
    if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', closeSidebar);
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);

    // Tab navigation
    document.getElementById('surveyTab')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.showSurveySection();
      closeSidebar();
    });

    document.getElementById('analyticsTab')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.showAnalyticsSection();
      closeSidebar();
    });

    document.getElementById('logoutTab')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.logout();
      closeSidebar();
    });

    // Back to Setup button on survey form
    document.getElementById('backToSetupBtn')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.showBuildingSelection();
    });
  }

  showSurveySection() {
    // Show building selection or survey form based on current state
    const selectedBuilding = this.buildingManager.getSelectedBuilding();
    if (selectedBuilding === null) {
      document.getElementById('buildingSelectionPage')?.classList.remove('hidden');
      document.getElementById('surveyPage')?.classList.add('hidden');
    } else {
      document.getElementById('buildingSelectionPage')?.classList.add('hidden');
      document.getElementById('surveyPage')?.classList.remove('hidden');
    }
    document.getElementById('analyticsPage')?.classList.add('hidden');
    
    // Update active tab
    document.querySelectorAll('.sidebar-nav-item').forEach(item => {
      item.classList.remove('active');
    });
    document.getElementById('surveyTab')?.classList.add('active');
  }

  showAnalyticsSection() {
    document.getElementById('buildingSelectionPage')?.classList.add('hidden');
    document.getElementById('surveyPage')?.classList.add('hidden');
    document.getElementById('analyticsPage')?.classList.remove('hidden');
    
    // Update active tab
    document.querySelectorAll('.sidebar-nav-item').forEach(item => {
      item.classList.remove('active');
    });
    document.getElementById('analyticsTab')?.classList.add('active');
  }

  showBuildingSelection() {
    // Go back to building selection, preserving workshop day setting
    this.buildingManager.showBuildingSelection();
    
    // Update active tab to Survey (since building selection is part of survey flow)
    document.querySelectorAll('.sidebar-nav-item').forEach(item => {
      item.classList.remove('active');
    });
    document.getElementById('surveyTab')?.classList.add('active');
  }

  initializeAppState() {
    // Check authentication status
    this.authManager.checkAuthStatus();
    
    // Determine initial page to show
    const linkToken = new URLSearchParams(window.location.search).get('t') || 
                     new URLSearchParams(window.location.search).get('token');
    
    if (linkToken) {
      this.buildingManager.showSurveyForm();
      this.surveyManager.verifyOneTimeToken();
    } else {
      // Always start with building selection for regular visitors
      // This ensures fresh users always see the building selection first
      this.buildingManager.showBuildingSelection();
    }
  }

  logout() {
    // Clear authentication from localStorage
    localStorage.removeItem('surveySupportAuth');
    localStorage.removeItem('selectedBuilding');
    localStorage.removeItem('workshopDay');
    
    // Show login modal
    this.authManager.showLogin();
    
    // Return to building selection
    this.showBuildingSelection();
  }
}

// Initialize the application when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new SurveyApp();
});