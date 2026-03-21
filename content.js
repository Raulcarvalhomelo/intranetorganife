// Browser compatibility layer
const browserAPI = (typeof browser !== 'undefined' ? browser : chrome);

// Track mouse clicks with browser compatibility
document.addEventListener('click', (e) => {
  const path = e.composedPath ? e.composedPath() : getEventPath(e);
  const clickedElements = path.map(element => {
    return {
      tagName: element.tagName,
      id: element.id,
      className: element.className,
      href: element instanceof HTMLAnchorElement ? element.href : null
    };
  }).filter(Boolean);

  browserAPI.runtime.sendMessage({
    type: 'logActivity',
    action: 'click',
    details: {
      path: clickedElements,
      url: window.location.href,
      timestamp: new Date().toISOString()
    }
  });
});

// Fallback for browsers that don't support composedPath
function getEventPath(event) {
  const path = [];
  let node = event.target;
  
  while (node != document.body && node != null) {
    path.push(node);
    node = node.parentNode;
  }
  
  return path;
}

// Track form submissions
document.addEventListener('submit', (e) => {
  browserAPI.runtime.sendMessage({
    type: 'logActivity',
    action: 'form_submit',
    details: {
      formId: e.target.id,
      formAction: e.target.action,
      url: window.location.href,
      timestamp: new Date().toISOString()
    }
  });
});