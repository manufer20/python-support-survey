// Kiosk/Tablet Lock Mode Module
export class KioskManager {
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

  enableKioskMode() {
    this.isKioskMode = true;
    document.body.classList.add('kiosk-mode');
    
    // Request fullscreen
    this.requestFullscreen();
    
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

  requestFullscreen() {
    const element = document.documentElement;
    if (element.requestFullscreen) {
      element.requestFullscreen();
    } else if (element.webkitRequestFullscreen) {
      element.webkitRequestFullscreen();
    } else if (element.msRequestFullscreen) {
      element.msRequestFullscreen();
    }
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
    
    // Hide any back buttons or navigation
    const navElements = document.querySelectorAll('[data-nav]');
    navElements.forEach(el => el.classList.add('hidden'));
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
    
    const navElements = document.querySelectorAll('[data-nav]');
    navElements.forEach(el => el.classList.remove('hidden'));
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
    
    toggle.addEventListener('click', () => {
      if (this.isKioskMode) {
        this.disableKioskMode();
        toggle.innerHTML = 'Enter Tablet Mode';
        toggle.title = 'Enter Tablet Mode';
      } else {
        this.enableKioskMode();
        toggle.innerHTML = 'Exit Tablet Mode';
        toggle.title = 'Exit Tablet Mode';
      }
    });
    
    document.body.appendChild(toggle);
  }

  // Auto-return to survey after timeout
  setupAutoReturn() {
    let timeoutId;
    const returnTimeout = 300000; // 5 minutes
    
    const resetTimeout = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        // Return to building selection
        window.showBuildingSelection();
      }, returnTimeout);
    };
    
    // Reset timeout on any user interaction
    ['click', 'touch', 'keypress'].forEach(event => {
      document.addEventListener(event, resetTimeout);
    });
    
    resetTimeout();
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