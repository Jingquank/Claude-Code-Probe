"use strict";

// Settings page. One setting: the theme.
//
// The roster carries no colours — each pill's swatch is stamped with its own
// data-ccp-theme and styled through the --ccp-* tokens, so the palette on screen
// is literally the palette that gets applied. Adding a theme means one block in
// tokens.css and one line here.

const THEMES = [
  { id: "terracotta-dark", name: "Terracotta Dark" },
  { id: "terracotta-light", name: "Terracotta Light" },
  { id: "system", name: "System" },
  { id: "dracula", name: "Dracula" },
  { id: "monokai", name: "Monokai" },
  { id: "nord", name: "Nord" },
  { id: "solarized-dark", name: "Solarized Dark" },
  { id: "tokyo-night", name: "Tokyo Night" },
];

const THEME_KEY = "theme";
const DEFAULT_THEME = "terracotta-dark";

// Storage is only there when this page is loaded as the extension's options
// page. Opened directly from disk it still renders and previews — it just can't
// persist — which is what makes the page inspectable outside the extension.
const store = {
  available: typeof chrome !== "undefined" && !!chrome.storage?.local,
  get(key, cb) {
    if (!this.available) return cb({});
    chrome.storage.local.get(key, cb);
  },
  set(obj) {
    if (this.available) chrome.storage.local.set(obj);
  },
  onChange(cb) {
    if (this.available) chrome.storage.onChanged.addListener(cb);
  },
};

const pillHost = document.getElementById("theme-pills");
const savedNote = document.getElementById("saved-note");
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

let current = DEFAULT_THEME;
let savedTimer = null;

// Same resolution the content script does, so the preview matches what the page
// will actually render.
function resolveTheme(pref) {
  if (pref !== "system") return pref;
  return darkQuery.matches ? "terracotta-dark" : "terracotta-light";
}

function swatchMarkup(id) {
  if (id === "system") {
    return (
      '<span class="sp-sw sp-sw-split" aria-hidden="true">' +
      '<span data-ccp-theme="terracotta-dark"><i></i><i></i></span>' +
      '<span data-ccp-theme="terracotta-light"><i></i><i></i></span>' +
      "</span>"
    );
  }
  return (
    `<span class="sp-sw" data-ccp-theme="${id}" aria-hidden="true">` +
    "<i></i><i></i><i></i><i></i></span>"
  );
}

function renderPills() {
  pillHost.innerHTML = THEMES.map(
    (t) =>
      `<button type="button" class="sp-pill" role="radio" data-theme="${t.id}" ` +
      `aria-checked="false">${swatchMarkup(t.id)}<span>${t.name}</span></button>`
  ).join("");
}

function paint() {
  document.documentElement.dataset.ccpTheme = resolveTheme(current);
  for (const pill of pillHost.querySelectorAll(".sp-pill")) {
    const on = pill.dataset.theme === current;
    pill.setAttribute("aria-checked", String(on));
    // Only the selected pill is a tab stop, which is how a radiogroup should
    // behave — arrow keys move between options, Tab leaves the group.
    pill.tabIndex = on ? 0 : -1;
  }
}

function announce(name) {
  savedNote.textContent = `Saved — ${name}`;
  if (savedTimer) clearTimeout(savedTimer);
  savedTimer = setTimeout(() => {
    savedNote.textContent = "";
  }, 2400);
}

function select(id) {
  if (!THEMES.some((t) => t.id === id)) return;
  current = id;
  paint();
  store.set({ [THEME_KEY]: id });
  announce(THEMES.find((t) => t.id === id).name);
}

renderPills();

pillHost.addEventListener("click", (e) => {
  const pill = e.target.closest(".sp-pill");
  if (pill) select(pill.dataset.theme);
});

// Arrow-key navigation, per the radiogroup pattern.
pillHost.addEventListener("keydown", (e) => {
  const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"];
  if (!keys.includes(e.key)) return;
  e.preventDefault();
  const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
  const i = THEMES.findIndex((t) => t.id === current);
  const next = THEMES[(i + step + THEMES.length) % THEMES.length].id;
  select(next);
  pillHost.querySelector(`.sp-pill[data-theme="${next}"]`)?.focus();
});

// Follow the OS while System is selected, so the preview tracks a light/dark flip.
darkQuery.addEventListener("change", () => {
  if (current === "system") paint();
});

// Keep a second settings tab in step with this one.
store.onChange((changes, area) => {
  if (area !== "local" || !changes[THEME_KEY]) return;
  const next = changes[THEME_KEY].newValue || DEFAULT_THEME;
  if (next === current) return;
  current = next;
  paint();
});

store.get(THEME_KEY, (stored) => {
  if (stored && typeof stored[THEME_KEY] === "string") current = stored[THEME_KEY];
  paint();
});
