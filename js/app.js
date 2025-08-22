// Main application module
import { AuthManager } from './auth.js';
import { BuildingManager } from './building.js';
import { SurveyManager } from './survey.js';
import { QRManager } from './qr.js';
import { LinkManager } from './links.js';
import { KioskManager } from './kiosk.js';

class SurveyApp {
  constructor() {
    this.init();
  }

  init() {
    // Initialize all managers
    this.authManager = new AuthManager();
    this.buildingManager = new BuildingManager();
    this.surveyManager = new SurveyManager(this.authManager, this.buildingManager);
    this.qrManager = new QRManager(this.authManager, this.buildingManager);
    this.linkManager = new LinkManager(this.authManager, this.buildingManager);
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
      sidebar.classList.add('open');
      sidebarOverlay.classList.remove('hidden');
    };

    const closeSidebar = () => {
      sidebar.classList.remove('open');
      sidebarOverlay.classList.add('hidden');
    };

    if (openSidebarBtn) openSidebarBtn.addEventListener('click', openSidebar);
    if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', closeSidebar);
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);

    // Tab navigation
    document.getElementById('surveyTab')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.showSurveySection();
    });

    document.getElementById('analyticsTab')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.showAnalyticsSection();
    });

    document.getElementById('logoutTab')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.logout();
    });

    // Back to Setup button on survey form
    document.getElementById('backToSetupBtn')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.showBuildingSelection();
    });
  }

  showSurveySection() {
    // Show building selection if no building selected, otherwise show survey form
    const selectedBuilding = this.buildingManager.getSelectedBuilding();
    if (selectedBuilding === null) {
      this.showBuildingSelection();
    } else {
      document.getElementById('buildingSelectionPage')?.classList.add('hidden');
      document.getElementById('surveyPage')?.classList.remove('hidden');
      document.getElementById('analyticsPage')?.classList.add('hidden');
    }
    
    // Update active tab
    document.querySelectorAll('.sidebar-nav-item').forEach(item => {
      item.classList.remove('active');
    });
    document.getElementById('surveyTab')?.classList.add('active');
  }

  showBuildingSelection() {
    // Clear selected building and show building selection
    document.getElementById('buildingSelectionPage')?.classList.remove('hidden');
    document.getElementById('surveyPage')?.classList.add('hidden');
    document.getElementById('analyticsPage')?.classList.add('hidden');
    
    // Update active tab to Survey (since building selection is part of survey flow)
    document.querySelectorAll('.sidebar-nav-item').forEach(item => {
      item.classList.remove('active');
    });
    document.getElementById('surveyTab')?.classList.add('active');
    
    // Preserve workshop day setting but clear building selection
    // Note: We don't clear localStorage selectedBuilding here to allow users to go back
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