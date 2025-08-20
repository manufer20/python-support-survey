// Building selection module
import { CONFIG } from './config.js';
import { showError } from './errors.js';

export class BuildingManager {
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
    document.getElementById('buildingSelectionPage').classList.remove('hidden');
    document.getElementById('surveyPage').classList.add('hidden');
    document.getElementById('analyticsPage').classList.add('hidden');
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
    // Reset tab
    const resetTab = document.getElementById('resetTab');
    if (resetTab) {
      resetTab.addEventListener('click', (e) => {
        e.preventDefault();
        const url = new URL(location.href);
        url.searchParams.set('reset', '1');
        url.hash = '';
        location.href = url.pathname + '?' + url.searchParams.toString();
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