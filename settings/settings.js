"use strict";

// Settings page: the theme, plus the six measuring (redline) preferences.
//
// The theme roster carries no colours — each pill's swatch is stamped with its
// own data-ccp-theme and styled through the --ccp-* tokens, so the palette on
// screen is literally the palette that gets applied. Adding a theme means one
// block in tokens.css and one line here.
//
// The measuring rosters mirror REDLINE_PREFS in content.js: same keys, same
// values, default first. Storage is flat — one chrome.storage.local key per
// setting, the "theme" convention.

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

// Mirror of REDLINE_PREFS in content.js — change both.
const REDLINE_PREFS = {
  redlineUnit: ["px", "rem"],
  redlinePrecision: ["whole", "tenths"],
  redlinePillPlacement: ["beside", "online"],
  redlineGuides: ["on", "off"],
  redlineQuietOverlay: ["off", "on"],
  redlineZeroPills: ["on", "off"],
};

// Mirror of EDIT_PREFS in content.js — change both.
const EDIT_PREFS = {
  editGroups: ["standard", "adaptive"],
  editTokenControls: ["both", "token", "value"],
};

// One roster for everything the sheet writes, so a new setting only has to be
// added to the map above to get storage, keyboard, and live-sync for free.
const ALL_PREFS = { ...REDLINE_PREFS, ...EDIT_PREFS };

const prefs = {};
for (const key of Object.keys(ALL_PREFS)) prefs[key] = ALL_PREFS[key][0];

// The vignette's two sample gaps — the blueprint's vertical and horizontal
// measurements. Fractional on purpose, so flipping precision or unit visibly
// changes the readout; the drawn lines round to the same px the extension's
// renderer would.
const VIG_A = 70.4;
const VIG_B = 86.6;

// Mirrored from content.js formatRedlineValue — change both. remBase here is
// 16: the vignette previews the common case, not this page's own font-size.
function formatRedlineValue(px, unit, precision, remBase) {
  if (unit === "rem") {
    return (px / remBase).toFixed(2).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "") + "rem";
  }
  if (precision === "tenths") {
    return (Math.round(px * 10) / 10).toFixed(1).replace(/\.0$/, "");
  }
  return String(Math.round(px));
}

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
const savedAppearance = document.getElementById("saved-appearance");
const savedMeasuring = document.getElementById("saved-measuring");
const savedEditing = document.getElementById("saved-editing");
const resetEl = document.getElementById("measure-reset");
const sheetEl = document.getElementById("measure-sheet");
const editSheetEl = document.getElementById("edit-sheet");
const editMockEl = document.getElementById("edit-mock");
const railEl = document.getElementById("preview-rail");
const vigEl = document.getElementById("measure-vig");
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

let current = DEFAULT_THEME;
const savedTimers = new Map();

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

function paintTheme() {
  document.documentElement.dataset.ccpTheme = resolveTheme(current);
  for (const pill of pillHost.querySelectorAll(".sp-pill")) {
    const on = pill.dataset.theme === current;
    pill.setAttribute("aria-checked", String(on));
    // Only the selected pill is a tab stop, which is how a radiogroup should
    // behave — arrow keys move between options, Tab leaves the group.
    pill.tabIndex = on ? 0 : -1;
  }
}

// Both sheets, so a control is painted wherever it lives.
const controlHosts = [sheetEl, editSheetEl].filter(Boolean);
const eachControl = (selector, fn) => {
  for (const host of controlHosts) for (const node of host.querySelectorAll(selector)) fn(node);
};

// One pass syncs every measuring control and the vignette to `prefs`.
function paintPrefs() {
  eachControl("[data-set]", (btn) => {
    const on = prefs[btn.dataset.set] === btn.dataset.val;
    btn.setAttribute("aria-checked", String(on));
    // Roving tabindex, same as the theme pills: the checked option is the
    // group's one tab stop, arrows move within it.
    btn.tabIndex = on ? 0 : -1;
  });
  eachControl("[data-sw]", (sw) => {
    sw.setAttribute("aria-checked", String(prefs[sw.dataset.sw] === "on"));
  });
  // The editing specimen is the real panel chrome, so the two settings act on
  // it the way they act on the live one.
  if (editMockEl) {
    editMockEl.dataset.groups = prefs.editGroups;
    editMockEl.dataset.tokens = prefs.editTokenControls;
  }
  // Nothing to reset when everything already sits at its default.
  resetEl.disabled = Object.keys(REDLINE_PREFS)
    .every((key) => prefs[key] === REDLINE_PREFS[key][0]);
  vigEl.dataset.placement = prefs.redlinePillPlacement;
  vigEl.dataset.guides = prefs.redlineGuides;
  vigEl.dataset.quiet = prefs.redlineQuietOverlay;
  vigEl.dataset.zeros = prefs.redlineZeroPills;
  const fmt = (px) =>
    formatRedlineValue(px, prefs.redlineUnit, prefs.redlinePrecision, 16);
  document.getElementById("vig-pill-a").textContent = fmt(VIG_A);
  document.getElementById("vig-pill-b").textContent = fmt(VIG_B);
  document.getElementById("vig-pill-z").textContent = fmt(0);
  // The caption quotes the checked controls, so it can never disagree with them.
  document.getElementById("vig-caption").textContent =
    ["redlineUnit", "redlinePrecision", "redlinePillPlacement"]
      .map((key) => sheetEl.querySelector(`[data-set="${key}"][aria-checked="true"]`)?.textContent)
      .filter(Boolean)
      .join(" · ");
}

// Feedback lands in the section where the change happened, and it does not
// claim more than is true: without the extension's storage (this page opened
// straight from disk, say) nothing persists, and the line says so.
function announce(noteEl, text) {
  noteEl.textContent = store.available
    ? `Saved — ${text}`
    : "Preview only — changes aren't saved here.";
  noteEl.classList.add("sp-saved-in");
  clearTimeout(savedTimers.get(noteEl));
  savedTimers.set(noteEl, setTimeout(() => {
    noteEl.classList.remove("sp-saved-in");
    // The text outlives the class by one fade (--ccp-duration), so the note
    // doesn't blank out mid-transition.
    savedTimers.set(noteEl, setTimeout(() => {
      noteEl.textContent = "";
    }, 150));
  }, 2400));
}

function selectTheme(id) {
  if (!THEMES.some((t) => t.id === id)) return;
  current = id;
  paintTheme();
  store.set({ [THEME_KEY]: id });
  announce(savedAppearance, THEMES.find((t) => t.id === id).name);
}

// The announce quotes the row's own label and the control's own text, so what
// is read back is exactly what was clicked — the vocabulary cannot drift.
function announceText(key, value) {
  const control = document.querySelector(`[data-set="${key}"][data-val="${value}"], [data-sw="${key}"]`);
  const label = control?.closest(".sp-spec")?.querySelector(".sp-spec-label")?.textContent || key;
  const valueText = control?.dataset.set ? control.textContent : value;
  return `${label} · ${valueText}`;
}

function setPref(key, value) {
  const roster = ALL_PREFS[key];
  if (!roster || !roster.includes(value)) return;
  prefs[key] = value;
  paintPrefs();
  store.set({ [key]: value });
  announce(key in EDIT_PREFS ? savedEditing : savedMeasuring, announceText(key, value));
}

renderPills();

pillHost.addEventListener("click", (e) => {
  const pill = e.target.closest(".sp-pill");
  if (pill) selectTheme(pill.dataset.theme);
});

// Arrow-key navigation, per the radiogroup pattern.
pillHost.addEventListener("keydown", (e) => {
  const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"];
  if (!keys.includes(e.key)) return;
  e.preventDefault();
  const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
  const i = THEMES.findIndex((t) => t.id === current);
  const next = THEMES[(i + step + THEMES.length) % THEMES.length].id;
  selectTheme(next);
  pillHost.querySelector(`.sp-pill[data-theme="${next}"]`)?.focus();
});

// The measuring sheet: segmented radios write their value, switches toggle.
for (const host of controlHosts) host.addEventListener("click", (e) => {
  const radio = e.target.closest("[data-set]");
  if (radio) return setPref(radio.dataset.set, radio.dataset.val);
  const sw = e.target.closest("[data-sw]");
  if (sw) {
    const key = sw.dataset.sw;
    setPref(key, prefs[key] === "on" ? "off" : "on");
  }
});

resetEl.addEventListener("click", () => {
  const payload = {};
  for (const key of Object.keys(REDLINE_PREFS)) {
    prefs[key] = REDLINE_PREFS[key][0];
    payload[key] = prefs[key];
  }
  paintPrefs();
  store.set(payload);
  announce(savedMeasuring, "defaults restored");
});

// Arrows walk the roster in the direction pressed and wrap at the ends — the
// standard radiogroup pattern. Written as a cycle rather than "flip to the
// other one" because the Editing section's token control has three values;
// for a pair the two are the same behaviour.
for (const host of controlHosts) host.addEventListener("keydown", (e) => {
  const forward = ["ArrowRight", "ArrowDown"];
  const back = ["ArrowLeft", "ArrowUp"];
  if (!forward.includes(e.key) && !back.includes(e.key)) return;
  const radio = e.target.closest("[data-set]");
  if (!radio) return;
  e.preventDefault();
  const key = radio.dataset.set;
  const roster = ALL_PREFS[key];
  if (!roster) return;
  const step = forward.includes(e.key) ? 1 : -1;
  const next = roster[(roster.indexOf(prefs[key]) + step + roster.length) % roster.length];
  setPref(key, next);
  document.querySelector(`[data-set="${key}"][data-val="${next}"]`)?.focus();
});

// The rail answers whichever section the pointer or focus is in: the chrome
// mock for Appearance, the measuring vignette for the sheet. The guard keeps
// re-entering the same section from restarting the crossfade.
for (const zone of document.querySelectorAll("[data-focus]")) {
  const mode = zone.dataset.focus;
  const setMode = () => {
    if (railEl.dataset.mode !== mode) railEl.dataset.mode = mode;
  };
  zone.addEventListener("pointerenter", setMode);
  zone.addEventListener("focusin", setMode);
}

// Hovering or focusing into a spec row spotlights the part of the vignette it
// controls — keyboard users get the same lesson pointer users do.
for (const row of document.querySelectorAll(".sp-spec")) {
  // Each row spotlights inside whichever preview its section owns.
  const target = row.closest('[data-focus="edit"]') ? editMockEl : vigEl;
  const spotlight = () => {
    if (target) target.dataset.hi = row.dataset.hi;
  };
  const unspot = () => {
    if (target) delete target.dataset.hi;
  };
  row.addEventListener("pointerenter", spotlight);
  row.addEventListener("pointerleave", unspot);
  row.addEventListener("focusin", spotlight);
  row.addEventListener("focusout", (e) => {
    if (!row.contains(e.relatedTarget)) unspot();
  });
}

// Follow the OS while System is selected, so the preview tracks a light/dark flip.
darkQuery.addEventListener("change", () => {
  if (current === "system") paintTheme();
});

// Keep a second settings tab in step with this one.
store.onChange((changes, area) => {
  if (area !== "local") return;
  if (changes[THEME_KEY]) {
    const next = changes[THEME_KEY].newValue || DEFAULT_THEME;
    if (next !== current) {
      current = next;
      paintTheme();
    }
  }
  let touched = false;
  for (const key of Object.keys(ALL_PREFS)) {
    if (!changes[key]) continue;
    const next = changes[key].newValue;
    if (ALL_PREFS[key].includes(next) && next !== prefs[key]) {
      prefs[key] = next;
      touched = true;
    }
  }
  if (touched) paintPrefs();
});

store.get([THEME_KEY, ...Object.keys(ALL_PREFS)], (stored) => {
  if (stored && typeof stored[THEME_KEY] === "string") current = stored[THEME_KEY];
  for (const key of Object.keys(ALL_PREFS)) {
    if (stored && ALL_PREFS[key].includes(stored[key])) prefs[key] = stored[key];
  }
  paintTheme();
  paintPrefs();
});
