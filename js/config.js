// Configuration and constants
export const CONFIG = {
  endpoints: {
    survey: "https://python-support-proxy.azurewebsites.net/api/surveyProxy", // Update this URL for new SharePoint list
    token: "https://python-support-proxy.azurewebsites.net/api/issueToken",
    qrSign: "https://python-support-proxy.azurewebsites.net/api/qrRedirect"
  },
  // SharePoint configuration (if using direct integration)
  sharepoint: {
    siteUrl: "", // Your SharePoint site URL
    listName: "", // Your SharePoint list name
    tenantId: "", // Your Azure tenant ID
    clientId: "", // App registration client ID
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
export const QR_CONFIG = {
  size: 280,
  margin: 2,
  fallbackServices: [
    "https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=",
    "https://chart.googleapis.com/chart?chs=280x280&cht=qr&chl="
  ]
};