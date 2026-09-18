// Clicking the toolbar icon opens the side panel. That is the whole background job:
// every read happens in panel.js, which has the same API access an extension page does.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.error("[seo-side-panel] setPanelBehavior", err));
