const activeTabs = new Set();

const THEME_KEY = "theme";
const DEFAULT_BADGE = "#d97757"; // terracotta-dark's accent

// The content script's injection lists are duplicated here for tabs that were
// already open when the extension was installed or reloaded — chrome.scripting
// is the only way to reach those. Keep both in step with manifest.json's
// content_scripts entry, tokens.css first so it wins the cascade order.
const INJECT_JS = ["lib/html2canvas.min.js", "content.js"];
const INJECT_CSS = ["tokens.css", "content.css"];

// The badge is browser chrome, not page chrome, so it can't read tokens.css.
// These mirror --ccp-accent from each theme block; a theme missing from here
// falls back to the default rather than showing no badge colour.
const BADGE_ACCENT = {
  "terracotta-dark": "#d97757",
  "terracotta-light": "#a94f30",
  dracula: "#bd93f9",
  monokai: "#f92672",
  nord: "#88c0d0",
  "solarized-dark": "#e5762f",
  "tokyo-night": "#bb9af7",
};

async function badgeColor() {
  try {
    const stored = await chrome.storage.local.get(THEME_KEY);
    let theme = stored[THEME_KEY] || "terracotta-dark";
    // "system" has no palette; both terracotta blocks share an accent family, so
    // the dark one's accent is the right badge in either resolution.
    if (theme === "system") theme = "terracotta-dark";
    return BADGE_ACCENT[theme] || DEFAULT_BADGE;
  } catch {
    return DEFAULT_BADGE;
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  const isActive = activeTabs.has(tab.id);

  if (isActive) {
    activeTabs.delete(tab.id);
  } else {
    activeTabs.add(tab.id);
  }

  const nowActive = !isActive;

  chrome.action.setBadgeText({ tabId: tab.id, text: nowActive ? "ON" : "" });
  chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: await badgeColor() });

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
        files: INJECT_JS,
      });
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: INJECT_CSS,
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

  // The gear in the page can't open the options page itself —
  // chrome.runtime.openOptionsPage() is not exposed to content scripts.
  if (msg.type === "OPEN_SETTINGS") {
    chrome.runtime.openOptionsPage();
  }
});

// Repaint every active tab's badge when the theme changes, so the badge doesn't
// keep advertising the previous accent until the next toggle.
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local" || !changes[THEME_KEY]) return;
  const color = await badgeColor();
  for (const tabId of activeTabs) {
    chrome.action.setBadgeBackgroundColor({ tabId, color }).catch(() => {});
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  activeTabs.delete(tabId);
});
