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

// Handle deactivation from content script (Escape key)
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === "DEACTIVATE" && sender.tab) {
    activeTabs.delete(sender.tab.id);
    chrome.action.setBadgeText({ tabId: sender.tab.id, text: "" });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  activeTabs.delete(tabId);
});
