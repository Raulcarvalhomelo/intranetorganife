// Browser compatibility layer
const browserAPI = (typeof browser !== 'undefined' ? browser : chrome);

// Prevent access to extension settings
document.addEventListener('DOMContentLoaded', () => {
  // Edge-specific code to prevent warnings
  if (navigator.userAgent.includes('Edg/')) {
    browserAPI.storage.local.set({ 
      edgeWarningDismissed: true,
      extensionTrusted: true 
    });
  }
});