const activeTabs = new Set();

chrome.action.onClicked.addListener(async (tab) => {
  const isActive = activeTabs.has(tab.id);

  if (isActive) {
    activeTabs.delete(tab.id);
  } else {
    activeTabs.add(tab.id);
  }

  const nowActive = !isActive;

  chrome.action.setBadgeText({ tabId: tab.id, text: nowActive ? "ON" : "" });
  chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: "#d97757" });

  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: "TOGGLE_PROBE",
      active: nowActive,
    });
  } catch {
    // Content script not yet injected — inject it first
    if (nowActive) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["lib/html2canvas.min.js", "content.js"],
      });
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ["content.css"],
      });
      await chrome.tabs.sendMessage(tab.id, {
        type: "TOGGLE_PROBE",
        active: true,
      });
    }
  }
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "DEACTIVATE" && sender.tab) {
    activeTabs.delete(sender.tab.id);
    chrome.action.setBadgeText({ tabId: sender.tab.id, text: "" });
  }

  if (msg.type === "CAPTURE_TAB" && sender.tab) {
    chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: "png" })
      .then((dataUrl) => sendResponse({ dataUrl }))
      .catch((err) => sendResponse({ error: err.message }));
    return true; // keep message channel open for async response
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  activeTabs.delete(tabId);
});
