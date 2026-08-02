(() => {
  "use strict";

  // ===== State =====
  let probeActive = false;
  let hoveredElement = null;
  let selectedElement = null;
  let overlayContainer = null;
  let labelEl = null;
  let toolbarEl = null;
  let parentButtonEl = null;
  let toastEl = null;
  let toastTimer = null;
  let rafId = null;
  let viewportRafId = null;
  let settingsButtonEl = null;
  // Redline (held-Option spacing measurements). redlineTarget is deliberately
  // separate from hoveredElement: while something is selected, hoveredElement
  // is aliased to the selection, and redline must never disturb that.
  let redlining = false;
  let redlineTarget = null;
  let lastMouseX = -1;
  let lastMouseY = -1;
  let redlineEl = null;
  let redlineHoverEl = null;
  let redlineLineEls = [];
  let redlineGuideEls = [];
  let redlinePillEls = [];
  // Tether (Edit Mode's association chrome — see the Tether section).
  let tetherEl = null;
  let tetherTickEls = [];
  let tetherSegEls = [];
  let tetherLoud = false;
  let tetherLoudTimer = 0;
  // Edit Mode (live-tuning the selection). A sub-mode of selection, like
  // redline — `editing` is only ever true while selectedElement is set.
  let editing = false;
  let editPanelEl = null;
  let editPanelPos = null;
  let editPopoverEl = null;
  let editGesture = null;
  let editFlashTimer = null;
  let tokenIndex = null;
  let editTokenFamilies = null;
  // Strong element references, deliberately: the undo stack has to hold them
  // anyway, edits outlive deselection, and a page reload is what clears the
  // world. Every path that touches a record re-checks el.isConnected, since a
  // framework can replace a node out from under us.
  const editRegistry = new Map();
  const undoStack = [];
  const redoStack = [];

  // ===== Geometry =====
  // The one group of design values that stays in JS instead of moving to
  // tokens.css. computeChromeLayout() is a pure function — test/placement.mjs
  // mirrors it and validates it over 8280 configurations with no DOM at all — so
  // it cannot call getComputedStyle to read a custom property. Keeping these
  // here is what keeps that spec runnable. DESIGN.md records this as the single
  // deliberate exception to "tokens drive both CSS and JS".
  //
  // margin/gap/pair/minLabelHeight are mirrored as M / GAP / PAIR / MIN_LABEL_H
  // in test/placement.mjs:136-153; the redline* trio is mirrored as PILL_OFFSET /
  // GUIDE_OVERSHOOT / PILL_MARGIN in test/redline.mjs; the tether* keys are
  // mirrored as GAP / TICK / TICK_LOUD / THICK / STUB in test/tether.mjs.
  // Change them here and change them there.
  const GEOMETRY = {
    margin: 4,
    gap: 6,
    pair: 6,
    minLabelHeight: 24,
    narrowToolbar: 470, // the .ccp-compact breakpoint
    radiusFallback: 4, // assumed corner radius when the element is square
    maxSweepDiagonal: 2600, // past this the spun outline degrades to .ccp-plain
    redlinePillOffset: 8, // pill center sits this far perpendicular to its line
    redlineGuideOvershoot: 4, // dashed guide runs this far past the measurement line
    redlinePillMargin: 14, // pill centers are clamped this far inside the viewport
    // The tether works in the ring of space outside the element and never
    // inside it; tetherGap is that clearance, and it is the constraint the
    // whole design exists to honour.
    tetherGap: 8, // ticks sit this far outside the element's box
    tetherTick: 16, // resting tick length
    tetherTickLoud: 26, // tick length while a control is hot
    tetherThick: 2, // tick thickness, and the run's stroke weight
    tetherStub: 10, // the run leaves the panel at least this far before turning
  };

  // ===== Theme =====
  // Stored as a single id in chrome.storage.local and applied by writing
  // data-ccp-theme onto <html>, which every token block in tokens.css keys off.
  // One attribute themes all five injected roots, because custom properties
  // inherit and `all: initial` does not reset them (CSS Cascade 4 §3.2).
  const THEME_KEY = "theme";
  const DEFAULT_THEME = "terracotta-dark";
  const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
  let themePref = DEFAULT_THEME;

  // "system" has no palette of its own — it picks one of the two terracotta
  // blocks. Resolving here rather than duplicating every block inside an @media
  // query keeps tokens.css single-source, and lets the settings page preview
  // exactly what the page will render.
  function resolveTheme(pref) {
    if (pref !== "system") return pref;
    return darkQuery.matches ? "terracotta-dark" : "terracotta-light";
  }

  function applyTheme() {
    document.documentElement.dataset.ccpTheme = resolveTheme(themePref);
  }

  // Read a token from <html>. Only for the handful of values that genuinely have
  // to reach JS: the toast is positioned entirely from script, and the loading
  // state is written as an inline style. Everything else stays in CSS.
  function token(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  // Fired immediately at script load, not on activate(), so the first paint of
  // the chrome already has the right palette. activate() applies whatever has
  // arrived by then; until it does, the tokens.css :root block is the default,
  // so an unresolved read shows terracotta-dark rather than an unstyled box.
  chrome.storage?.local.get(THEME_KEY, (stored) => {
    if (stored && typeof stored[THEME_KEY] === "string") themePref = stored[THEME_KEY];
    if (probeActive) applyTheme();
  });

  // Repaints an already-open page when the settings tab changes the theme.
  // storage.onChanged fires in content scripts directly, so this needs no
  // message plumbing through the service worker.
  chrome.storage?.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[THEME_KEY]) return;
    themePref = changes[THEME_KEY].newValue || DEFAULT_THEME;
    if (probeActive) applyTheme();
  });

  // Follow the OS live, but only while "system" is selected.
  darkQuery.addEventListener("change", () => {
    if (themePref === "system" && probeActive) applyTheme();
  });

  // ===== Redline Preferences =====
  // Six flat storage keys, one per setting — the "theme" convention. Each
  // roster lists the legal values with the default (current shipping
  // behaviour) first; unrecognised stored values fall back to it silently.
  const REDLINE_PREFS = {
    redlineUnit: ["px", "rem"],
    redlinePrecision: ["whole", "tenths"],
    redlinePillPlacement: ["beside", "online"],
    redlineGuides: ["on", "off"],
    redlineQuietOverlay: ["off", "on"],
    redlineZeroPills: ["on", "off"],
  };
  const redlinePrefs = {};
  for (const key of Object.keys(REDLINE_PREFS)) redlinePrefs[key] = REDLINE_PREFS[key][0];

  function setRedlinePref(key, value) {
    const roster = REDLINE_PREFS[key];
    if (roster) redlinePrefs[key] = roster.includes(value) ? value : roster[0];
  }

  // Same fire-and-forget shape as the theme read above: prefs are consumed at
  // render time, and no redline can be active this early.
  chrome.storage?.local.get(Object.keys(REDLINE_PREFS), (stored) => {
    if (!stored) return;
    for (const key of Object.keys(REDLINE_PREFS)) {
      if (key in stored) setRedlinePref(key, stored[key]);
    }
  });

  // A live change mid-gesture restyles the measurements in place — the same
  // no-reload contract the theme keeps.
  chrome.storage?.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    let touched = false;
    for (const key of Object.keys(REDLINE_PREFS)) {
      if (changes[key]) {
        setRedlinePref(key, changes[key].newValue);
        touched = true;
      }
    }
    if (touched && redlining) {
      applyRedlineQuiet();
      scheduleRedline();
    }
  });

  // ===== Edit Preferences =====
  // Same shape as the redline roster above: flat keys, default first,
  // unrecognised values fall back silently.
  //
  // editGroups decides whether the panel shows every group it can edit or only
  // the ones this element already has — the difference between "give this a
  // border" being one click away and being out of sight until you need it.
  // editTokenControls decides whether a token-bearing value offers its scale,
  // its raw number, or both.
  const EDIT_PREFS = {
    editGroups: ["standard", "adaptive"],
    editTokenControls: ["both", "token", "value"],
  };
  const editPrefs = {};
  for (const key of Object.keys(EDIT_PREFS)) editPrefs[key] = EDIT_PREFS[key][0];

  function setEditPref(key, value) {
    const roster = EDIT_PREFS[key];
    if (roster) editPrefs[key] = roster.includes(value) ? value : roster[0];
  }

  chrome.storage?.local.get(Object.keys(EDIT_PREFS), (stored) => {
    if (!stored) return;
    for (const key of Object.keys(EDIT_PREFS)) {
      if (key in stored) setEditPref(key, stored[key]);
    }
  });

  // Changing a preference with the panel open re-renders it in place, the same
  // no-reload contract redline and the theme keep.
  chrome.storage?.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    let touched = false;
    for (const key of Object.keys(EDIT_PREFS)) {
      if (changes[key]) {
        setEditPref(key, changes[key].newValue);
        touched = true;
      }
    }
    if (touched && editing) renderEditControls();
  });

  // The quiet-overlay preference paints entirely from CSS; this class is its
  // only JS surface. Held low (removed) whenever redline itself is off.
  function applyRedlineQuiet() {
    document.documentElement.classList.toggle(
      "ccp-redline-quiet",
      redlining && redlinePrefs.redlineQuietOverlay === "on"
    );
  }

  // Clawd's colours arrive from tokens.css via the .ccp-clawd-* classes rather
  // than fill="" attributes: var() is not resolved inside an SVG presentation
  // attribute, only in a real style rule. See content.css.

  // ===== Clawd Mini (for toast loading state) =====
  const CLAWD_MINI = `<svg viewBox="-4 -4 120 80" width="28" height="20" fill="none" style="flex-shrink:0;overflow:visible"><rect class="ccp-clawd-body" x="8" y="0" width="96" height="56" rx="4"/><rect class="ccp-clawd-body" x="-4" y="25.6" width="12" height="14.4" rx="3"/><rect class="ccp-clawd-body" x="104" y="25.6" width="12" height="14.4" rx="3"/><rect class="ccp-clawd-eye" x="28" y="14" width="8" height="16" rx="2"/><rect class="ccp-clawd-eye" x="76" y="14" width="8" height="16" rx="2"/><rect class="ccp-clawd-leg" x="16" y="56" width="9.6" height="20" rx="2"><animate attributeName="height" values="20;16;20" dur="0.4s" begin="0s" repeatCount="indefinite"/></rect><rect class="ccp-clawd-leg" x="30.4" y="56" width="9.6" height="20" rx="2"><animate attributeName="height" values="20;16;20" dur="0.4s" begin="0.1s" repeatCount="indefinite"/></rect><rect class="ccp-clawd-leg" x="72" y="56" width="9.6" height="20" rx="2"><animate attributeName="height" values="20;16;20" dur="0.4s" begin="0.2s" repeatCount="indefinite"/></rect><rect class="ccp-clawd-leg" x="86.4" y="56" width="9.6" height="20" rx="2"><animate attributeName="height" values="20;16;20" dur="0.4s" begin="0.3s" repeatCount="indefinite"/></rect></svg>`;

  // ===== SVG Icons =====
  const ICONS = {
    code: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
    camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
    parent: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3"/><path d="M12 20v-8"/><polyline points="9 15 12 12 15 15"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
  };

  // ===== Clawd Mascot SVG (mood="happy", from clawd-react) =====
  const CLAWD_SVG = `<svg viewBox="-16 -4 144 104" fill="none" xmlns="http://www.w3.org/2000/svg">
    <!-- Shadow -->
    <ellipse class="ccp-clawd-shadow" cx="56" cy="91.5" rx="32" ry="4"/>
    <!-- Body -->
    <rect class="ccp-clawd-body" x="8" y="0" width="96" height="56" rx="4"/>
    <!-- Arm nubs -->
    <rect class="ccp-clawd-body" x="-4" y="25.6" width="12" height="14.4" rx="3"/>
    <rect class="ccp-clawd-body" x="104" y="25.6" width="12" height="14.4" rx="3"/>
    <!-- Eyes -->
    <rect class="ccp-clawd-eye" x="28" y="14" width="8" height="16" rx="2"/>
    <rect class="ccp-clawd-eye" x="76" y="14" width="8" height="16" rx="2"/>
    <!-- Legs -->
    <rect class="ccp-clawd-leg" x="16" y="56" width="9.6" height="20" rx="2">
      <animate attributeName="height" values="20;16;20" dur="0.4s" begin="0s" repeatCount="indefinite"/>
    </rect>
    <rect class="ccp-clawd-leg" x="30.4" y="56" width="9.6" height="20" rx="2">
      <animate attributeName="height" values="20;16;20" dur="0.4s" begin="0.1s" repeatCount="indefinite"/>
    </rect>
    <rect class="ccp-clawd-leg" x="72" y="56" width="9.6" height="20" rx="2">
      <animate attributeName="height" values="20;16;20" dur="0.4s" begin="0.2s" repeatCount="indefinite"/>
    </rect>
    <rect class="ccp-clawd-leg" x="86.4" y="56" width="9.6" height="20" rx="2">
      <animate attributeName="height" values="20;16;20" dur="0.4s" begin="0.3s" repeatCount="indefinite"/>
    </rect>
    <!-- Sparkles -->
    <circle class="ccp-clawd-spark" cx="108" cy="8" r="3.5" opacity="0">
      <animate attributeName="opacity" values="0;1;0" dur="1.5s" repeatCount="indefinite"/>
      <animate attributeName="r" values="1;3.5;1" dur="1.5s" repeatCount="indefinite"/>
    </circle>
    <circle class="ccp-clawd-spark" cx="116" cy="-2" r="2.5" opacity="0">
      <animate attributeName="opacity" values="0;1;0" dur="1.5s" begin="0.4s" repeatCount="indefinite"/>
      <animate attributeName="r" values="0.5;2.5;0.5" dur="1.5s" begin="0.4s" repeatCount="indefinite"/>
    </circle>
    <circle class="ccp-clawd-spark" cx="120" cy="18" r="2" opacity="0">
      <animate attributeName="opacity" values="0;1;0" dur="1.5s" begin="0.8s" repeatCount="indefinite"/>
      <animate attributeName="r" values="0.5;2;0.5" dur="1.5s" begin="0.8s" repeatCount="indefinite"/>
    </circle>
  </svg>`;

  // ===== Style formatting helpers =====
  function colorSwatch(rawColor) {
    if (!rawColor) return "";
    const m = rawColor.match(/^rgba?\([^)]*,\s*([\d.]+)\s*\)$/);
    const alpha = m ? parseFloat(m[1]) : 1;
    const cls = alpha < 1 ? "ccp-color-swatch ccp-color-swatch-alpha" : "ccp-color-swatch";
    return `<span class="${cls}" style="background-color:${rawColor}"></span>`;
  }

  function formatColor(c) {
    if (!c) return c;
    const m = c.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/);
    if (!m) return c;
    const a = m[4] !== undefined ? parseFloat(m[4]) : 1;
    if (a === 0) return "transparent";
    const hex = (n) => parseInt(n, 10).toString(16).padStart(2, "0");
    const base = `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`;
    return a < 1 ? `${base}@${Math.round(a * 100)}%` : base;
  }

  function splitShadows(s) {
    const out = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      else if (ch === "," && depth === 0) {
        out.push(s.slice(start, i).trim());
        start = i + 1;
      }
    }
    out.push(s.slice(start).trim());
    return out;
  }

  function formatShadow(s) {
    return splitShadows(s)
      .map((part) => {
        const colorMatch = part.match(/rgba?\([^)]+\)/);
        if (!colorMatch) return part;
        return `${colorSwatch(colorMatch[0])}${formatColor(colorMatch[0])}`;
      })
      .join(", ");
  }

  function hasDirectText(el) {
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) return true;
    }
    return false;
  }

  function getDirectText(el) {
    let out = "";
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) out += node.textContent;
    }
    return out.trim().replace(/\s+/g, " ");
  }

  // Read cursor without the probe-mode plain-arrow override.
  // Temporarily strips the override class for a synchronous style read; no paint occurs.
  function getRealCursor(el) {
    const root = document.documentElement;
    const wasActive = root.classList.contains("ccp-probe-active");
    if (wasActive) root.classList.remove("ccp-probe-active");
    const cursor = getComputedStyle(el).cursor;
    if (wasActive) root.classList.add("ccp-probe-active");
    return cursor;
  }

  // ===== Message Listener =====
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "TOGGLE_PROBE") {
      if (msg.active && !probeActive) {
        activate();
      } else if (!msg.active && probeActive) {
        deactivate();
      }
    }
  });

  // ===== Activation / Deactivation =====
  function activate() {
    probeActive = true;
    applyTheme();
    document.documentElement.classList.add("ccp-probe-active");
    createOverlay();
    createSettingsButton();
    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("keyup", onKeyUp, true);
    // Alt+Tab away must not strand redline: no keyup ever arrives for it
    window.addEventListener("blur", onWindowBlur);
    // Capture, so scrolling any nested container counts too
    document.addEventListener("scroll", onViewportChange, { capture: true, passive: true });
    window.addEventListener("resize", onViewportChange);
  }

  function deactivate() {
    probeActive = false;
    stopRedline();
    hoveredElement = null;
    selectedElement = null;
    lastMouseX = -1;
    lastMouseY = -1;
    document.documentElement.classList.remove("ccp-probe-active");
    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("keyup", onKeyUp, true);
    window.removeEventListener("blur", onWindowBlur);
    document.removeEventListener("scroll", onViewportChange, true);
    window.removeEventListener("resize", onViewportChange);
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (viewportRafId) {
      cancelAnimationFrame(viewportRafId);
      viewportRafId = null;
    }
    removeOverlay();
    removeToolbar();
    removeSettingsButton();
  }

  // ===== Settings Button =====
  // Pinned to the viewport's top-right corner for as long as probe mode is on.
  // Mounted here rather than in showToolbar() on purpose: #ccp-toolbar is torn
  // down and rebuilt on every click and removed entirely on deselect, so a
  // button living inside it would disappear whenever nothing was selected.
  function createSettingsButton() {
    if (settingsButtonEl) return;
    settingsButtonEl = document.createElement("button");
    settingsButtonEl.id = "ccp-settings-btn";
    settingsButtonEl.type = "button";
    settingsButtonEl.title = "Probe settings";
    settingsButtonEl.setAttribute("aria-label", "Probe settings");
    settingsButtonEl.innerHTML = ICONS.settings;
    // Capture-phase onClick on document swallows every page click, so this has
    // to stop propagation the same way the toolbar's buttons do.
    settingsButtonEl.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Content scripts cannot call chrome.runtime.openOptionsPage() — only the
      // service worker can, hence the round trip.
      chrome.runtime.sendMessage({ type: "OPEN_SETTINGS" });
    });
    document.documentElement.appendChild(settingsButtonEl);
  }

  function removeSettingsButton() {
    if (settingsButtonEl) {
      settingsButtonEl.remove();
      settingsButtonEl = null;
    }
  }

  // The gear is viewport-anchored, so it never enters computeChromeLayout() and
  // the placement matrix is unaffected. It can still be sat on, though: three of
  // the six strategies dock the label against the visible top edge, which at
  // top-right is exactly where the gear is. The gear yields — same invariant the
  // placement design already uses, where the interactive box wins and the other
  // gives way. Opacity rather than display:none so its rect stays measurable and
  // the collision can be seen to end.
  function updateSettingsButtonVisibility() {
    if (!settingsButtonEl) return;
    const gear = settingsButtonEl.getBoundingClientRect();
    const hit = (el) => {
      if (!el || el.style.display === "none") return false;
      const r = el.getBoundingClientRect();
      return (
        r.width > 0 &&
        r.height > 0 &&
        r.left < gear.right &&
        r.right > gear.left &&
        r.top < gear.bottom &&
        r.bottom > gear.top
      );
    };
    // During redline the label and toolbar are visibility:hidden but still laid
    // out, so hit() would report a collision with an invisible box — the gear
    // stays put instead. Editing hides them the same way, and puts the panel
    // in their place: it is the interactive box now, so it is what the gear
    // has to yield to.
    const hushed = redlining || editing;
    settingsButtonEl.classList.toggle(
      "ccp-yielded",
      (!hushed && (hit(labelEl) || hit(toolbarEl))) || (editing && hit(editPanelEl))
    );
  }

  // ===== Corner radius =====
  const CORNERS = [
    "borderTopLeftRadius",
    "borderTopRightRadius",
    "borderBottomRightRadius",
    "borderBottomLeftRadius",
  ];

  function readRadii(el) {
    const style = getComputedStyle(el);
    const values = CORNERS.map((c) => style[c]);
    const square = values.every((v) => v.split(" ").every((p) => parseFloat(p) === 0));
    return { values, square };
  }

  // Each corner is written as its own longhand. A single calc() on the shorthand
  // cannot offset a multi-value radius like "20px 4px 20px 4px" — it computes to
  // invalid and the radius silently collapses to square.
  function applyRadii(target, radii, offset) {
    CORNERS.forEach((corner, i) => {
      target.style[corner] = radii.square
        ? `${Math.max(0, GEOMETRY.radiusFallback + offset)}px`
        : radii.values[i]
            .split(" ")
            .map((p) => `max(0px, calc(${p} + ${offset}px))`)
            .join(" ");
    });
  }

  // Corner radii in px for the SVG path. Only the horizontal component is used,
  // so a percentage resolves against the width.
  function radiiInPixels(radii, width) {
    if (radii.square) {
      const r = GEOMETRY.radiusFallback;
      return [r, r, r, r];
    }
    return radii.values.map((v) => {
      const horizontal = v.split(" ")[0];
      const n = parseFloat(horizontal) || 0;
      return horizontal.includes("%") ? (n / 100) * width : n;
    });
  }

  // Rounded-rect path with four independent corners, scaled down if adjacent
  // radii would overlap (the same clamp the CSS box model applies).
  function roundedRectPath(w, h, r) {
    const k = Math.min(
      1,
      w / (r[0] + r[1] || 1),
      w / (r[3] + r[2] || 1),
      h / (r[0] + r[3] || 1),
      h / (r[1] + r[2] || 1)
    );
    const [tl, tr, br, bl] = r.map((v) => Math.max(0, v * k));
    return (
      `M ${tl} 0 H ${w - tr} A ${tr} ${tr} 0 0 1 ${w} ${tr}` +
      ` V ${h - br} A ${br} ${br} 0 0 1 ${w - br} ${h}` +
      ` H ${bl} A ${bl} ${bl} 0 0 1 0 ${h - bl}` +
      ` V ${tl} A ${tl} ${tl} 0 0 1 ${tl} 0 Z`
    );
  }

  // ===== Overlay DOM =====
  function createOverlay() {
    if (overlayContainer) return;

    overlayContainer = document.createElement("div");
    overlayContainer.id = "ccp-overlay-container";

    const ids = ["ccp-margin-box", "ccp-bloom", "ccp-padding-box", "ccp-content-box", "ccp-border-box"];
    for (const id of ids) {
      const div = document.createElement("div");
      div.id = id;
      overlayContainer.appendChild(div);
    }

    // the two spinners carry the gradient; they share a duration and start
    // together, so the bloom stays in phase with the stroke
    for (const [parentId, spinId] of [["ccp-border-box", "ccp-sweep-spin"], ["ccp-bloom", "ccp-bloom-spin"]]) {
      const spin = document.createElement("div");
      spin.id = spinId;
      spin.className = "ccp-spin";
      overlayContainer.querySelector("#" + parentId).appendChild(spin);
    }

    const ants = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    ants.id = "ccp-ants";
    ants.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "path"));
    overlayContainer.appendChild(ants);

    // Redline layer. The measurement nodes are grandchildren of the container
    // on purpose: the `> div` rule in content.css would give them the container
    // children's glide wholesale, while renderRedline() needs to decide per
    // frame which nodes glide and which snap. The wrapper itself never moves,
    // so it can be a direct child, and it gates display + stacking as one unit.
    // Pool sizes cover the worst cases: containment needs 4 lines + 4 pills,
    // a diagonal needs 2 of each. Pills are appended last so they paint on top.
    // Hidden means opacity 0, not display:none — a shown node must be able to
    // fade and glide, and a transition cannot cross a display flip.
    redlineEl = document.createElement("div");
    redlineEl.id = "ccp-redline";
    const pool = (className, count, into) => {
      for (let i = 0; i < count; i++) {
        const node = document.createElement("div");
        node.className = className;
        node.style.opacity = "0";
        redlineEl.appendChild(node);
        into.push(node);
      }
      return into;
    };
    redlineHoverEl = pool("ccp-redline-hover", 1, [])[0];
    pool("ccp-redline-line", 4, redlineLineEls);
    pool("ccp-redline-guide-h", 4, redlineGuideEls);
    pool("ccp-redline-pill", 4, redlinePillEls);
    overlayContainer.appendChild(redlineEl);

    // Tether layer, built on the same terms as the redline layer above and for
    // the same reason: a wrapper that never moves, holding nodes whose glide
    // renderTether() decides per frame. Four ticks (one per edge) and two run
    // segments (a single-turn L, or one segment when the two ends line up).
    tetherEl = document.createElement("div");
    tetherEl.id = "ccp-tether";
    const tetherPool = (className, count, into) => {
      for (let i = 0; i < count; i++) {
        const node = document.createElement("div");
        node.className = className;
        node.style.opacity = "0";
        tetherEl.appendChild(node);
        into.push(node);
      }
    };
    tetherPool("ccp-tether-seg", 2, tetherSegEls);
    tetherPool("ccp-tether-tick", 4, tetherTickEls);
    overlayContainer.appendChild(tetherEl);

    labelEl = document.createElement("div");
    labelEl.id = "ccp-label";
    labelEl.style.display = "none";

    // Inject Clawd mascot
    const clawdContainer = document.createElement("div");
    clawdContainer.className = "ccp-clawd";
    clawdContainer.innerHTML = CLAWD_SVG;
    labelEl.appendChild(clawdContainer);

    document.documentElement.appendChild(overlayContainer);
    document.documentElement.appendChild(labelEl);
  }

  function removeOverlay() {
    if (overlayContainer) {
      overlayContainer.remove();
      overlayContainer = null;
    }
    if (labelEl) {
      labelEl.remove();
      labelEl = null;
    }
    // The redline and tether nodes went down with the container; drop the refs
    redlineEl = null;
    redlineHoverEl = null;
    redlineLineEls = [];
    redlineGuideEls = [];
    redlinePillEls = [];
    tetherEl = null;
    tetherTickEls = [];
    tetherSegEls = [];
  }

  // ===== Overlay Positioning =====
  function positionBox(id, top, left, width, height) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.top = top + "px";
    el.style.left = left + "px";
    el.style.width = Math.max(0, width) + "px";
    el.style.height = Math.max(0, height) + "px";
  }

  // `options.keepContent` re-places the chrome without rebuilding the label's
  // markup — used while tracking the viewport, where rewriting innerHTML every
  // frame would restart the breadcrumb marquee and churn layout for nothing.
  function updateOverlay(el, options) {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);

    const margin = {
      top: parseFloat(style.marginTop) || 0,
      right: parseFloat(style.marginRight) || 0,
      bottom: parseFloat(style.marginBottom) || 0,
      left: parseFloat(style.marginLeft) || 0,
    };
    const padding = {
      top: parseFloat(style.paddingTop) || 0,
      right: parseFloat(style.paddingRight) || 0,
      bottom: parseFloat(style.paddingBottom) || 0,
      left: parseFloat(style.paddingLeft) || 0,
    };
    const border = {
      top: parseFloat(style.borderTopWidth) || 0,
      right: parseFloat(style.borderRightWidth) || 0,
      bottom: parseFloat(style.borderBottomWidth) || 0,
      left: parseFloat(style.borderLeftWidth) || 0,
    };

    // Margin box
    positionBox(
      "ccp-margin-box",
      rect.top - margin.top,
      rect.left - margin.left,
      rect.width + margin.left + margin.right,
      rect.height + margin.top + margin.bottom
    );

    // Padding box
    positionBox(
      "ccp-padding-box",
      rect.top + border.top,
      rect.left + border.left,
      rect.width - border.left - border.right,
      rect.height - border.top - border.bottom
    );

    // Content box
    positionBox(
      "ccp-content-box",
      rect.top + border.top + padding.top,
      rect.left + border.left + padding.left,
      rect.width - border.left - border.right - padding.left - padding.right,
      rect.height - border.top - border.bottom - padding.top - padding.bottom
    );

    // Sweep ring — sits 2px outside the element, so its radius grows to match
    positionBox("ccp-border-box", rect.top - 2, rect.left - 2, rect.width + 4, rect.height + 4);

    // Inner bloom — exactly the element's box
    positionBox("ccp-bloom", rect.top, rect.left, rect.width, rect.height);

    applyRadiiToOverlay(el, rect, border);

    // Label content, then one pass that places both it and the toolbar
    if (!options || !options.keepContent) updateLabel(el, rect);
    layoutChrome(el, options);
  }

  function applyRadiiToOverlay(el, rect, border) {
    const radii = readRadii(el);
    const thickest = Math.max(border.top, border.right, border.bottom, border.left);

    const setRadii = (id, offset) => {
      const node = document.getElementById(id);
      if (node) applyRadii(node, radii, offset);
    };
    setRadii("ccp-margin-box", 0);
    setRadii("ccp-bloom", 0);
    setRadii("ccp-border-box", 2);
    setRadii("ccp-padding-box", -thickest);

    // One square, large enough to cover the box's diagonal at any rotation, spun
    // by transform — so the gradient rotates without repainting on every frame.
    // Past a point that square would be a huge layer for no visible gain (Select
    // Parent walks up to <body> routinely), so those fall back to a plain stroke.
    const diagonal = Math.ceil(Math.hypot(rect.width + 4, rect.height + 4));
    const oversized = diagonal > GEOMETRY.maxSweepDiagonal;
    if (overlayContainer) overlayContainer.classList.toggle("ccp-plain", oversized);

    if (!oversized) {
      for (const id of ["ccp-sweep-spin", "ccp-bloom-spin"]) {
        const spin = document.getElementById(id);
        if (!spin) continue;
        spin.style.width = diagonal + "px";
        spin.style.height = diagonal + "px";
      }
    }

    // Marching dashes: the svg starts 2px out so a 2px stroke centred on the
    // element's edge is fully inside it
    const ants = document.getElementById("ccp-ants");
    if (!ants) return;
    const w = rect.width;
    const h = rect.height;
    ants.style.top = rect.top - 2 + "px";
    ants.style.left = rect.left - 2 + "px";
    ants.style.width = w + 4 + "px";
    ants.style.height = h + 4 + "px";
    ants.setAttribute("viewBox", `0 0 ${w + 4} ${h + 4}`);
    const path = ants.querySelector("path");
    path.setAttribute("transform", "translate(2,2)");
    path.setAttribute("d", roundedRectPath(w, h, radiiInPixels(radii, w)));
  }

  // ===== Selection chrome placement =====
  //
  // The label and the toolbar are placed in a single pass so they cannot land
  // on top of each other. Each strategy positions every visible box at once and
  // is accepted only if all of them fit on screen and clear each other, which
  // makes collision impossible by construction rather than by luck.
  //
  // Everything anchors to the element's *visible* rect (element ∩ viewport),
  // never the raw rect — an element taller than the screen has a rect.bottom
  // thousands of pixels below the fold, and anchoring to it throws the chrome
  // clean off the page.
  //
  // test/placement.mjs is the executable spec for this function and the harness
  // it powers runs a 23-case matrix against it. The harness's live sweep
  // reconciles the two; run it after changing either.

  function overlapArea(a, b) {
    const x = Math.max(0, Math.min(a.left + a.w, b.left + b.w) - Math.max(a.left, b.left));
    const y = Math.max(0, Math.min(a.top + a.h, b.top + b.h) - Math.max(a.top, b.top));
    return x * y;
  }

  // `toolbar` is null while merely hovering — then the label is placed alone.
  function computeChromeLayout(rect, label, toolbar, vw, vh) {
    const M = GEOMETRY.margin, GAP = GEOMETRY.gap, PAIR = GEOMETRY.pair;

    const T = toolbar
      ? { w: toolbar.w, h: toolbar.h, hidden: false }
      : { w: 0, h: 0, hidden: true };

    // The toolbar is interactive — clipping it breaks the tool — so it is the
    // hard constraint and the label yields: first by shrinking, then by
    // disappearing once not even one line will fit.
    const room = vh - 2 * M - (T.hidden ? 0 : T.h + PAIR);
    const labelH = Math.min(label.h, Math.max(0, room));
    const labelHidden = labelH < GEOMETRY.minLabelHeight;
    const L = { w: label.w, h: labelHidden ? 0 : labelH, hidden: labelHidden };

    // Whichever boxes are actually shown stack into one unit.
    const stack = labelHidden ? 0 : L.h + PAIR;
    const clusterH =
      (labelHidden ? 0 : L.h) + (T.hidden ? 0 : T.h) + (labelHidden || T.hidden ? 0 : PAIR);

    const vis = {
      top: Math.max(rect.top, 0),
      left: Math.max(rect.left, 0),
      bottom: Math.min(rect.bottom, vh),
      right: Math.min(rect.right, vw),
    };

    const clampLeft = (left, w) => Math.max(M, Math.min(left, vw - w - M));
    const fitsV = (top, h) => top >= M && top + h <= vh - M;
    const mk = (box, top, left) =>
      ({ top, left: clampLeft(left, box.w), w: box.w, h: box.h, hidden: box.hidden });

    // A placement is valid only if every box it puts on screen stays on screen.
    const ok = (lb, tb) =>
      (tb.hidden || fitsV(tb.top, T.h)) && (lb.hidden || fitsV(lb.top, L.h));

    // label on top, toolbar beneath it, moving as one unit
    const cluster = (top, strategy, left) => {
      const at = left === undefined ? vis.left : left;
      const lb = mk(L, top, at);
      const tb = mk(T, top + stack, at);
      return ok(lb, tb) ? { strategy: strategy, label: lb, toolbar: tb } : null;
    };

    const dock = (atTop) => {
      const top = atTop ? M : Math.max(M, vh - M - clusterH);
      return cluster(top, "docked") || {
        strategy: "docked",
        label: mk(L, top, vis.left),
        toolbar: mk(T, top + stack, vis.left),
      };
    };

    // Scrolled entirely out of view — dock to the edge it disappeared behind.
    if (vis.bottom < vis.top || vis.right < vis.left) return dock(rect.bottom < 0);

    // The ordinary case, and the one that reads best: label above, actions below.
    const outsideSplit = () => {
      const lb = mk(L, vis.top - GAP - L.h, vis.left);
      const tb = mk(T, vis.bottom + GAP, vis.left);
      return ok(lb, tb) ? { strategy: "outside-split", label: lb, toolbar: tb } : null;
    };

    // Element is bigger than the viewport: hug its visible top and bottom edges.
    const insideSplit = () => {
      const lb = mk(L, vis.top + GAP, vis.left + GAP);
      const tb = mk(T, vis.bottom - GAP - T.h, vis.left + GAP);
      return ok(lb, tb) && overlapArea(lb, tb) === 0
        ? { strategy: "inside-split", label: lb, toolbar: tb } : null;
    };

    // In order of how little they intrude on the element itself.
    return (
      outsideSplit() ||
      cluster(vis.bottom + GAP, "cluster-below") ||
      cluster(vis.top - GAP - clusterH, "cluster-above") ||
      insideSplit() ||
      cluster(vis.top + GAP, "cluster-inside-top", vis.left + GAP) ||
      dock(false)
    );
  }

  // Widths are locked after layout so the buttons don't shift when a label
  // swaps to "COPIED"; they have to be cleared first or we re-measure the lock.
  function lockButtonWidths() {
    if (!toolbarEl) return;
    const buttons = toolbarEl.querySelectorAll("button");
    for (const button of buttons) button.style.minWidth = "";
    for (const button of buttons) button.style.minWidth = button.offsetWidth + "px";
  }

  // Below the breakpoint the buttons collapse to icons, which changes their
  // natural width — so the locks have to be recomputed when it flips.
  function updateToolbarDensity(vw) {
    if (!toolbarEl) return;
    const narrow = vw < GEOMETRY.narrowToolbar;
    if (toolbarEl.classList.contains("ccp-compact") === narrow) return;
    toolbarEl.classList.toggle("ccp-compact", narrow);
    lockButtonWidths();
  }

  // `instant` skips the glide on both boxes — for viewport tracking, where
  // animating would smear the chrome across the screen as you scroll.
  // `newToolbar` skips it on the toolbar alone: a toolbar that was just created
  // has no previous position worth animating from, while the label does and
  // should glide from wherever hover left it.
  function layoutChrome(el, options) {
    if (!labelEl || !el) return;

    const instant = !!(options && options.instant);
    const toolbarInstant = instant || !!(options && options.newToolbar);
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;

    updateToolbarDensity(vw);

    // Measure at natural size. The label has to be shown to be measurable — a
    // pass that hid it must not leave it unmeasurable, or it could never come
    // back when the viewport grows — and a max-height left over from an earlier
    // pass would be mistaken for its real height.
    labelEl.style.display = "block";
    labelEl.style.maxHeight = "";
    labelEl.style.overflow = "";
    const label = { w: labelEl.offsetWidth, h: labelEl.offsetHeight };
    const toolbar = toolbarEl ? { w: toolbarEl.offsetWidth, h: toolbarEl.offsetHeight } : null;

    const layout = computeChromeLayout(el.getBoundingClientRect(), label, toolbar, vw, vh);

    if (instant) labelEl.classList.add("ccp-no-transition");
    if (toolbarInstant && toolbarEl) toolbarEl.classList.add("ccp-no-transition");

    labelEl.style.display = layout.label.hidden ? "none" : "block";
    if (!layout.label.hidden) {
      labelEl.style.top = layout.label.top + "px";
      labelEl.style.left = layout.label.left + "px";
      // Only clip when the label actually had to give up height — Clawd walks
      // outside the box, so overflow stays visible in every ordinary case.
      if (layout.label.h < label.h) {
        labelEl.style.maxHeight = layout.label.h + "px";
        labelEl.style.overflow = "hidden";
      }
    }

    if (toolbarEl) {
      toolbarEl.style.top = layout.toolbar.top + "px";
      toolbarEl.style.left = layout.toolbar.left + "px";
    }

    if (instant || toolbarInstant) {
      void labelEl.offsetWidth; // flush the jump before re-enabling the glide
      labelEl.classList.remove("ccp-no-transition");
      if (toolbarEl) toolbarEl.classList.remove("ccp-no-transition");
    }

    // Last, once both boxes are where they finally sit: hide the gear if either
    // one landed on top of it.
    updateSettingsButtonVisibility();
  }

  function updateLabel(el, rect) {
    if (!labelEl) return;

    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : "";
    const classes = Array.from(el.classList)
      .filter((c) => !c.startsWith("ccp-"))
      .slice(0, 3)
      .map((c) => `.${c}`)
      .join("");
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    const style = getComputedStyle(el);

    // Line 1: tag, id, classes, dimensions
    let line1 =
      `<span class="ccp-label-tag">${tag}</span>` +
      (id ? `<span class="ccp-label-id">${id}</span>` : "") +
      (classes ? `<span class="ccp-label-class">${classes}</span>` : "") +
      `<span class="ccp-label-size">${w} x ${h}</span>`;

    const elHasText = hasDirectText(el);

    // Text preview line: first ~40 chars of direct text content
    let lineT = "";
    if (elHasText) {
      const text = getDirectText(el);
      const preview = text.length > 40 ? text.slice(0, 40) + "\u2026" : text;
      const escaped = preview.replace(/[&<>"']/g, (ch) => (
        { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
      ));
      lineT = `<div class="ccp-label-line ccp-line-text"><span class="ccp-label-text">"${escaped}"</span></div>`;
    }

    // Line 2: key computed properties
    const props = [];
    const display = style.display;
    const position = style.position;
    if (display && display !== "block") props.push(display);
    if (position && position !== "static") props.push(`pos:${position}`);
    // Font props only when element has direct text content
    if (elHasText) {
      if (style.fontSize) props.push(style.fontSize);
      if (style.fontWeight && style.fontWeight !== "400" && style.fontWeight !== "normal") {
        props.push(`w:${style.fontWeight}`);
      }
    }
    // Accessibility hints
    const role = el.getAttribute("role");
    if (role) props.push(`role="${role}"`);
    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel) props.push(`aria="${ariaLabel.slice(0, 20)}"`);
    // Children count for containers
    const childCount = el.children.length;
    if (childCount > 0) props.push(`${childCount} child${childCount > 1 ? "ren" : ""}`);

    let line2 = "";
    if (props.length > 0) {
      line2 = `<div class="ccp-label-line ccp-line-meta"><span class="ccp-label-prop">${props.join('<span class="ccp-label-sep"> · </span>')}</span></div>`;
    }

    // Visual line: background, text color, border, radius, shadow, opacity, cursor, transform, z-index
    const visuals = [];

    // Background color
    const bg = style.backgroundColor;
    if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") {
      visuals.push(`bg:${colorSwatch(bg)}${formatColor(bg)}`);
    }

    // Text color (only when element has direct text)
    if (elHasText && style.color) {
      visuals.push(`color:${colorSwatch(style.color)}${formatColor(style.color)}`);
    }

    // Border (stroke)
    const bw = {
      top: parseFloat(style.borderTopWidth) || 0,
      right: parseFloat(style.borderRightWidth) || 0,
      bottom: parseFloat(style.borderBottomWidth) || 0,
      left: parseFloat(style.borderLeftWidth) || 0,
    };
    const anyBorderWidth = bw.top || bw.right || bw.bottom || bw.left;
    if (anyBorderWidth && style.borderTopStyle !== "none") {
      const allWidthsEqual = bw.top === bw.right && bw.right === bw.bottom && bw.bottom === bw.left;
      const allStylesEqual =
        style.borderTopStyle === style.borderRightStyle &&
        style.borderRightStyle === style.borderBottomStyle &&
        style.borderBottomStyle === style.borderLeftStyle;
      const allColorsEqual =
        style.borderTopColor === style.borderRightColor &&
        style.borderRightColor === style.borderBottomColor &&
        style.borderBottomColor === style.borderLeftColor;
      if (allWidthsEqual && allStylesEqual && allColorsEqual) {
        visuals.push(
          `border:${bw.top}px ${style.borderTopStyle} ${colorSwatch(style.borderTopColor)}${formatColor(style.borderTopColor)}`
        );
      } else {
        visuals.push(`border:${bw.top}/${bw.right}/${bw.bottom}/${bw.left}px`);
      }
    }

    // Border radius
    const radii = [
      style.borderTopLeftRadius,
      style.borderTopRightRadius,
      style.borderBottomRightRadius,
      style.borderBottomLeftRadius,
    ];
    if (radii.some((v) => v && v !== "0px")) {
      const allSame = radii.every((v) => v === radii[0]);
      visuals.push(allSame ? `radius:${radii[0]}` : `radius:${radii.join(" ")}`);
    }

    // Box shadow
    if (style.boxShadow && style.boxShadow !== "none") {
      visuals.push(`shadow:${formatShadow(style.boxShadow)}`);
    }

    // Opacity (when < 1)
    const opacity = parseFloat(style.opacity);
    if (!Number.isNaN(opacity) && opacity < 1) {
      visuals.push(`opacity:${opacity}`);
    }

    // Cursor (read without probe-mode override)
    const cursor = getRealCursor(el);
    if (cursor && cursor !== "auto" && cursor !== "default") {
      visuals.push(`cursor:${cursor}`);
    }

    // Transform (when present)
    if (style.transform && style.transform !== "none") {
      visuals.push(`transform:${style.transform}`);
    }

    // Z-index (when explicitly set)
    if (style.zIndex && style.zIndex !== "auto") {
      visuals.push(`z:${style.zIndex}`);
    }

    let lineV = "";
    if (visuals.length > 0) {
      lineV = `<div class="ccp-label-line ccp-line-visual"><span class="ccp-label-prop">${visuals.join('<span class="ccp-label-sep"> · </span>')}</span></div>`;
    }

    // Line 3: breadcrumb path (up to 4 ancestors)
    const crumbs = [];
    let ancestor = el.parentElement;
    while (ancestor && ancestor !== document.documentElement && crumbs.length < 4) {
      const aTag = ancestor.tagName.toLowerCase();
      const aId = ancestor.id ? `#${ancestor.id}` : "";
      const aClass = Array.from(ancestor.classList)
        .filter((c) => !c.startsWith("ccp-"))
        .slice(0, 1)
        .map((c) => `.${c}`)
        .join("");
      crumbs.unshift(aTag + aId + aClass);
      if (ancestor.id) break; // ID is unique enough, stop
      ancestor = ancestor.parentElement;
    }
    let line3 = "";
    if (crumbs.length > 0) {
      const path = crumbs.join('<span class="ccp-label-sep"> › </span>');
      line3 = `<div class="ccp-label-line ccp-label-marquee ccp-line-breadcrumb"><span class="ccp-label-breadcrumb ccp-marquee-inner">${path}<span class="ccp-label-sep">&nbsp;&nbsp;&nbsp;·&nbsp;&nbsp;&nbsp;</span>${path}</span></div>`;
    }

    // Preserve Clawd mascot, update only the content wrapper
    let contentWrap = labelEl.querySelector(".ccp-label-content");
    if (!contentWrap) {
      contentWrap = document.createElement("div");
      contentWrap.className = "ccp-label-content";
      labelEl.appendChild(contentWrap);
    }
    contentWrap.innerHTML =
      `<div class="ccp-label-line ccp-line-identity">${line1}</div>` + lineT + line2 + lineV + line3;

    // Visible so it can be measured; layoutChrome does the placing.
    labelEl.style.display = "block";
  }

  // ===== Redline =====
  // Held-Option spacing measurements between the selected element and the
  // element under the cursor, Figma-style: solid accent lines across each gap
  // with a px readout, dashed guides extending an edge when the two boxes
  // don't align. The label and toolbar hush while the key is down (CSS, via
  // .ccp-redlining on <html>) so the page around the selection stays readable.

  // Pure, like computeChromeLayout() and for the same reason — test/redline.mjs
  // mirrors it and sweeps it with no DOM. Rects are {top,left,width,height}
  // (a DOMRect works); output is a paint-ordered list of primitives in
  // viewport coordinates that renderRedline() writes into pooled nodes:
  //   {kind:"line",  x, y, w, h, value}  solid segment; w or h is 0
  //   {kind:"guide", x, y, w, h}         dashed segment along a hov edge
  //   {kind:"pill",  x, y, value}        px readout; (x,y) is the pill CENTER
  // `value` is the raw fractional px distance — the renderer formats it.
  // `opts` is how user preferences enter without breaking purity:
  //   pillOffset — perpendicular pill offset (0 = the pill rides its line)
  //   guides     — emit dashed extension guides on diagonal measurements
  //   zeroPills  — emit a pill for flush (sub-half-pixel) edges
  function computeRedline(sel, hov, vw, vh, opts) {
    const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
    const s = { l: sel.left, t: sel.top, r: sel.left + sel.width, b: sel.top + sel.height };
    const h = { l: hov.left, t: hov.top, r: hov.left + hov.width, b: hov.top + hov.height };

    // Per-axis relation between the two intervals: a gap carries the span
    // between the facing edges plus which hov edge faces it; an overlap
    // carries the shared region.
    const relate = (sLo, sHi, hLo, hHi) => {
      if (hLo >= sHi) return { gap: true, lo: sHi, hi: hLo, hovEdge: hLo };
      if (sLo >= hHi) return { gap: true, lo: hHi, hi: sLo, hovEdge: hHi };
      return { gap: false, lo: Math.max(sLo, hLo), hi: Math.min(sHi, hHi) };
    };
    const x = relate(s.l, s.r, h.l, h.r);
    const y = relate(s.t, s.b, h.t, h.b);

    const lines = [];
    const guides = [];
    const pills = [];

    // One measurement along `axis` ("x" = a horizontal segment) from lo to hi
    // at the given cross coordinate. A flush edge (distance rounding to zero —
    // nothing to draw a line across) keeps its pill unless zeroPills is off.
    // Values stay fractional; the renderer's formatter decides the readout.
    // Returns 0 for flush measurements so the guide check can gate on it.
    const measure = (axis, lo, hi, cross) => {
      const value = hi - lo;
      const flush = Math.round(value) === 0;
      const mid = (lo + hi) / 2;
      if (!flush) {
        lines.push(axis === "x"
          ? { kind: "line", x: lo, y: cross, w: value, h: 0, value }
          : { kind: "line", x: cross, y: lo, w: 0, h: value, value });
      }
      // Pill hangs perpendicular to its line (below / to the right), clamped
      // into the viewport so a measurement to an offscreen box stays readable.
      if (!flush || opts.zeroPills) {
        const m = GEOMETRY.redlinePillMargin;
        pills.push({
          kind: "pill",
          x: clamp(axis === "x" ? mid : cross + opts.pillOffset, m, vw - m),
          y: clamp(axis === "x" ? cross + opts.pillOffset : mid, m, vh - m),
          value,
        });
      }
      return flush ? 0 : value;
    };

    if (x.gap || y.gap) {
      // Separated (one axis gapped) or diagonal (both). One measurement per
      // gapped axis, at the selected element's center — clamped into the shared
      // region when the cross axis overlaps, which lands both endpoints on real
      // edges. When it doesn't (diagonal), the line floats at sel's center and
      // a dashed guide extends hov's facing edge out to meet it.
      if (x.gap) {
        const cy = y.gap ? (s.t + s.b) / 2 : clamp((s.t + s.b) / 2, y.lo, y.hi);
        const value = measure("x", x.lo, x.hi, cy);
        if (y.gap && opts.guides && value > 0) {
          const corner = cy < h.t ? h.t : h.b;
          const past = cy + (cy < h.t ? -1 : 1) * GEOMETRY.redlineGuideOvershoot;
          guides.push({
            kind: "guide",
            x: x.hovEdge,
            y: Math.min(corner, past),
            w: 0,
            h: Math.abs(corner - past),
          });
        }
      }
      if (y.gap) {
        const cx = x.gap ? (s.l + s.r) / 2 : clamp((s.l + s.r) / 2, x.lo, x.hi);
        const value = measure("y", y.lo, y.hi, cx);
        if (x.gap && opts.guides && value > 0) {
          const corner = cx < h.l ? h.l : h.r;
          const past = cx + (cx < h.l ? -1 : 1) * GEOMETRY.redlineGuideOvershoot;
          guides.push({
            kind: "guide",
            x: Math.min(corner, past),
            y: y.hovEdge,
            w: Math.abs(corner - past),
            h: 0,
          });
        }
      }
    } else {
      // Both axes overlap. Containment and partial overlap take the same rule:
      // per axis, measure the two same-side edge pairs. For a contained box
      // that degenerates to exactly the four insets; never any guides, because
      // the clamped cross coordinate always lies inside both spans.
      const cy = clamp((s.t + s.b) / 2, y.lo, y.hi);
      const cx = clamp((s.l + s.r) / 2, x.lo, x.hi);
      measure("x", Math.min(s.l, h.l), Math.max(s.l, h.l), cy);
      measure("x", Math.min(s.r, h.r), Math.max(s.r, h.r), cy);
      measure("y", Math.min(s.t, h.t), Math.max(s.t, h.t), cx);
      measure("y", Math.min(s.b, h.b), Math.max(s.b, h.b), cx);
    }

    return [...lines, ...guides, ...pills];
  }

  function clearRedline() {
    if (redlineHoverEl) redlineHoverEl.style.opacity = "0";
    for (const arr of [redlineLineEls, redlineGuideEls, redlinePillEls]) {
      for (const node of arr) node.style.opacity = "0";
    }
  }

  // Formats a solver distance for the pill readout — the one place px leaves
  // the geometry. remBase is the page's root font-size, read once per frame.
  // Mirrored in settings/settings.js for the preview rail; change both.
  function formatRedlineValue(px, unit, precision, remBase) {
    if (unit === "rem") {
      return (px / remBase).toFixed(2).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "") + "rem";
    }
    if (precision === "tenths") {
      return (Math.round(px * 10) / 10).toFixed(1).replace(/\.0$/, "");
    }
    return String(Math.round(px));
  }

  // One frame of redline paint. Nodes glide between hover targets on the same
  // curve as the selection overlay; three cases snap instead of gliding:
  //   - options.instant (scroll/resize): measurements must track the page
  //     rigidly, exactly like updateOverlay's instant mode
  //   - a node fading back in: it would otherwise fly in from its stale spot
  //   - a guide changing orientation: -h to -v is a new shape, not a move
  // Snapped nodes take .ccp-no-transition, every write lands, one flush
  // commits the jumps, the class lifts, and opacity fades the rest in place.
  function renderRedline(options) {
    if (!redlining || !selectedElement || !redlineEl) return;
    const hov = redlineTarget;
    // Hovering the selection itself measures nothing; the chrome stays hushed
    // (the key is still down) but every measurement node goes dark.
    if (!hov || hov === selectedElement || !hov.isConnected) {
      clearRedline();
      return;
    }

    const instant = !!(options && options.instant);
    const selRect = selectedElement.getBoundingClientRect();
    const hovRect = hov.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const prims = computeRedline(selRect, hovRect, vw, vh, {
      pillOffset: redlinePrefs.redlinePillPlacement === "online" ? 0 : GEOMETRY.redlinePillOffset,
      guides: redlinePrefs.redlineGuides === "on",
      zeroPills: redlinePrefs.redlineZeroPills === "on",
    });
    const remBase = redlinePrefs.redlineUnit === "rem"
      ? parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
      : 16;

    const used = new Set();
    const snapped = [];
    // Rounded so 1px strokes land on device pixels instead of straddling two.
    // Pills pass w = null: they size to their text, only their center moves.
    const place = (node, x, y, w, h, reshape) => {
      used.add(node);
      if (instant || reshape || node.style.opacity !== "1") {
        node.classList.add("ccp-no-transition");
        snapped.push(node);
      }
      node.style.left = Math.round(x) + "px";
      node.style.top = Math.round(y) + "px";
      if (w !== null) {
        node.style.width = Math.max(0, Math.round(w)) + "px";
        node.style.height = Math.max(0, Math.round(h)) + "px";
      }
    };

    // The hover box carries the hovered element's own corner radii, exactly as
    // the selection overlay does (square elements share the same px fallback),
    // and morphs between them via the border-radius transition.
    applyRadii(redlineHoverEl, readRadii(hov), 0);
    place(redlineHoverEl, hovRect.left, hovRect.top, hovRect.width, hovRect.height, false);

    let li = 0;
    let gi = 0;
    let pi = 0;
    for (const p of prims) {
      if (p.kind === "line" && li < redlineLineEls.length) {
        // Zero-thickness axis renders as a 1px stroke
        place(redlineLineEls[li++], p.x, p.y, Math.max(p.w, 1), Math.max(p.h, 1), false);
      } else if (p.kind === "guide" && gi < redlineGuideEls.length) {
        const node = redlineGuideEls[gi++];
        // Horizontal guides dash via border-top, vertical via border-left.
        // className must land before place() so it can't wipe the snap class.
        const cls = p.h === 0 ? "ccp-redline-guide-h" : "ccp-redline-guide-v";
        const reshape = !node.classList.contains(cls);
        node.className = cls;
        place(node, p.x, p.y, p.w, p.h, reshape);
      } else if (p.kind === "pill" && pi < redlinePillEls.length) {
        const node = redlinePillEls[pi++];
        node.textContent = formatRedlineValue(
          p.value, redlinePrefs.redlineUnit, redlinePrefs.redlinePrecision, remBase
        );
        place(node, p.x, p.y, null, null, false);
      }
    }

    if (snapped.length) {
      void redlineEl.offsetWidth; // flush the jumps before re-enabling the glide
      for (const node of snapped) node.classList.remove("ccp-no-transition");
    }
    for (const node of used) node.style.opacity = "1";
    for (const arr of [redlineLineEls, redlineGuideEls, redlinePillEls]) {
      for (const node of arr) {
        if (!used.has(node)) node.style.opacity = "0";
      }
    }
  }

  function scheduleRedline() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      if (redlining && probeActive) renderRedline();
    });
  }

  function startRedline() {
    if (redlining || !probeActive || !selectedElement) return;
    redlining = true;
    // The class must land before the target resolves: it turns the label and
    // toolbar visibility:hidden, which drops them out of elementFromPoint, so
    // the page underneath them becomes measurable immediately.
    document.documentElement.classList.add("ccp-redlining");
    applyRedlineQuiet();
    redlineTarget = lastMouseX < 0
      ? null
      : getTargetElement({ clientX: lastMouseX, clientY: lastMouseY }, null);
    updateSettingsButtonVisibility();
    scheduleRedline();
  }

  function stopRedline() {
    if (!redlining) return;
    redlining = false;
    redlineTarget = null;
    document.documentElement.classList.remove("ccp-redlining");
    applyRedlineQuiet();
    clearRedline();
    // Label and toolbar reappear where layoutChrome kept them all along; the
    // gear re-checks its collision against the now-visible chrome.
    updateSettingsButtonVisibility();
  }

  // ===== Tether =====
  // Edit Mode's association chrome: what says "this panel edits that element"
  // once the selection ring has been taken away.
  //
  // The ring had to go. It is drawn 2px outside the element, and the panel
  // writes border-width, border-color, border-radius and box-shadow — so the
  // one piece of chrome guaranteed to be on screen sat exactly on top of the
  // four things being judged. You cannot read a 2px stroke through an accent
  // stroke. "Which element" is already settled by the time the panel is open;
  // "what does it look like now" is the open question, and the ring was
  // answering the wrong one.
  //
  // What replaces it works only in the ring of space OUTSIDE the element:
  //
  //   · four ticks, one at each edge's midpoint, sitting tetherGap out. The
  //     midpoint is the point on an edge furthest from any corner, which is
  //     where radius work needs the room. Four points imply the rectangle
  //     without tracing it, so the extent survives without a box.
  //   · one dashed run from the panel to the tick on the facing edge, turning
  //     once. Dashed because that is Redline's guide vocabulary and this is the
  //     same kind of statement; solid ticks against a dashed run also say which
  //     end is the subject and which is the reference.
  //
  // Chosen from twelve alternatives in test/edit-association-prototypes.html —
  // a synthesis of 02 (elbow tether) and 07 (edge ticks), which turn out to be
  // one idea: the run's terminal IS a tick.
  //
  // computeTether is pure, like computeChromeLayout and computeRedline, and is
  // transcribed into test/tether.mjs. Viewport coordinates in, paint rects out,
  // no DOM.

  // Which edge of `r` faces (tx, ty), and the outward normal of that edge.
  // Weighted by the rect's aspect so a wide rect prefers its long edges, then
  // slid along the edge toward the target: pinning to the midpoint makes a tall
  // panel reach out from far below a short element, which reads as two
  // unrelated things joined by a detour.
  function tetherSide(r, tx, ty, inset) {
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const slide = (lo, len, v) => {
      const i = Math.min(inset, Math.max(0, len / 2 - 1));
      return Math.max(lo + i, Math.min(lo + len - i, v));
    };
    if (Math.abs(tx - cx) * r.h >= Math.abs(ty - cy) * r.w) {
      const y = slide(r.y, r.h, ty);
      return tx >= cx
        ? { x: r.x + r.w, y, nx: 1, ny: 0 }
        : { x: r.x, y, nx: -1, ny: 0 };
    }
    const x = slide(r.x, r.w, tx);
    return ty >= cy
      ? { x, y: r.y + r.h, nx: 0, ny: 1 }
      : { x, y: r.y, nx: 0, ny: -1 };
  }

  // Does the axis-aligned segment a→b touch `box`? Segments are strokes, not
  // areas, so this is a plain interval overlap on both axes.
  function tetherSegHits(a, b, box) {
    const x0 = Math.min(a.x, b.x);
    const x1 = Math.max(a.x, b.x);
    const y0 = Math.min(a.y, b.y);
    const y1 = Math.max(a.y, b.y);
    return x1 > box.x && x0 < box.x + box.w && y1 > box.y && y0 < box.y + box.h;
  }

  // An L from a to b turning at `corner`, as up to two axis-aligned rects.
  // Collinear runs collapse to one segment rather than emitting a zero-length
  // stub that would render as a stray dot.
  function tetherLeg(a, b, corner) {
    const segs = [];
    const push = (p, q) => {
      const w = Math.abs(q.x - p.x);
      const h = Math.abs(q.y - p.y);
      if (w < 0.5 && h < 0.5) return;
      segs.push({ x: Math.min(p.x, q.x), y: Math.min(p.y, q.y), w, h });
    };
    push(a, corner);
    push(corner, b);
    return segs;
  }

  // rect: the element. panel: the edit panel. Both viewport-relative.
  function computeTether(rect, panel, vw, vh, opts) {
    const o = opts || {};
    const gap = o.gap !== undefined ? o.gap : GEOMETRY.tetherGap;
    const len = o.tick !== undefined ? o.tick : GEOMETRY.tetherTick;
    const th = o.thick !== undefined ? o.thick : GEOMETRY.tetherThick;

    // The box nothing may enter: the element plus its clearance.
    const box = {
      x: rect.left - gap,
      y: rect.top - gap,
      w: rect.width + gap * 2,
      h: rect.height + gap * 2,
    };
    const bcx = box.x + box.w / 2;
    const bcy = box.y + box.h / 2;

    // Ticks are centred on each edge midpoint, lying ALONG the edge. A tick
    // that stuck out perpendicular would reach back toward the element as the
    // element grew; lying flat, it can only ever be tangent to the clearance.
    const half = len / 2;
    const ht = th / 2;
    const ticks = [
      { x: bcx - half, y: box.y - ht, w: len, h: th },
      { x: bcx - half, y: box.y + box.h - ht, w: len, h: th },
      { x: box.x - ht, y: bcy - half, w: th, h: len },
      { x: box.x + box.w - ht, y: bcy - half, w: th, h: len },
    ];

    const result = { box, ticks, segs: [] };
    if (!panel) return result;

    // A run bridges distance. When the panel overlaps the element's clearance
    // there is no distance to bridge, and any run would have to start inside
    // the overlap and cross what it is pointing at. The ticks say it instead.
    // This is common rather than exotic: placeEditPanel() anchors the panel to
    // the element, so a tall panel beside a short element starts out on top of
    // it, and only a drag separates them.
    if (panel.x < box.x + box.w && panel.x + panel.w > box.x &&
        panel.y < box.y + box.h && panel.y + panel.h > box.y) return result;

    const a = tetherSide(panel, bcx, bcy, GEOMETRY.tetherStub);
    // The far end is the midpoint of whichever edge faces the panel — no
    // sliding here, because that midpoint is a tick, and the run has to land on
    // the tick rather than near it.
    const s = tetherSide(box, a.x, a.y, Infinity);
    const b = { x: s.x, y: s.y };

    // Turn at the TICK's outward coordinate, not the panel's. Both legs then
    // lie on the far side of the tick from the element, so neither can enter
    // the box — the property test/tether.mjs sweeps. The mirror L (turning at
    // the panel's coordinate) is the fallback for the configurations where the
    // first would clip, and if both clip the ticks stand alone.
    const first = s.nx !== 0 ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
    const other = s.nx !== 0 ? { x: a.x, y: b.y } : { x: b.x, y: a.y };
    for (const corner of [first, other]) {
      if (tetherSegHits(a, corner, box) || tetherSegHits(corner, b, box)) continue;
      result.segs = tetherLeg(a, b, corner);
      break;
    }
    return result;
  }

  // Paint it. The pooling, the per-node snap-vs-glide decision, the `used` Set
  // and the single reflow flush are renderRedline()'s, for the same reasons.
  function renderTether(options) {
    if (!editing || !selectedElement || !tetherEl) return;
    if (!selectedElement.isConnected) {
      clearTether();
      return;
    }

    const instant = !!(options && options.instant);
    const rect = selectedElement.getBoundingClientRect();
    const panel = editPanelEl && editPanelPos
      ? { x: editPanelPos.left, y: editPanelPos.top, w: editPanelEl.offsetWidth, h: editPanelEl.offsetHeight }
      : null;

    const layout = computeTether(
      rect, panel,
      document.documentElement.clientWidth,
      document.documentElement.clientHeight,
      { tick: tetherLoud ? GEOMETRY.tetherTickLoud : GEOMETRY.tetherTick }
    );

    const used = new Set();
    const snapped = [];
    const place = (node, r) => {
      used.add(node);
      if (instant || node.style.opacity !== "1") {
        node.classList.add("ccp-no-transition");
        snapped.push(node);
      }
      node.style.left = Math.round(r.x) + "px";
      node.style.top = Math.round(r.y) + "px";
      node.style.width = Math.max(0, Math.round(r.w)) + "px";
      node.style.height = Math.max(0, Math.round(r.h)) + "px";
    };

    layout.ticks.forEach((t, i) => {
      if (i < tetherTickEls.length) place(tetherTickEls[i], t);
    });
    layout.segs.forEach((s, i) => {
      if (i >= tetherSegEls.length) return;
      const node = tetherSegEls[i];
      // Horizontal runs dash via border-top, vertical via border-left, exactly
      // as the redline guides do. The class has to land before place() so it
      // cannot wipe the snap class.
      const cls = s.h === 0 ? "ccp-tether-seg ccp-tether-seg-h" : "ccp-tether-seg ccp-tether-seg-v";
      if (node.className !== cls) {
        node.className = cls;
        node.classList.add("ccp-no-transition");
        if (!snapped.includes(node)) snapped.push(node);
      }
      place(node, s);
    });

    if (snapped.length) {
      void tetherEl.offsetWidth; // flush the jumps before re-enabling the glide
      for (const node of snapped) node.classList.remove("ccp-no-transition");
    }
    for (const node of used) node.style.opacity = "1";
    for (const arr of [tetherTickEls, tetherSegEls]) {
      for (const node of arr) {
        if (!used.has(node)) node.style.opacity = "0";
      }
    }
  }

  function clearTether() {
    for (const arr of [tetherTickEls, tetherSegEls]) {
      for (const node of arr) node.style.opacity = "0";
    }
  }

  // Quiet by default, amplified while a control is live: a row under the
  // pointer, an open gesture, or the beat just after a value lands. The ticks
  // lengthen and the run brightens; nothing moves closer to the element.
  function setTetherLoud(on) {
    if (tetherLoud === on) return;
    tetherLoud = on;
    document.documentElement.classList.toggle("ccp-tether-loud", on);
    renderTether();
  }

  // A committed value goes loud for a beat and settles, so a change you made
  // without touching the panel (a token step, an undo) still announces itself.
  function bumpTether() {
    clearTimeout(tetherLoudTimer);
    setTetherLoud(true);
    tetherLoudTimer = setTimeout(() => {
      if (!editGesture && !(editPanelEl && editPanelEl.querySelector(".ccp-edit-row:hover"))) {
        setTetherLoud(false);
      }
    }, 700);
  }

  // ===== Edit Tokens =====
  // Reverse-lookup: given an element and a property, which design token is the
  // value sitting on — a utility class (text-lg, p-4) or a custom property
  // (var(--title-sm))? Knowing that turns a scrub into a step along the page's
  // own scale, and lets the delta block name the token instead of a pixel
  // count, which is what the source actually contains.
  //
  // The rule throughout: only claim a token when its resolved value equals the
  // computed value. A wrong claim would send Claude Code editing a token that
  // isn't there, so no-match reports raw px and the panel falls back to a plain
  // scrub. The pure half is transcribed into test/edit-tokens.mjs — change it
  // there and change it here.

  // Scale steps a family name can end in. Numeric tails (500, 1.5) are handled
  // separately; these are the word-shaped ones, ordered longest-first so "2xl"
  // is not read as the number 2.
  const SCALE_WORDS = [
    "3xs", "2xs", "xs", "sm", "md", "base", "lg", "xl", "2xl", "3xl", "4xl",
    "5xl", "6xl", "7xl", "8xl", "9xl",
    "none", "full", "tight", "snug", "normal", "relaxed", "loose",
    "thin", "light", "regular", "medium", "semibold", "bold", "extrabold", "black",
  ];

  // "16px" → 16. rem/em resolve against the roots the caller measured. Anything
  // whose value depends on layout (%, calc, nested var, auto) is null: it cannot
  // be compared against a computed pixel value, so it never becomes a token.
  function parseCssLength(value, remBase, emBase) {
    if (typeof value !== "string") return null;
    const s = value.trim().toLowerCase();
    if (s === "0") return 0;
    const m = s.match(/^(-?[\d.]+)(px|rem|em)$/);
    if (!m) return null;
    const n = parseFloat(m[1]);
    if (!isFinite(n)) return null;
    if (m[2] === "px") return n;
    if (m[2] === "rem") return typeof remBase === "number" ? n * remBase : null;
    return typeof emBase === "number" ? n * emBase : null;
  }

  // [id, class, type] counts, per CSS Selectors 4 §17. Needed because the
  // element's value comes from whichever rule wins, and only that rule's text
  // can tell us whether a var() is involved.
  function computeSpecificity(selector) {
    if (typeof selector !== "string") return [0, 0, 0];

    // Functional pseudo-classes first: their arguments count, but by their own
    // rules — :where() contributes nothing, :is()/:not()/:has() contribute
    // their most specific argument.
    let s = selector;
    let carried = [0, 0, 0];
    const fn = /:(where|is|not|has|matches|any)\(/gi;
    let guard = 0;
    for (;;) {
      fn.lastIndex = 0;
      const m = fn.exec(s);
      if (!m || guard++ > 32) break;
      // Walk to the matching close paren so nested functions survive.
      let depth = 1, i = m.index + m[0].length;
      for (; i < s.length && depth > 0; i++) {
        if (s[i] === "(") depth++;
        else if (s[i] === ")") depth--;
      }
      const inner = s.slice(m.index + m[0].length, i - 1);
      if (m[1].toLowerCase() !== "where") {
        for (const branch of inner.split(",")) {
          const b = computeSpecificity(branch);
          if (b[0] > carried[0] ||
              (b[0] === carried[0] && b[1] > carried[1]) ||
              (b[0] === carried[0] && b[1] === carried[1] && b[2] > carried[2])) {
            carried = b;
          }
        }
      }
      s = s.slice(0, m.index) + " " + s.slice(i);
    }

    // Attribute values can contain anything, including "#" and "."; blank them
    // before counting, keeping the brackets so the selector still counts as one.
    s = s.replace(/\[[^\]]*\]/g, "[]");
    // Pseudo-elements count as type selectors and must not be seen as classes.
    const pseudoElements = (s.match(/::[\w-]+/g) || []).length;
    s = s.replace(/::[\w-]+/g, " ");

    const ids = (s.match(/#[\w-]+/g) || []).length;
    const classes = (s.match(/\.[\w-]+/g) || []).length;
    const attrs = (s.match(/\[\]/g) || []).length;
    const pseudoClasses = (s.match(/:[\w-]+/g) || []).length;
    // Type selectors: a bare name at the start or after a combinator/space.
    const types = (s.match(/(^|[\s>+~(,])([a-z][\w-]*)/gi) || []).length;

    return [
      ids + carried[0],
      classes + attrs + pseudoClasses + carried[1],
      types + pseudoElements + carried[2],
    ];
  }

  function compareSpecificity(a, b) {
    for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
    return 0;
  }

  // "text-lg" → { prefix: "text", step: "lg" }, "--space-4" → { prefix:
  // "--space", step: "4" }, "brand" → null. The step is the last dash-separated
  // segment when it looks like a scale position; everything before it names the
  // family. Tailwind's fractional steps (p-1.5) and numeric ramps (blue-500)
  // both land in the numeric branch.
  function splitTokenName(name) {
    if (typeof name !== "string") return null;
    const cut = name.lastIndexOf("-");
    // A leading "--" is the custom-property sigil, not a separator.
    if (cut <= 0 || (name.startsWith("--") && cut < 3)) return null;
    const step = name.slice(cut + 1);
    const prefix = name.slice(0, cut);
    if (!step) return null;
    const numeric = /^\d+(\.\d+)?$/.test(step);
    if (!numeric && !SCALE_WORDS.includes(step.toLowerCase())) return null;
    return { prefix, step };
  }

  // [{ name, resolved }] → [{ prefix, members: [{ name, step, resolved }] }]
  // sorted by resolved value. Families of one are dropped: a scale you cannot
  // step along is not a scale, and offering a stepper for it would be a lie.
  function groupTokenFamilies(entries) {
    const byPrefix = new Map();
    for (const e of entries || []) {
      if (!e || typeof e.resolved !== "number" || !isFinite(e.resolved)) continue;
      const split = splitTokenName(e.name);
      if (!split) continue;
      if (!byPrefix.has(split.prefix)) byPrefix.set(split.prefix, []);
      byPrefix.get(split.prefix).push({ name: e.name, step: split.step, resolved: e.resolved });
    }

    const families = [];
    for (const [prefix, members] of byPrefix) {
      // Same name twice (two sheets, same token) keeps the first resolution.
      const seen = new Set();
      const unique = members.filter((m) => (seen.has(m.name) ? false : seen.add(m.name)));
      if (unique.length < 2) continue;
      unique.sort((a, b) => a.resolved - b.resolved || a.name.localeCompare(b.name));
      families.push({ prefix, members: unique });
    }
    families.sort((a, b) => a.prefix.localeCompare(b.prefix));
    return families;
  }

  // Which member sits exactly on this value? Sub-pixel tolerance only — a
  // half-pixel is rounding, a whole pixel is a different token.
  function matchToken(members, resolved, tolerance) {
    if (!members || typeof resolved !== "number") return null;
    const tol = typeof tolerance === "number" ? tolerance : 0.5;
    let best = null, bestD = Infinity;
    for (const m of members) {
      const d = Math.abs(m.resolved - resolved);
      if (d <= tol && d < bestD) { best = m; bestD = d; }
    }
    return best;
  }

  // One rung up or down, clamped at the ends. Off-scale values step to the
  // neighbour in the direction of travel, so a stepper always does something
  // predictable even when the current value is between rungs.
  function stepToken(members, resolved, dir) {
    if (!members || members.length === 0) return null;
    const exact = matchToken(members, resolved);
    if (exact) {
      const i = members.indexOf(exact);
      const next = Math.min(members.length - 1, Math.max(0, i + (dir > 0 ? 1 : -1)));
      return members[next];
    }
    if (dir > 0) return members.find((m) => m.resolved > resolved) || members[members.length - 1];
    for (let i = members.length - 1; i >= 0; i--) {
      if (members[i].resolved < resolved) return members[i];
    }
    return members[0];
  }

  // --- DOM-bound half ---
  // Everything below reads the page. It runs once per Edit Mode entry and the
  // result is cached in tokenIndex, so a heavy stylesheet is paid for once.

  // Single-class rules are what a utility framework is made of. Anything more
  // specific belongs to the page's own design and stepping it would edit
  // unrelated elements.
  const SINGLE_CLASS_RE = /^\.((?:[\w-]|\\.)+)$/;

  // Property -> the shorthand that also sets it. A padding utility declares
  // `padding`, so looking only at `padding-top` would find nothing.
  const SHORTHAND_OF = {
    "padding-top": "padding", "padding-right": "padding",
    "padding-bottom": "padding", "padding-left": "padding",
    "margin-top": "margin", "margin-right": "margin",
    "margin-bottom": "margin", "margin-left": "margin",
    "border-top-left-radius": "border-radius", "border-top-right-radius": "border-radius",
    "border-bottom-right-radius": "border-radius", "border-bottom-left-radius": "border-radius",
    "border-top-width": "border-width", "border-right-width": "border-width",
    "border-bottom-width": "border-width", "border-left-width": "border-width",
    "row-gap": "gap", "column-gap": "gap",
  };

  // Walking every rule of a large site is the one genuinely expensive thing
  // Edit Mode does. Past this many rules the token layer switches itself off
  // rather than stalling the panel — raw scrubbing still works, so the cost of
  // giving up is small and the cost of jank is not.
  const TOKEN_RULE_BUDGET = 50000;

  function collectTokenSources() {
    const index = {
      disabled: false,
      classRules: new Map(), // property -> [{ className, value, order }]
      varNames: new Set(),
      rules: [],             // { selectorText, style, order } for the winner walk
    };

    let order = 0;
    const walk = (rules) => {
      for (const rule of rules) {
        if (order > TOKEN_RULE_BUDGET) { index.disabled = true; return; }

        // Conditional groups: only descend into conditions that currently
        // apply, so a token is never claimed from a media query that is not in
        // effect. Detected by type rather than by "has cssRules" — see below.
        if (isMediaRule(rule)) {
          let matches = true;
          try { matches = window.matchMedia(rule.conditionText).matches; } catch { matches = false; }
          if (!matches) continue;
        } else if (isSupportsRule(rule)) {
          try { if (!CSS.supports(rule.conditionText)) continue; } catch { continue; }
        }

        // A style rule carries declarations, and — since CSS Nesting shipped —
        // may carry child rules as well. So this is not an either/or, and it
        // cannot be decided by testing `rule.cssRules` for truthiness: every
        // CSSStyleRule now has a cssRules list, empty or not. Reading that as
        // "this is a group" skips the rule's own declarations, which quietly
        // empties the whole token index and takes the !important escalation
        // down with it, since both read from index.rules.
        if (rule.selectorText && rule.style) {
          order++;
          index.rules.push({ selectorText: rule.selectorText, style: rule.style, order });
          collectRule(rule, index);
        }

        if (rule.cssRules && rule.cssRules.length) walk(rule.cssRules);
      }
    };

    for (const sheet of Array.from(document.styleSheets)) {
      // Our own stylesheets are injected into every page we run on, and their
      // tokens are the tool's, not the page's. Offering --ccp-accent as a fill
      // for someone's card would be inventing a design system they never had.
      if (isOwnStyleSheet(sheet)) continue;
      let rules = null;
      // Cross-origin sheets without CORS throw on access. There is nothing to
      // be done about it and nothing to report: the token layer just sees less.
      try { rules = sheet.cssRules; } catch { continue; }
      if (rules) walk(rules);
      if (index.disabled) break;
    }
    // Constructed sheets (CSS-in-JS runtimes) live outside document.styleSheets.
    for (const sheet of Array.from(document.adoptedStyleSheets || [])) {
      try { if (sheet.cssRules) walk(sheet.cssRules); } catch { /* same as above */ }
      if (index.disabled) break;
    }

    if (index.disabled) {
      index.classRules.clear();
      index.varNames.clear();
      index.rules.length = 0;
    }
    return index;
  }

  const isMediaRule = (rule) =>
    typeof CSSMediaRule !== "undefined" && rule instanceof CSSMediaRule;
  const isSupportsRule = (rule) =>
    typeof CSSSupportsRule !== "undefined" && rule instanceof CSSSupportsRule;

  // tokens.css and content.css ride along on every page as content scripts, so
  // they are in document.styleSheets like any other sheet. Skipping them by URL
  // also saves walking a couple of hundred rules that could never match a page
  // element. The name filter in collectRule is the backstop for anywhere the
  // URL is not recognisable — the test harness loads them as page stylesheets.
  function isOwnStyleSheet(sheet) {
    const href = sheet.href || "";
    if (!href) return false;
    try {
      if (chrome.runtime && chrome.runtime.getURL && href.startsWith(chrome.runtime.getURL(""))) {
        return true;
      }
    } catch { /* getURL is unavailable outside an extension context */ }
    return /\/(tokens|content)\.css(\?|$)/.test(href);
  }

  // One rule's contribution: every custom property it declares, and — when the
  // selector is a single bare class — the utility values it defines.
  function collectRule(rule, index) {
    for (let i = 0; i < rule.style.length; i++) {
      const prop = rule.style[i];
      // Our own namespace, everywhere in this file, is not the page's.
      if (prop.startsWith("--") && !prop.startsWith("--ccp-")) index.varNames.add(prop);
    }

    const m = rule.selectorText.match(SINGLE_CLASS_RE);
    if (!m) return;
    // The captured text is CSS-escaped ("p-1\.5"); the DOM class is not.
    const className = m[1].replace(/\\(.)/g, "$1");
    if (className.startsWith("ccp-")) return;
    for (let i = 0; i < rule.style.length; i++) {
      const prop = rule.style[i];
      if (prop.startsWith("--")) continue;
      if (!index.classRules.has(prop)) index.classRules.set(prop, []);
      index.classRules.get(prop).push({
        className,
        value: rule.style.getPropertyValue(prop),
        order: index.rules.length,
      });
    }
  }

  // The declaration that actually paints this property on this element:
  // highest importance, then specificity, then source order — with inline
  // style above all of it. Its text is the only place a var() can be seen.
  function findWinningDeclaration(el, prop, index) {
    if (!el || !index || index.disabled) return null;

    const inlineValue = el.style && el.style.getPropertyValue(prop);
    const inlineImportant = el.style && el.style.getPropertyPriority(prop) === "important";
    if (inlineValue && inlineImportant) {
      return { value: inlineValue, important: true, fromInline: true, selectorText: null };
    }

    let best = null;
    for (const rule of index.rules) {
      let matches = false;
      try { matches = el.matches(rule.selectorText); } catch { continue; }
      if (!matches) continue;
      const value = rule.style.getPropertyValue(prop);
      if (!value) continue;
      const important = rule.style.getPropertyPriority(prop) === "important";
      const spec = computeSpecificity(rule.selectorText);
      const cand = { value, important, spec, order: rule.order, selectorText: rule.selectorText };
      if (!best) { best = cand; continue; }
      if (cand.important !== best.important) { if (cand.important) best = cand; continue; }
      const bySpec = compareSpecificity(cand.spec, best.spec);
      if (bySpec > 0 || (bySpec === 0 && cand.order >= best.order)) best = cand;
    }

    if (inlineValue && (!best || !best.important)) {
      return { value: inlineValue, important: false, fromInline: true, selectorText: null };
    }
    return best ? { ...best, fromInline: false } : null;
  }

  // Which token — if any — is this element's computed value sitting on?
  // Utility class first (it is what the source contains), then a var() in the
  // winning declaration. Both are verified against the computed value before
  // being claimed.
  function detectPropertyToken(el, prop, computedValue, index) {
    if (!el || !index || index.disabled) return null;
    const target = parseCssLength(computedValue, tokenRemBase(), tokenEmBase(el));
    if (target === null) return null;

    const props = [prop];
    if (SHORTHAND_OF[prop]) props.push(SHORTHAND_OF[prop]);

    for (const p of props) {
      for (const cls of Array.from(el.classList)) {
        const candidates = index.classRules.get(p);
        if (!candidates) continue;
        const hit = candidates.find((c) => c.className === cls);
        if (!hit) continue;
        const resolved = parseCssLength(hit.value, tokenRemBase(), tokenEmBase(el));
        if (resolved !== null && Math.abs(resolved - target) <= 0.5) {
          return { kind: "class", name: cls, resolved };
        }
      }
    }

    const winner = findWinningDeclaration(el, prop, index);
    const varMatch = winner && winner.value.match(/var\(\s*(--[\w-]+)/);
    if (varMatch) {
      const resolved = parseCssLength(
        getComputedStyle(el).getPropertyValue(varMatch[1]), tokenRemBase(), tokenEmBase(el));
      if (resolved !== null && Math.abs(resolved - target) <= 0.5) {
        return { kind: "var", name: varMatch[1], resolved };
      }
    }
    return null;
  }

  function tokenRemBase() {
    const v = parseFloat(getComputedStyle(document.documentElement).fontSize);
    return isFinite(v) ? v : 16;
  }

  function tokenEmBase(el) {
    const v = parseFloat(getComputedStyle(el).fontSize);
    return isFinite(v) ? v : tokenRemBase();
  }

  // ===== Edit Color =====
  // Pure conversions for the edit panel's colour picker. HSV is the picker's
  // native space — a saturation square is linear in S and V, which HSL's is
  // not — and rgb/hex is the page's. All four functions are transcribed into
  // test/edit-color.mjs; change them there and change them here.

  // 0–255 channels → { h: 0–360, s: 0–1, v: 0–1 }
  function rgbToHsv(r, g, b) {
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
      if (max === rn) h = 60 * (((gn - bn) / d) % 6);
      else if (max === gn) h = 60 * ((bn - rn) / d + 2);
      else h = 60 * ((rn - gn) / d + 4);
      if (h < 0) h += 360;
    }
    return { h, s: max === 0 ? 0 : d / max, v: max };
  }

  // { h, s, v } → { r, g, b } 0–255 integers
  function hsvToRgb(h, s, v) {
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    const [r, g, b] =
      h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] :
      h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255),
    };
  }

  // #rgb(a) / #rrggbb(aa) / rgb() / rgba() → { r, g, b, a } or null. Covers
  // everything getComputedStyle emits for colours plus what a hex field takes;
  // anything else (keywords, color(), oklch()) is a null and the caller keeps
  // its previous value.
  function parseCssColor(str) {
    if (typeof str !== "string") return null;
    const s = str.trim().toLowerCase();

    let m = s.match(/^#([0-9a-f]{3,8})$/);
    if (m) {
      const hex = m[1];
      if (hex.length === 3 || hex.length === 4) {
        const [r, g, b, a] = hex.split("").map((c) => parseInt(c + c, 16));
        return { r, g, b, a: hex.length === 4 ? a / 255 : 1 };
      }
      if (hex.length === 6 || hex.length === 8) {
        return {
          r: parseInt(hex.slice(0, 2), 16),
          g: parseInt(hex.slice(2, 4), 16),
          b: parseInt(hex.slice(4, 6), 16),
          a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
        };
      }
      return null;
    }

    m = s.match(/^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/);
    if (m) {
      const clampByte = (n) => Math.min(255, Math.max(0, Math.round(parseFloat(n))));
      const a = m[4] === undefined ? 1
        : m[4].endsWith("%") ? parseFloat(m[4]) / 100
        : parseFloat(m[4]);
      return { r: clampByte(m[1]), g: clampByte(m[2]), b: clampByte(m[3]), a: Math.min(1, Math.max(0, a)) };
    }

    return null;
  }

  // { r, g, b, a? } → #rrggbb, or #rrggbbaa when alpha is meaningfully < 1
  function formatHex(c) {
    const h = (n) => Math.round(n).toString(16).padStart(2, "0");
    const base = "#" + h(c.r) + h(c.g) + h(c.b);
    return c.a === undefined || c.a >= 1 ? base : base + h(c.a * 255);
  }

  // ===== Edit Mode =====
  // A sub-mode of selection, in the same shape as redline: it cannot be
  // reached without a selection, every deselection path leaves it, and its
  // entire CSS surface is one class on <html>.
  //
  // Where it differs from redline is the pointer. Redline is a held modifier
  // and the page underneath stays live; Edit Mode owns the mouse for as long
  // as it lasts. While editing, the page is inert — clicks, double-clicks and
  // context menus over it are swallowed, and hover tracking stays dead — so
  // that dragging a value across a page full of links cannot navigate away
  // mid-scrub. Changing which element you are tuning is deliberate: back out
  // to selection, click the next one, edit again.

  function enterEditMode() {
    if (!probeActive || !selectedElement || editing) return;
    editing = true;
    document.documentElement.classList.add("ccp-editing");

    // One walk of the page's stylesheets per entry, so a token step knows the
    // scales. Rebuilt each time rather than cached across entries: single-page
    // apps inject styles as you navigate, and a stale index would offer tokens
    // that no longer exist.
    tokenIndex = collectTokenSources();
    editTokenFamilies = buildTokenFamilies(selectedElement);

    // Capture phase, on document, so the page never sees these at all.
    document.addEventListener("pointerdown", onEditPointerGuard, true);
    document.addEventListener("mousedown", onEditPointerGuard, true);
    document.addEventListener("mouseup", onEditPointerGuard, true);
    document.addEventListener("dblclick", onEditPointerGuard, true);
    document.addEventListener("contextmenu", onEditPointerGuard, true);

    showEditPanel();
    // The panel has to be measured and placed before the run has somewhere to
    // start from, so the tether is drawn after showEditPanel(), not with it.
    renderTether({ instant: true });
    updateSettingsButtonVisibility();
  }

  function exitEditMode() {
    if (!editing) return;
    commitEditGesture();
    editing = false;
    document.documentElement.classList.remove("ccp-editing");

    document.removeEventListener("pointerdown", onEditPointerGuard, true);
    document.removeEventListener("mousedown", onEditPointerGuard, true);
    document.removeEventListener("mouseup", onEditPointerGuard, true);
    document.removeEventListener("dblclick", onEditPointerGuard, true);
    document.removeEventListener("contextmenu", onEditPointerGuard, true);

    removeEditPanel();
    clearTimeout(tetherLoudTimer);
    setTetherLoud(false);
    clearTether();
    tokenIndex = null;
    editTokenFamilies = null;

    // The label's readout is built from computed styles, so it would otherwise
    // still be quoting the values the element had before it was tuned.
    if (selectedElement && selectedElement.isConnected) updateOverlay(selectedElement);
    updateSettingsButtonVisibility();
  }

  // Anything aimed at our own chrome passes; everything else dies here.
  function onEditPointerGuard(e) {
    if (!editing) return;
    if (isOwnEditChrome(e.target)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  function isOwnEditChrome(node) {
    return Boolean(
      (editPanelEl && editPanelEl.contains(node)) ||
      (settingsButtonEl && settingsButtonEl.contains(node)) ||
      (toastEl && toastEl.contains(node))
    );
  }

  // ===== Edit Panel =====
  // The panel opens where the toolbar was. That spot is already solved for
  // "interactive chrome that must not be clipped", so rather than inventing a
  // second placement rule, computeChromeLayout is asked the same question with
  // the panel's dimensions in the toolbar's place and a zero-height label —
  // which rides the solver's existing label-hidden branch. The solver is not
  // modified, so its 8,280-config sweep still covers this.
  //
  // After that the panel is the user's: drag it anywhere, and it stays there
  // for the rest of the edit session. Entering Edit Mode again re-solves, so
  // the panel always starts beside the element it is about to tune.

  // The inventory, in the order the panel stacks it. Each control names the CSS
  // property it edits, so the delta block and the registry key off the same
  // string the source will contain.
  //
  // `writes` is for properties whose longhands are what actually paint: editing
  // "padding" linked means writing one shorthand, but reading has to come off a
  // longhand, because the computed shorthand is "16px 8px 16px 8px" the moment
  // the sides differ. `when` is the relevance rule from the settings decision —
  // typography only where there is text of its own, gap only where it can act.
  const EDIT_GROUPS = [
    {
      key: "typography",
      label: "Typography",
      when: (el) => getDirectText(el).length > 0,
      controls: [
        { prop: "font-size", label: "size", unit: "px", step: 1, min: 1, max: 400 },
        { prop: "font-weight", label: "weight", unit: "", step: 100, min: 100, max: 900 },
        // line-height's "normal" has no fixed numeric equivalent — it depends
        // on the font's own metrics — so returning to the displayed number is
        // a real declaration and gets reported as one. letter-spacing's does:
        // "normal" is exactly 0, so landing back on 0 writes the keyword and
        // leaves no edit behind.
        { prop: "line-height", label: "leading", unit: "px", step: 1, min: 0, max: 400, autoWord: "normal" },
        { prop: "letter-spacing", label: "tracking", unit: "px", step: 0.1, decimals: 2, min: -20, max: 40, autoWord: "normal", autoEquals: 0 },
        {
          prop: "text-align", label: "align", kind: "segment", options: ["left", "center", "right"],
          // Unset text-align computes to "start", which is "left" in every
          // left-to-right document — without this the row reads as though
          // nothing were selected at all.
          equivalents: { start: "left", end: "right" },
        },
      ],
    },
    {
      key: "spacing",
      label: "Spacing",
      controls: [
        {
          prop: "padding", label: "padding", unit: "px", step: 1, min: 0, max: 400,
          sides: ["padding-top", "padding-right", "padding-bottom", "padding-left"],
          sideLabels: ["top", "right", "bottom", "left"],
        },
        {
          prop: "margin", label: "margin", unit: "px", step: 1, min: -400, max: 400,
          sides: ["margin-top", "margin-right", "margin-bottom", "margin-left"],
          sideLabels: ["top", "right", "bottom", "left"],
        },
        {
          prop: "gap", label: "gap", unit: "px", step: 1, min: 0, max: 400, reads: "row-gap",
          when: (el) => /flex|grid/.test(getComputedStyle(el).display),
        },
      ],
    },
    {
      key: "size",
      label: "Size",
      controls: [
        { prop: "width", label: "width", unit: "px", step: 1, min: 0, max: 4000, auto: true },
        { prop: "height", label: "height", unit: "px", step: 1, min: 0, max: 4000, auto: true },
      ],
    },
    {
      key: "surface",
      label: "Surface",
      controls: [
        { prop: "background-color", label: "fill", kind: "color" },
        { prop: "opacity", label: "opacity", unit: "%", step: 1, min: 0, max: 100, scale: 100 },
      ],
    },
    {
      key: "border",
      label: "Border",
      // Adaptive mode hides a group that has nothing to show and offers to add
      // it instead; standard mode always shows it, so a border can be given to
      // an element that has none without going looking for the affordance.
      has: (el) => parseFloat(getComputedStyle(el).borderTopWidth) > 0,
      add: { "border-width": "1px", "border-style": "solid" },
      controls: [
        { prop: "border-width", label: "stroke", unit: "px", step: 1, min: 0, max: 40, reads: "border-top-width" },
        { prop: "border-color", label: "tint", kind: "color", reads: "border-top-color" },
        {
          prop: "border-radius", label: "radius", unit: "px", step: 1, min: 0, max: 400,
          sides: ["border-top-left-radius", "border-top-right-radius",
                  "border-bottom-right-radius", "border-bottom-left-radius"],
          sideLabels: ["↖", "↗", "↘", "↙"],
        },
      ],
    },
    {
      key: "shadow",
      label: "Shadow",
      has: (el) => getComputedStyle(el).boxShadow !== "none",
      add: { "box-shadow": "0 2px 8px rgb(0 0 0 / 0.15)" },
      // box-shadow is one property but four decisions, so the panel edits the
      // parts and writes the whole thing back. Reading works the same way:
      // the computed shadow is parsed once and the parts are pulled out of it.
      shadow: true,
      controls: [
        { prop: "shadow-y", label: "y", unit: "px", step: 1, min: -80, max: 80, shadowPart: "y" },
        { prop: "shadow-blur", label: "blur", unit: "px", step: 1, min: 0, max: 200, shadowPart: "blur" },
        { prop: "shadow-spread", label: "spread", unit: "px", step: 1, min: -80, max: 80, shadowPart: "spread" },
        { prop: "shadow-color", label: "tint", kind: "color", shadowPart: "color" },
      ],
    },
  ];

  const controlsOf = (group, el) => group.controls.filter((c) => !c.when || c.when(el));
  const groupsFor = (el) =>
    EDIT_GROUPS.filter((g) => (!g.when || g.when(el)) && controlsOf(g, el).length > 0);

  // Which linked controls the user has opened up into their four sides. Panel
  // state, not element state: it is a way of looking at the element, so it
  // resets with the panel rather than following the element around.
  const editSplit = new Set();

  // ===== box-shadow parts =====
  // One property, four decisions. The panel edits the parts and writes the
  // whole declaration back, which means parsing the computed value first.
  // Chrome emits "rgb(0, 0, 0) 0px 2px 8px 0px", colour first, and a
  // comma-separated list when there is more than one shadow — only the first
  // is editable here, and the rest are preserved untouched.
  function parseBoxShadow(value) {
    if (!value || value === "none") return null;
    const shadows = splitTopLevel(value);
    const first = shadows[0];
    const colorMatch = first.match(/(rgba?\([^)]*\)|#[0-9a-f]{3,8})/i);
    const color = colorMatch ? colorMatch[1] : "rgb(0, 0, 0)";
    const numbers = first.replace(/rgba?\([^)]*\)/gi, " ").match(/-?[\d.]+px/g) || [];
    const n = (i, fallback) => (numbers[i] !== undefined ? parseFloat(numbers[i]) : fallback);
    return {
      color,
      x: n(0, 0),
      y: n(1, 0),
      blur: n(2, 0),
      spread: n(3, 0),
      inset: /\binset\b/.test(first),
      rest: shadows.slice(1),
    };
  }

  function formatBoxShadow(parts) {
    const body = `${parts.color} ${parts.x}px ${parts.y}px ${parts.blur}px ${parts.spread}px`;
    const one = parts.inset ? `inset ${body}` : body;
    return [one, ...(parts.rest || [])].join(", ");
  }

  // Split on commas that are not inside parentheses, so rgb(0, 0, 0) survives.
  function splitTopLevel(value) {
    const out = [];
    let depth = 0, start = 0;
    for (let i = 0; i < value.length; i++) {
      const c = value[i];
      if (c === "(") depth++;
      else if (c === ")") depth--;
      else if (c === "," && depth === 0) { out.push(value.slice(start, i).trim()); start = i + 1; }
    }
    out.push(value.slice(start).trim());
    return out.filter(Boolean);
  }

  function currentShadow(el) {
    return parseBoxShadow(getComputedStyle(el).boxShadow) ||
      { color: "rgb(0, 0, 0)", x: 0, y: 0, blur: 0, spread: 0, inset: false, rest: [] };
  }

  // A shadow part reads out of the parsed shadow and writes the whole property
  // back, so the registry only ever holds one entry: "box-shadow".
  function applyShadowPart(control, value) {
    const el = selectedElement;
    if (!el || !el.isConnected) return;
    const parts = currentShadow(el);
    if (control.shadowPart === "color") parts.color = value;
    else parts[control.shadowPart === "y" ? "y" : control.shadowPart] = parseFloat(value) || 0;
    const css = formatBoxShadow(parts);
    setEditValue(el, "box-shadow", {
      css, inline: css, priority: neededPriority(el, "box-shadow"), cls: null, token: null,
    });
  }

  function shadowPartValue(el, control) {
    const parts = currentShadow(el);
    return control.shadowPart === "color" ? parts.color : parts[control.shadowPart];
  }

  // ===== colour values =====
  function readColorValue(el, control) {
    if (control.shadowPart) return shadowPartValue(el, control);
    return getComputedStyle(el).getPropertyValue(control.reads || control.prop).trim();
  }

  function applyColorValue(control, cssColor) {
    if (control.shadowPart) { applyShadowPart(control, cssColor); return; }
    applyEditProp(control, cssColor);
  }

  // ===== Token families for the panel =====
  // Built once per Edit Mode entry from whatever the stylesheet walk found.
  // A property gets a stepper only when its own value sits on a scale with
  // somewhere to step to, which is why families of one are dropped upstream.

  function buildTokenFamilies(el) {
    if (!tokenIndex || tokenIndex.disabled) return [];
    const rem = tokenRemBase();
    const em = tokenEmBase(el);
    const style = getComputedStyle(el);
    const entries = [];

    for (const name of tokenIndex.varNames) {
      const resolved = parseCssLength(style.getPropertyValue(name), rem, em);
      if (resolved !== null) entries.push({ name, resolved });
    }
    // Utility classes are scales too — text-sm and text-lg are rungs whether
    // or not the page also declares a custom property for them.
    for (const [prop, candidates] of tokenIndex.classRules) {
      if (!TOKEN_SCALE_PROPS.has(prop)) continue;
      for (const candidate of candidates) {
        const resolved = parseCssLength(candidate.value, rem, em);
        if (resolved !== null) entries.push({ name: candidate.className, resolved, kind: "class" });
      }
    }
    return groupTokenFamilies(entries);
  }

  // Which properties a class-based scale is allowed to be read from. Without
  // this, a .p-4 that also sets margin would offer padding rungs for margin.
  const TOKEN_SCALE_PROPS = new Set([
    "font-size", "padding", "margin", "gap", "row-gap", "column-gap",
    "border-radius", "border-width", "line-height", "letter-spacing",
  ]);

  // The family a control should step along: the one its current value sits on,
  // or — when the value is off-scale — the one whose name matches the property
  // most closely. Never a guess: if nothing matches, there is no stepper.
  function familyForControl(el, control) {
    if (!editTokenFamilies || editTokenFamilies.length === 0) return null;
    const detected = detectPropertyToken(el, control.reads || control.prop,
      getComputedStyle(el).getPropertyValue(control.reads || control.prop).trim(), tokenIndex);
    if (detected) {
      const owner = editTokenFamilies.find((f) => f.members.some((m) => m.name === detected.name));
      if (owner) return owner;
    }
    return null;
  }

  // Colour tokens the page declares, for the picker's palette. Only names that
  // resolve to a colour are offered — a --space-4 has no business in a swatch
  // row — and only when the stylesheet walk actually found something.
  function paletteTokens(el) {
    if (!tokenIndex || tokenIndex.disabled) return [];
    const style = getComputedStyle(el);
    const out = [];
    for (const name of tokenIndex.varNames) {
      const raw = style.getPropertyValue(name).trim();
      const parsed = parseCssColor(raw);
      if (parsed) out.push({ name, css: raw, hex: formatHex(parsed) });
      if (out.length >= 24) break;
    }
    return out;
  }

  function showEditPanel() {
    removeEditPanel();

    editPanelEl = document.createElement("div");
    editPanelEl.id = "ccp-edit-panel";

    const head = document.createElement("div");
    head.className = "ccp-edit-head";

    const back = document.createElement("button");
    back.className = "ccp-edit-back";
    back.innerHTML = ICONS.back;
    back.title = "Back to selection";
    back.setAttribute("aria-label", "Back to selection");
    back.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      exitEditMode();
    });

    const identity = document.createElement("span");
    identity.className = "ccp-edit-id";
    identity.innerHTML = editPanelIdentity(selectedElement);

    const copy = document.createElement("button");
    copy.className = "ccp-edit-act ccp-edit-copy";
    copy.innerHTML = `${ICONS.code}<i class="ccp-edit-count"></i>`;
    copy.title = "Copy pointer and edits";
    copy.setAttribute("aria-label", "Copy pointer and edits");
    copy.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      copyEdits(copy);
    });

    const resetAll = document.createElement("button");
    resetAll.className = "ccp-edit-act ccp-edit-resetall";
    resetAll.textContent = "↺";
    resetAll.title = "Reset every edit";
    resetAll.setAttribute("aria-label", "Reset every edit");
    resetAll.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      resetAllEdits();
      refreshEditControls();
    });

    head.appendChild(back);
    head.appendChild(identity);
    head.appendChild(copy);
    head.appendChild(resetAll);
    head.addEventListener("pointerdown", onEditDragStart);

    const body = document.createElement("div");
    body.className = "ccp-edit-body";

    // Delegated rather than per-row: the rows are rebuilt whenever the panel
    // re-renders, and listeners hung on them would have to be rebuilt with
    // them. pointerover/pointerout bubble, so the body can watch for all of
    // them. A row under the pointer is the earliest honest signal that the
    // user is about to change something, so it is what wakes the tether.
    body.addEventListener("pointerover", (e) => {
      if (e.target.closest(".ccp-edit-row")) setTetherLoud(true);
    });
    body.addEventListener("pointerout", (e) => {
      const row = e.target.closest(".ccp-edit-row");
      if (!row || row.contains(e.relatedTarget)) return;
      if (!editGesture) setTetherLoud(false);
    });

    editPanelEl.appendChild(head);
    editPanelEl.appendChild(body);
    document.documentElement.appendChild(editPanelEl);

    renderEditControls();
    placeEditPanel();
  }

  // ===== Edit Controls =====
  // Stacked sections, one row per property: a dirty dot, a label, and the
  // control. The dot is both the "this is edited" mark and the way to take one
  // property back, which is why it sits with the row rather than in a menu.

  function renderEditControls() {
    if (!editPanelEl || !selectedElement) return;
    const body = editPanelEl.querySelector(".ccp-edit-body");
    body.textContent = "";

    for (const group of groupsFor(selectedElement)) {
      const section = document.createElement("div");
      section.className = "ccp-edit-group";

      const legend = document.createElement("p");
      legend.className = "ccp-edit-legend";
      legend.textContent = group.label;
      section.appendChild(legend);

      // A group whose property the element does not have yet. In standard mode
      // it offers to add one, so the affordance is always in the same place;
      // in adaptive mode the group is simply not there, and the panel is only
      // as tall as this element needs.
      if (group.add && group.has && !group.has(selectedElement) &&
          !isEditedProp(selectedElement, Object.keys(group.add)[0])) {
        if (editPrefs.editGroups === "adaptive") continue;
        section.appendChild(buildAddRow(group));
        body.appendChild(section);
        continue;
      }

      for (const control of controlsOf(group, selectedElement)) {
        section.appendChild(buildEditRow(control));
        if (control.sides && editSplit.has(control.prop)) {
          for (let i = 0; i < control.sides.length; i++) {
            section.appendChild(buildEditRow(sideControl(control, i), true));
          }
        }
      }
      body.appendChild(section);
    }
    refreshEditControls();
  }

  // Each side of a linked control is a full control in its own right, so it
  // reads, writes and reports as its own property — which is what the source
  // will contain once only one side has changed.
  function sideControl(control, i) {
    return {
      ...control,
      sides: null,
      prop: control.sides[i],
      reads: control.sides[i],
      label: control.sideLabels[i],
      isSide: true,
    };
  }

  function buildAddRow(group) {
    const row = document.createElement("div");
    row.className = "ccp-edit-row ccp-edit-addrow";
    const button = document.createElement("button");
    button.className = "ccp-edit-add";
    button.textContent = `+ add ${group.label.toLowerCase()}`;
    button.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const el = selectedElement;
      if (!el || !el.isConnected) return;
      for (const [prop, value] of Object.entries(group.add)) {
        beginEditGesture(el, prop);
        setEditValue(el, prop, {
          css: value, inline: value, priority: neededPriority(el, prop), cls: null, token: null,
        });
        commitEditGesture();
      }
      renderEditControls();
    });
    row.appendChild(button);
    return row;
  }

  function buildEditRow(control, isSide) {
    const row = document.createElement("div");
    row.className = "ccp-edit-row" + (isSide ? " ccp-edit-side" : "");
    // Shadow parts all write box-shadow, so the row's dirty state and its
    // reset both key off that one property.
    row.dataset.prop = control.shadowPart ? "box-shadow" : control.prop;
    row.dataset.control = control.prop;

    const resetProp = control.shadowPart ? "box-shadow" : control.prop;
    const dot = document.createElement("button");
    dot.className = "ccp-edit-dot";
    dot.title = `Reset ${control.label}`;
    dot.setAttribute("aria-label", `Reset ${control.label}`);
    dot.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isEditedProp(selectedElement, resetProp)) return;
      resetEditProp(selectedElement, resetProp);
      renderEditControls();
    });

    const label = document.createElement("span");
    label.className = "ccp-edit-label";
    label.textContent = control.label;

    row.appendChild(dot);
    row.appendChild(label);

    // The link toggle turns one value into four and back. It sits before the
    // control so the row still lines up down the same edge either way.
    if (control.sides) {
      const link = document.createElement("button");
      const split = editSplit.has(control.prop);
      link.className = "ccp-edit-link";
      link.textContent = split ? "⊟" : "⊞";
      link.title = split ? "Link all sides" : "Edit each side";
      link.setAttribute("aria-label", link.title);
      link.setAttribute("aria-pressed", String(split));
      link.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (split) editSplit.delete(control.prop);
        else editSplit.add(control.prop);
        renderEditControls();
      });
      row.appendChild(link);
    }

    if (control.sides && editSplit.has(control.prop)) {
      // Split: the parent row is a heading for the four beneath it.
      row.classList.add("ccp-edit-parent");
      return row;
    }

    row.appendChild(
      control.kind === "color" ? buildColorControl(control)
        : control.kind === "segment" ? buildSegmentControl(control)
        : buildNumericControl(control)
    );
    return row;
  }

  function buildColorControl(control) {
    const wrap = document.createElement("span");
    wrap.className = "ccp-edit-color";

    const swatch = document.createElement("button");
    swatch.className = "ccp-edit-swatch";
    swatch.title = `Change ${control.label}`;
    swatch.setAttribute("aria-label", `Change ${control.label}`);
    const fill = document.createElement("i");
    swatch.appendChild(fill);

    const readout = document.createElement("span");
    readout.className = "ccp-edit-hex";

    swatch.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openColorPicker(control, swatch);
    });

    wrap.appendChild(swatch);
    wrap.appendChild(readout);
    return wrap;
  }

  // Type, arrow, or scrub — the same three ways Figma offers, because each
  // suits a different question: typing when you know the number, arrows when
  // you are counting steps, scrubbing when you are judging by eye.
  function buildNumericControl(control) {
    const wrap = document.createElement("span");
    wrap.className = "ccp-edit-num";
    wrap.dataset.prop = control.prop;

    const input = document.createElement("input");
    input.className = "ccp-edit-input";
    input.type = "text";
    input.inputMode = "decimal";
    input.spellcheck = false;
    input.setAttribute("aria-label", control.label);

    wrap.appendChild(input);
    if (control.unit) {
      const unit = document.createElement("i");
      unit.className = "ccp-edit-unit";
      unit.textContent = control.unit;
      wrap.appendChild(unit);
    }

    input.addEventListener("keydown", (e) => onNumericKey(e, control));
    input.addEventListener("blur", () => commitNumericInput(control, input));
    // A scrub starts on the wrapper, so the drag surface is the whole chip
    // rather than only the digits.
    wrap.addEventListener("pointerdown", (e) => onNumericScrubStart(e, control, input));

    // "token" hides the raw number once a scale is available: the whole point
    // of a design system is that the pixel count is not the decision.
    if (editPrefs.editTokenControls === "token" &&
        familyForControl(selectedElement, control)) {
      wrap.classList.add("ccp-edit-quiet");
    }

    const extra = [];
    if (control.auto) {
      const auto = document.createElement("button");
      auto.className = "ccp-edit-auto";
      auto.textContent = "auto";
      auto.title = `Let ${control.label} size itself`;
      auto.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleAuto(control);
      });
      extra.push(auto);
    }

    // The stepper only exists when this element's value is actually sitting on
    // one of the page's scales. Offering "‹ — ›" over a value that belongs to
    // no scale would promise a move that cannot happen.
    const family = editPrefs.editTokenControls === "value"
      ? null
      : familyForControl(selectedElement, control);
    if (family) {
      const stepper = document.createElement("span");
      stepper.className = "ccp-edit-tok";
      stepper.dataset.family = family.prefix;
      const down = document.createElement("button");
      down.textContent = "‹";
      down.title = `Step ${control.label} down the ${family.prefix} scale`;
      const name = document.createElement("b");
      const up = document.createElement("button");
      up.textContent = "›";
      up.title = `Step ${control.label} up the ${family.prefix} scale`;
      down.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation(); stepControlToken(control, family, -1);
      });
      up.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation(); stepControlToken(control, family, 1);
      });
      stepper.appendChild(down);
      stepper.appendChild(name);
      stepper.appendChild(up);
      extra.push(stepper);
    }

    if (extra.length === 0) return wrap;
    const holder = document.createElement("span");
    holder.className = "ccp-edit-numwrap";
    holder.appendChild(wrap);
    for (const node of extra) holder.appendChild(node);
    return holder;
  }

  // A step along a scale, not an arithmetic nudge. When the target rung is a
  // utility class the element already wears, the edit is a class swap — that
  // is what the source contains, so that is what the delta should say.
  function stepControlToken(control, family, dir) {
    const el = selectedElement;
    if (!el || !el.isConnected) return;
    const prop = control.reads || control.prop;
    const current = parseCssLength(
      getComputedStyle(el).getPropertyValue(prop).trim(), tokenRemBase(), tokenEmBase(el));
    if (current === null) return;
    const next = stepToken(family.members, current, dir);
    if (!next) return;

    const detected = detectPropertyToken(el, prop, getComputedStyle(el).getPropertyValue(prop).trim(), tokenIndex);
    const isVar = next.name.startsWith("--");
    const asClass = detected && detected.kind === "class" && !isVar;

    // A var rung is applied as the var() itself, so the source keeps its
    // indirection instead of being flattened to a pixel count. Inline always
    // outranks a stylesheet, so this always takes.
    //
    // `cls` stays whatever the element already wore: this path overrides the
    // value, it does not take the element's class away. Without that, falling
    // back from a class step would strip the class it started with.
    const keepClass = detected && detected.kind === "class" ? detected.name : null;
    const valueEdit = {
      css: `${next.resolved}px`,
      inline: isVar ? `var(${next.name})` : `${next.resolved}px`,
      priority: neededPriority(el, control.prop),
      cls: keepClass,
      token: isVar ? { kind: "var", name: next.name } : null,
    };

    beginEditGesture(el, control.prop);
    if (asClass) {
      // A class swap carries the value on the class, so nothing is written
      // inline — which also means the class has to win the cascade to have any
      // effect at all.
      setEditValue(el, control.prop, {
        css: `${next.resolved}px`, inline: null, priority: "",
        cls: next.name, token: { kind: "class", name: next.name },
      });
      const got = parseCssLength(
        getComputedStyle(el).getPropertyValue(prop).trim(), tokenRemBase(), tokenEmBase(el));
      if (got === null || Math.abs(got - next.resolved) > 0.5) {
        // The page outranks its own utility class — `.card p` beats `.text-lg`
        // on specificity, and this is common. Reporting "text-sm → text-base"
        // would be advice that does nothing in the source either, so take the
        // class back off and change the value instead.
        setEditValue(el, control.prop, valueEdit);
      }
    } else {
      setEditValue(el, control.prop, valueEdit);
    }
    commitEditGesture();
    renderEditControls();
  }

  function buildSegmentControl(control) {
    const seg = document.createElement("span");
    seg.className = "ccp-edit-seg";
    seg.dataset.prop = control.prop;
    seg.setAttribute("role", "radiogroup");
    seg.setAttribute("aria-label", control.label);

    for (const option of control.options) {
      const button = document.createElement("button");
      button.dataset.value = option;
      button.setAttribute("role", "radio");
      button.title = option;
      button.textContent = { left: "≡", center: "≡", right: "≡" }[option] || option;
      button.classList.add(`ccp-edit-align-${option}`);
      button.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        applyEditProp(control, option);
        commitEditGesture();
        refreshEditControls();
      });
      seg.appendChild(button);
    }
    return seg;
  }

  // ===== Edit Colour Picker =====
  // A saturation square, a hue rail and an alpha rail — the react-colorful
  // shape, rebuilt on our own tokens rather than pulled in as a dependency.
  // HSV rather than HSL because the square is only linear in S and V, which is
  // what makes dragging it feel like picking a colour instead of solving one.
  //
  // Above the square sits whatever colour tokens the page declares: those are
  // the values the source can actually name, so they get first offer.

  function openColorPicker(control, anchor) {
    closeColorPicker();
    const el = selectedElement;
    if (!el || !el.isConnected) return;

    const parsed = parseCssColor(readColorValue(el, control)) || { r: 0, g: 0, b: 0, a: 1 };
    let hsv = rgbToHsv(parsed.r, parsed.g, parsed.b);
    let alpha = parsed.a;

    const pop = document.createElement("div");
    pop.className = "ccp-edit-pop";
    pop.innerHTML = `
      <div class="ccp-edit-sat"><i class="ccp-edit-sat-dot"></i></div>
      <div class="ccp-edit-rails">
        <div class="ccp-edit-hue"><i class="ccp-edit-rail-dot"></i></div>
        <div class="ccp-edit-alpha"><span></span><i class="ccp-edit-rail-dot"></i></div>
      </div>
      <div class="ccp-edit-popfoot">
        <input class="ccp-edit-hexin" type="text" spellcheck="false" aria-label="Hex colour">
        <button class="ccp-edit-drop" title="Pick a colour from the page" aria-label="Pick a colour from the page">◎</button>
      </div>`;

    const sat = pop.querySelector(".ccp-edit-sat");
    const satDot = pop.querySelector(".ccp-edit-sat-dot");
    const hue = pop.querySelector(".ccp-edit-hue");
    const hueDot = hue.querySelector(".ccp-edit-rail-dot");
    const alphaRail = pop.querySelector(".ccp-edit-alpha");
    const alphaFill = alphaRail.querySelector("span");
    const alphaDot = alphaRail.querySelector(".ccp-edit-rail-dot");
    const hexIn = pop.querySelector(".ccp-edit-hexin");
    const drop = pop.querySelector(".ccp-edit-drop");

    const tokens = paletteTokens(el);
    if (tokens.length) {
      const palette = document.createElement("div");
      palette.className = "ccp-edit-palette";
      for (const token of tokens) {
        const swatch = document.createElement("button");
        swatch.className = "ccp-edit-pal";
        swatch.style.backgroundColor = token.hex;
        swatch.title = `${token.name} — ${token.hex}`;
        swatch.addEventListener("click", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          // A token pick names the token, so the delta can say so.
          const rgb = parseCssColor(token.hex);
          hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
          alpha = rgb.a;
          commit({ kind: "var", name: token.name });
          paint();
        });
        palette.appendChild(swatch);
      }
      pop.insertBefore(palette, pop.firstChild);
    }

    const currentCss = () => {
      const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
      return alpha >= 1
        ? formatHex({ ...rgb })
        : `rgb(${rgb.r} ${rgb.g} ${rgb.b} / ${Number(alpha.toFixed(3))})`;
    };

    // Direct assignments rather than setProperty, deliberately: setProperty is
    // one of the verbs test/edit-audit.mjs reserves for the Edit Apply section,
    // and keeping it out of here is what lets that audit stay a simple, exact
    // rule instead of one that has to reason about receivers. The gradients
    // themselves stay in content.css; only the colour under them comes from JS.
    function paint() {
      const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
      const hex = formatHex(rgb);
      sat.style.backgroundColor = `hsl(${hsv.h} 100% 50%)`;
      satDot.style.left = `${hsv.s * 100}%`;
      satDot.style.top = `${(1 - hsv.v) * 100}%`;
      satDot.style.backgroundColor = hex;
      hueDot.style.left = `${(hsv.h / 360) * 100}%`;
      alphaDot.style.left = `${alpha * 100}%`;
      alphaFill.style.backgroundImage = `linear-gradient(to right, transparent, ${hex})`;
      if (document.activeElement !== hexIn) hexIn.value = hex;
      const swatchFill = anchor.querySelector("i");
      if (swatchFill) swatchFill.style.background = currentCss();
    }

    function commit(token) {
      const el2 = selectedElement;
      if (!el2 || !el2.isConnected) return;
      const css = currentCss();
      if (control.shadowPart) {
        beginEditGesture(el2, "box-shadow");
        applyShadowPart(control, css);
      } else {
        beginEditGesture(el2, control.prop);
        setEditValue(el2, control.prop, {
          css, inline: css, priority: neededPriority(el2, control.prop), cls: null,
          token: token || null,
        });
      }
      refreshEditControls();
    }

    // One drag handler for all three surfaces: they differ only in what a
    // position means.
    const dragSurface = (node, onMove) => {
      node.addEventListener("pointerdown", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const rect = node.getBoundingClientRect();
        const apply = (e2) => {
          const x = Math.min(1, Math.max(0, (e2.clientX - rect.left) / rect.width));
          const y = Math.min(1, Math.max(0, (e2.clientY - rect.top) / rect.height));
          onMove(x, y);
          paint();
          commit(null);
        };
        node.setPointerCapture(ev.pointerId);
        apply(ev);
        const move = (e2) => apply(e2);
        const up = () => {
          node.removeEventListener("pointermove", move);
          node.removeEventListener("pointerup", up);
          node.removeEventListener("pointercancel", up);
          commitEditGesture();
          refreshEditControls();
        };
        node.addEventListener("pointermove", move);
        node.addEventListener("pointerup", up);
        node.addEventListener("pointercancel", up);
      });
    };

    dragSurface(sat, (x, y) => { hsv = { h: hsv.h, s: x, v: 1 - y }; });
    dragSurface(hue, (x) => { hsv = { h: x * 360, s: hsv.s, v: hsv.v }; });
    dragSurface(alphaRail, (x) => { alpha = x; });

    hexIn.addEventListener("keydown", (ev) => {
      ev.stopPropagation();
      if (ev.key !== "Enter") return;
      const rgb = parseCssColor(hexIn.value.trim());
      if (!rgb) { paint(); return; }
      hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
      alpha = rgb.a;
      paint();
      commit(null);
      commitEditGesture();
    });

    // Chromium only, and only from a user gesture — so it is offered when it
    // exists and simply absent when it does not, rather than failing on click.
    if (window.EyeDropper) {
      drop.addEventListener("click", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        try {
          const result = await new window.EyeDropper().open();
          const rgb = parseCssColor(result.sRGBHex);
          if (!rgb) return;
          hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
          alpha = 1;
          paint();
          commit(null);
          commitEditGesture();
        } catch { /* the user pressed Escape; nothing to report */ }
      });
    } else {
      drop.remove();
    }

    editPanelEl.appendChild(pop);
    editPopoverEl = pop;
    positionColorPicker(pop, anchor);
    paint();
  }

  function positionColorPicker(pop, anchor) {
    const panelRect = editPanelEl.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const top = anchorRect.bottom - panelRect.top + GEOMETRY.gap;
    pop.style.top = `${Math.max(0, top)}px`;
    // Kept inside the panel's own width so it can never hang off the side of a
    // panel that is itself parked against the viewport edge.
    pop.style.left = `${GEOMETRY.margin}px`;
    pop.style.right = `${GEOMETRY.margin}px`;
  }

  function closeColorPicker() {
    if (!editPopoverEl) return;
    editPopoverEl.remove();
    editPopoverEl = null;
    commitEditGesture();
  }

  // ===== Edit Control values =====

  function readComputed(el, control) {
    return getComputedStyle(el).getPropertyValue(control.reads || control.prop).trim();
  }

  // The number a control shows. `autoWord` covers the properties whose computed
  // value can be a keyword rather than a length (line-height and letter-spacing
  // both report "normal" when nothing has set them), where the honest display
  // is that there is no number yet.
  function numericState(el, control) {
    if (control.shadowPart) return { auto: false, value: shadowPartValue(el, control) };
    const raw = readComputed(el, control);
    if (control.autoWord && raw === control.autoWord) {
      const base = parseFloat(getComputedStyle(el).fontSize) || 16;
      return { auto: true, value: control.prop === "line-height" ? Math.round(base * 1.2) : 0 };
    }
    const n = parseFloat(raw);
    const value = isFinite(n) ? n : 0;
    // opacity is the one control whose displayed unit is not its CSS unit:
    // people say 60%, the property says 0.6.
    return { auto: false, value: control.scale ? value * control.scale : value };
  }

  // The stepper is 60px wide and the family prefix is already its title, so
  // only the step itself needs to fit: "--title-lg" reads as "lg".
  function shortTokenName(name) {
    const split = splitTokenName(name);
    return split ? split.step : name;
  }

  const roundTo = (n, decimals) => {
    const f = Math.pow(10, decimals || 0);
    return Math.round(n * f) / f;
  };

  const formatNumeric = (n, control) =>
    String(roundTo(n, control.decimals || 0));

  function applyEditProp(control, cssValue) {
    const el = selectedElement;
    if (!el || !el.isConnected) return;
    setEditValue(el, control.prop, {
      css: cssValue,
      inline: cssValue,
      priority: neededPriority(el, control.prop),
      cls: null,
      token: null,
    });
  }

  function applyNumeric(control, next) {
    const clamped = Math.min(control.max, Math.max(control.min, next));
    if (control.shadowPart) {
      applyShadowPart(control, clamped);
      refreshEditControls();
      return clamped;
    }
    const isKeyword = control.autoWord && control.autoEquals === clamped;
    const css = control.scale
      ? String(roundTo(clamped / control.scale, 3))
      : formatNumeric(clamped, control) + (control.unit || "");
    applyEditProp(control, isKeyword ? control.autoWord : css);
    refreshEditControls();
    return clamped;
  }

  function toggleAuto(control) {
    const el = selectedElement;
    if (!el || !el.isConnected) return;
    const record = editRegistry.get(el);
    const entry = record && record.props.get(control.prop);
    const isAuto = entry ? entry.after.css === "auto" : !el.style.getPropertyValue(control.prop);
    if (isAuto) {
      applyNumeric(control, numericState(el, control).value);
    } else {
      applyEditProp(control, "auto");
      refreshEditControls();
    }
    commitEditGesture();
    refreshEditControls();
  }

  function onNumericKey(e, control) {
    const input = e.currentTarget;
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      const dir = e.key === "ArrowUp" ? 1 : -1;
      const step = control.step * (e.shiftKey ? 10 : 1);
      const current = parseFloat(input.value);
      const base = isFinite(current) ? current : numericState(selectedElement, control).value;
      beginEditGesture(selectedElement, control.prop);
      const applied = applyNumeric(control, roundTo(base + dir * step, control.decimals || 0));
      // The field keeps focus while arrowing, and refreshEditControls leaves
      // focused fields alone so it cannot type over you — so stepping has to
      // write the new number itself. Without this the field shows the old
      // value and the eventual blur commits it, undoing every step taken.
      input.value = formatNumeric(applied, control);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      commitNumericInput(control, input);
      input.blur();
      return;
    }
    if (e.key === "Escape") {
      // Escape in a field abandons the typing, not the mode — the panel's own
      // Escape stage only applies once the field has given the key back.
      e.stopPropagation();
      e.preventDefault();
      refreshEditControls();
      input.blur();
      return;
    }
    // Everything else is typing; it must not reach the page's shortcuts.
    e.stopPropagation();
  }

  function commitNumericInput(control, input) {
    const el = selectedElement;
    if (!el || !el.isConnected) return;
    const typed = parseFloat(input.value);
    if (!isFinite(typed)) { refreshEditControls(); return; }
    beginEditGesture(el, control.prop);
    applyNumeric(control, typed);
    commitEditGesture();
    refreshEditControls();
  }

  // Pointer-down on a value is ambiguous until it moves: a click means "let me
  // type", a drag means "let me judge". So the gesture stays undecided for a
  // few pixels, and only then takes the focus away and starts scrubbing.
  function onNumericScrubStart(e, control, input) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const el = selectedElement;
    if (!el || !el.isConnected) return;

    const startX = e.clientX;
    const start = numericState(el, control).value;
    const wrap = e.currentTarget;
    let scrubbing = false;

    const move = (ev) => {
      const dx = ev.clientX - startX;
      if (!scrubbing) {
        if (Math.abs(dx) < 3) return;
        scrubbing = true;
        wrap.classList.add("ccp-edit-scrubbing");
        beginEditGesture(el, control.prop);
        suppressTransitions(el);
        if (document.activeElement === input) input.blur();
      }
      // Two pixels per step keeps a full-width drag inside a sane range while
      // still landing on every value; Shift multiplies the step, not the speed.
      const step = control.step * (ev.shiftKey ? 10 : 1);
      applyNumeric(control, roundTo(start + Math.round(dx / 2) * step, control.decimals || 0));
    };
    const up = () => {
      wrap.removeEventListener("pointermove", move);
      wrap.removeEventListener("pointerup", up);
      wrap.removeEventListener("pointercancel", up);
      wrap.classList.remove("ccp-edit-scrubbing");
      if (scrubbing) {
        releaseTransitions(el);
        commitEditGesture();
        refreshEditControls();
      } else {
        input.focus();
        input.select();
      }
    };

    wrap.setPointerCapture(e.pointerId);
    wrap.addEventListener("pointermove", move);
    wrap.addEventListener("pointerup", up);
    wrap.addEventListener("pointercancel", up);
  }

  // Repaint every control from the element's current state. Called after any
  // change, including undo, so what the panel shows is never a guess.
  function refreshEditControls() {
    if (!editPanelEl || !selectedElement || !selectedElement.isConnected) return;
    const el = selectedElement;

    // Every row, including the four sides a split control expands into.
    const allControls = [];
    for (const group of EDIT_GROUPS) {
      for (const control of group.controls) {
        allControls.push(control);
        if (control.sides) {
          for (let i = 0; i < control.sides.length; i++) allControls.push(sideControl(control, i));
        }
      }
    }

    for (const control of allControls) {
      {
        const row = editPanelEl.querySelector(`.ccp-edit-row[data-control="${control.prop}"]`);
        if (!row) continue;

        const edited = isEditedProp(el, row.dataset.prop);
        row.classList.toggle("ccp-edit-dirty", edited);
        const dot = row.querySelector(".ccp-edit-dot");
        if (dot) dot.classList.toggle("ccp-edit-on", edited);

        if (control.kind === "color") {
          const raw = readColorValue(el, control);
          const parsed = parseCssColor(raw);
          const fill = row.querySelector(".ccp-edit-swatch i");
          if (fill) fill.style.background = raw || "transparent";
          const hex = row.querySelector(".ccp-edit-hex");
          if (hex) {
            const entry = editRegistry.get(el)?.props.get(row.dataset.prop);
            const token = entry && entry.after && entry.after.token;
            hex.textContent = token ? token.name : parsed ? formatHex(parsed) : raw;
            hex.classList.toggle("ccp-edit-token", Boolean(token));
          }
          continue;
        }

        if (control.kind === "segment") {
          const raw = readComputed(el, control);
          const value = (control.equivalents && control.equivalents[raw]) || raw;
          for (const button of row.querySelectorAll(".ccp-edit-seg button")) {
            button.setAttribute("aria-checked", String(button.dataset.value === value));
          }
          continue;
        }

        const input = row.querySelector(".ccp-edit-input");
        if (!input) continue;
        const record = editRegistry.get(el);
        const entry = record && record.props.get(control.prop);
        const isAuto = entry
          ? entry.after.css === "auto"
          : control.auto && !el.style.getPropertyValue(control.prop);
        const state = numericState(el, control);
        // Typing must never be overwritten mid-keystroke.
        if (document.activeElement !== input) {
          input.value = formatNumeric(state.value, control);
        }
        const wrap = row.querySelector(".ccp-edit-num");
        if (wrap) wrap.classList.toggle("ccp-edit-untouched", isAuto || state.auto);
        const auto = row.querySelector(".ccp-edit-auto");
        if (auto) auto.setAttribute("aria-checked", String(Boolean(isAuto)));

        // The stepper reads out where the value sits now — a rung's name, or a
        // dash when a raw scrub has left it between rungs.
        const stepper = row.querySelector(".ccp-edit-tok");
        if (stepper) {
          const family = editTokenFamilies &&
            editTokenFamilies.find((f) => f.prefix === stepper.dataset.family);
          const onRung = family ? matchToken(family.members, state.value) : null;
          stepper.querySelector("b").textContent = onRung ? shortTokenName(onRung.name) : "—";
          stepper.classList.toggle("ccp-edit-offscale", !onRung);
          stepper.title = onRung ? onRung.name : `Off the ${stepper.dataset.family} scale`;
        }
      }
    }

    const count = editedPropCount(el);
    const badge = editPanelEl.querySelector(".ccp-edit-count");
    if (badge) badge.textContent = count ? String(count) : "";
    const resetAll = editPanelEl.querySelector(".ccp-edit-resetall");
    if (resetAll) resetAll.classList.toggle("ccp-edit-on", editRegistry.size > 0);
  }

  // ===== Copy the delta block =====
  function copyEdits(btnEl) {
    const el = selectedElement;
    if (!el) return;
    commitEditGesture();
    const text = buildEditsBlock(el);
    navigator.clipboard.writeText(text).then(
      () => setButtonSuccess(btnEl),
      () => showToast("Clipboard blocked — check the page's permissions")
    );
  }

  function removeEditPanel() {
    if (!editPanelEl) return;
    closeColorPicker();
    editPanelEl.remove();
    editPanelEl = null;
    editPanelPos = null;
    editSplit.clear();
  }

  // tag + the first thing that identifies it, coloured the way the info label
  // colours the same parts, so the panel reads as the same tool.
  function editPanelIdentity(el) {
    if (!el) return "";
    const tag = el.tagName.toLowerCase();
    let rest = "";
    if (el.id && !el.id.startsWith("ccp-")) {
      rest = `<b class="ccp-edit-id-id">#${escapeHtml(el.id)}</b>`;
    } else {
      const cls = Array.from(el.classList).find((c) => !c.startsWith("ccp-"));
      if (cls) rest = `<b class="ccp-edit-id-class">.${escapeHtml(cls)}</b>`;
    }
    return `<b class="ccp-edit-id-tag">${tag}</b>${rest}`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  function placeEditPanel() {
    if (!editPanelEl || !selectedElement) return;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const w = editPanelEl.offsetWidth;
    const h = editPanelEl.offsetHeight;

    if (editPanelPos) {
      // Already dragged: keep the user's spot, only pulling it back into view.
      const { top, left } = clampEditPanel(editPanelPos.top, editPanelPos.left, w, h, vw, vh);
      editPanelPos = { top, left };
    } else {
      const layout = computeChromeLayout(
        selectedElement.getBoundingClientRect(),
        { w: 0, h: 0 },
        { w, h },
        vw, vh
      );
      editPanelPos = { top: layout.toolbar.top, left: layout.toolbar.left };
    }
    editPanelEl.style.top = editPanelPos.top + "px";
    editPanelEl.style.left = editPanelPos.left + "px";
  }

  function clampEditPanel(top, left, w, h, vw, vh) {
    const M = GEOMETRY.margin;
    return {
      top: Math.max(M, Math.min(top, Math.max(M, vh - h - M))),
      left: Math.max(M, Math.min(left, Math.max(M, vw - w - M))),
    };
  }

  function onEditDragStart(e) {
    // Buttons in the header are buttons first; only the bar itself drags.
    if (!editPanelEl || e.button !== 0 || e.target.closest("button")) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = editPanelEl.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    const head = e.currentTarget;

    const move = (ev) => {
      const vw = document.documentElement.clientWidth;
      const vh = document.documentElement.clientHeight;
      const { top, left } = clampEditPanel(
        ev.clientY - offsetY, ev.clientX - offsetX,
        editPanelEl.offsetWidth, editPanelEl.offsetHeight, vw, vh
      );
      editPanelPos = { top, left };
      editPanelEl.style.top = top + "px";
      editPanelEl.style.left = left + "px";
      // The panel deliberately has no positional transition, so the run must
      // not glide either or it would trail behind the drag.
      renderTether({ instant: true });
    };
    const up = () => {
      head.removeEventListener("pointermove", move);
      head.removeEventListener("pointerup", up);
      head.removeEventListener("pointercancel", up);
      head.classList.remove("ccp-edit-dragging");
    };

    head.setPointerCapture(e.pointerId);
    head.classList.add("ccp-edit-dragging");
    head.addEventListener("pointermove", move);
    head.addEventListener("pointerup", up);
    head.addEventListener("pointercancel", up);
  }

  // Undo walks one timeline across every element edited this session, so it can
  // land on something that is not the element in front of you — and a change
  // you cannot see is worse than no change at all. The element gets a flash
  // where it stands, and a toast says which way to look if it is off screen.
  function onEditHistoryApplied(el) {
    if (el && el !== selectedElement) {
      flashElementBox(el);
      showToast("Undid an edit on another element");
    }
    if (selectedElement && selectedElement.isConnected) updateOverlay(selectedElement);
    renderEditControls();
  }

  function flashElementBox(el) {
    if (!overlayContainer || !el || !el.isConnected) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 && rect.height <= 0) return;

    let flash = document.getElementById("ccp-edit-flash");
    if (!flash) {
      flash = document.createElement("div");
      flash.id = "ccp-edit-flash";
      overlayContainer.appendChild(flash);
    }
    flash.style.top = rect.top + "px";
    flash.style.left = rect.left + "px";
    flash.style.width = rect.width + "px";
    flash.style.height = rect.height + "px";
    // Restart the animation on a repeat undo: without the reflow between the
    // two class writes the browser coalesces them and nothing replays.
    flash.classList.remove("ccp-edit-flashing");
    void flash.offsetWidth;
    flash.classList.add("ccp-edit-flashing");
    // Cleared on a timer rather than on animationend, because under reduced
    // motion there is no animation to end — the ring simply holds and then
    // goes, so both paths finish the same way.
    clearTimeout(editFlashTimer);
    editFlashTimer = setTimeout(() => {
      flash.classList.remove("ccp-edit-flashing");
    }, 700);
  }

  // ===== Edit Apply =====
  // THE ONLY SECTION IN THIS FILE THAT WRITES TO AN ELEMENT OF THE HOST PAGE.
  //
  // Everything else the extension does is additive — it appends its own chrome
  // and reads the page. Edit Mode is the first feature that reaches in and
  // changes it, so every such write is funnelled through here and nowhere else.
  // test/edit-audit.mjs enforces that by parsing this file's section banners:
  // setProperty, removeProperty, and setAttribute/removeAttribute of "style" or
  // "class" may appear between this banner and the next one, and may not appear
  // anywhere else. If you need to restyle a page element from another section,
  // call one of these functions rather than reaching past them.
  //
  // What is recorded per element, at first touch and never again: the exact
  // style attribute string and the exact class attribute string. Restoring
  // means putting those two back verbatim — a page that shipped
  // style="color:red" gets that attribute back, not a normalised rewrite of it.

  function ensureEditRecord(el) {
    let record = editRegistry.get(el);
    if (!record) {
      record = {
        el,
        originalStyleAttr: el.getAttribute("style"),
        originalClassAttr: el.getAttribute("class"),
        props: new Map(),
      };
      editRegistry.set(el, record);
    }
    return record;
  }

  function classListOf(el) {
    return (el.getAttribute("class") || "").split(/\s+/).filter(Boolean);
  }

  function writeClassList(el, classes) {
    if (classes.length === 0 && el.getAttribute("class") === null) return;
    el.setAttribute("class", classes.join(" "));
  }

  // Utility-class steps replace one class with another in place, so the source
  // edit Claude Code has to make is a one-word swap and the element keeps its
  // position in whatever order the framework wrote.
  function swapUtilityClass(el, from, to) {
    const classes = classListOf(el);
    const i = from ? classes.indexOf(from) : -1;
    if (i === -1) {
      if (to && !classes.includes(to)) {
        classes.push(to);
        writeClassList(el, classes);
      }
      return;
    }
    if (!to) classes.splice(i, 1);
    else if (classes.includes(to)) classes.splice(i, 1);
    else classes[i] = to;
    writeClassList(el, classes);
  }

  function applyDeclaration(el, prop, value, priority) {
    if (value === null || value === undefined || value === "") {
      el.style.removeProperty(prop);
    } else {
      el.style.setProperty(prop, value, priority === "important" ? "important" : "");
    }
  }

  // Put an element back exactly as it was found, attribute strings and all.
  //
  // The double removal is not redundant. Once an inline declaration block has
  // been written through CSSOM, Chrome's first removeAttribute empties the
  // block but leaves the attribute node in place, so the element keeps a
  // visible style="" — residue on the user's page from a tool that promised to
  // leave none. A second removal takes the node with it. Verified directly in
  // the browser; do not tidy this away.
  function restoreElement(record) {
    const el = record.el;
    if (record.originalStyleAttr === null) {
      el.removeAttribute("style");
      if (el.hasAttribute("style")) el.removeAttribute("style");
    } else {
      el.setAttribute("style", record.originalStyleAttr);
    }
    if (record.originalClassAttr === null) {
      el.removeAttribute("class");
      if (el.hasAttribute("class")) el.removeAttribute("class");
    } else {
      el.setAttribute("class", record.originalClassAttr);
    }
  }

  // The single write path. `next` is an EditValue:
  //   { css, inline, priority, cls, token }
  // css     — the value as it should read in a delta ("18px", "#d97757")
  // inline  — what to write to the style attribute, or null to remove it
  // cls     — the utility class realising this value, or null
  // token   — { kind: "class" | "var", name } when the value sits on a token
  // `prev` is what is on the element right now, and it has to be passed in
  // rather than looked up: callers record the new value before applying it, so
  // a lookup here would return the value being written and conclude that the
  // class had not changed — leaving a token step recorded but never performed.
  function applyEditValue(el, prop, next, prev) {
    const record = ensureEditRecord(el);
    const entry = record.props.get(prop);
    const current = prev !== undefined ? prev : (entry ? entry.after : null);
    const prevCls = current ? current.cls || null : null;
    if (prevCls !== (next.cls || null)) swapUtilityClass(el, prevCls, next.cls || null);
    applyDeclaration(el, prop, next.inline, next.priority);
    // The live-rect hook. There is no ResizeObserver anywhere in this
    // extension — tracking is scroll, resize and a throttled mousemove — so
    // padding or width scrubbed here would resize the element with nothing to
    // tell the tether about it, and the ticks would sit at a stale rect
    // precisely while the user is watching them. This is the one place that
    // knows for certain the geometry just changed.
    if (editing && el === selectedElement) renderTether({ instant: true });
  }

  // Read the element's current state for a property as an EditValue. This is
  // what `before` is captured from, once, at first touch.
  function readEditValue(el, prop) {
    const computed = getComputedStyle(el).getPropertyValue(prop).trim();
    const token = detectPropertyToken(el, prop, computed, tokenIndex);
    return {
      css: computed,
      inline: el.style.getPropertyValue(prop) || null,
      priority: el.style.getPropertyPriority(prop) || "",
      cls: token && token.kind === "class" ? token.name : null,
      token,
    };
  }

  // A page rule marked !important outranks a plain inline declaration, so the
  // edit would silently do nothing. Ask the cascade first rather than writing
  // and hoping: if the winning declaration is important and is not ours, match
  // it. Checked once per property per element, at first touch.
  function neededPriority(el, prop) {
    const winner = findWinningDeclaration(el, prop, tokenIndex);
    return winner && winner.important && !winner.fromInline ? "important" : "";
  }

  // A page that animates the property being scrubbed makes the element chase
  // the pointer half a second behind, which reads as the tool being slow
  // rather than the page being animated. Transitions are suppressed for the
  // length of a gesture and restored when it commits — recorded on the record,
  // so a gesture interrupted by anything at all still gives them back.
  function suppressTransitions(el) {
    const record = ensureEditRecord(el);
    if (record.heldTransition !== undefined) return;
    record.heldTransition = el.style.getPropertyValue("transition") || null;
    el.style.setProperty("transition", "none", "important");
  }

  function releaseTransitions(el) {
    const record = editRegistry.get(el);
    if (!record || record.heldTransition === undefined) return;
    if (record.heldTransition === null) el.style.removeProperty("transition");
    else el.style.setProperty("transition", record.heldTransition);
    delete record.heldTransition;
  }

  function pruneRecord(el) {
    const record = editRegistry.get(el);
    if (!record) return;
    if (record.props.size === 0) {
      restoreElement(record);
      editRegistry.delete(el);
    }
  }

  // ===== Edit History =====
  // One chronological stack across every element touched this session, because
  // a mistake is undone when it is noticed, not when its element happens to be
  // selected again. Undo landing on some other element flashes that element's
  // box so the change is never invisible.
  //
  // Continuous gestures — a scrub, a held arrow key, a drag in the colour
  // picker — repaint many times and must land as one entry. beginEditGesture
  // captures `before` at the start, commitEditGesture pushes once at the end.

  function isEditedProp(el, prop) {
    const record = editRegistry.get(el);
    return Boolean(record && record.props.has(prop));
  }

  function editedPropCount(el) {
    const record = editRegistry.get(el);
    return record ? record.props.size : 0;
  }

  // Two different "before"s, and conflating them is what makes an undo stack
  // wrong. `origin` is the value at first touch and belongs to the delta —
  // the block should report where the property started, however many times it
  // was nudged since. `from` is the value this particular gesture is leaving,
  // and belongs to the undo entry, because one Cmd+Z should give back one
  // change rather than the whole session's worth.
  function beginEditGesture(el, prop) {
    if (editGesture && editGesture.el === el && editGesture.prop === prop) return;
    commitEditGesture();
    const record = ensureEditRecord(el);
    const entry = record.props.get(prop);
    const current = entry ? entry.after : readEditValue(el, prop);
    editGesture = {
      el,
      prop,
      origin: entry ? entry.before : current,
      from: current,
      hadEntry: Boolean(entry),
    };
    clearTimeout(tetherLoudTimer);
    setTetherLoud(true);
  }

  // Write a value as part of the open gesture. No history until it commits.
  function setEditValue(el, prop, next) {
    beginEditGesture(el, prop);
    const record = ensureEditRecord(el);
    const entry = record.props.get(prop);
    const before = entry ? entry.before : editGesture.origin;
    // On the first touch the element still wears whatever it started with, so
    // that is what a class swap has to replace.
    const prev = entry ? entry.after : before;
    applyEditValue(el, prop, next, prev);
    record.props.set(prop, { before, after: next });
  }

  function commitEditGesture() {
    const g = editGesture;
    editGesture = null;
    if (!g) return;
    // The gesture is over; the tether settles a beat later rather than snapping
    // quiet under the pointer that was just scrubbing it.
    if (editing) bumpTether();
    // Whatever ended the gesture — a pointerup, Escape, a deselect — the page's
    // own transitions come back before anything else happens.
    releaseTransitions(g.el);
    const record = editRegistry.get(g.el);
    const entry = record && record.props.get(g.prop);
    if (!entry) return;
    if (sameEditValue(entry.before, entry.after)) {
      // Scrubbed away and back again: not an edit, and not history.
      record.props.delete(g.prop);
      applyEditValue(g.el, g.prop, entry.before, entry.after);
      pruneRecord(g.el);
      return;
    }
    // Nothing moved during this gesture — a scrub that ended where it started.
    if (sameEditValue(g.from, entry.after)) return;
    pushUndo({ kind: "single", el: g.el, prop: g.prop, before: g.from, after: entry.after });
  }

  // Two values are the same edit when they render the same, from the same
  // token — the value, not the mechanism that achieves it. Comparing the
  // inline string instead would call "no inline declaration, 0px from a
  // stylesheet" and "inline 0px" different, so scrubbing a property away and
  // back would leave a dirty dot and a delta line for a change nobody can see.
  function sameEditValue(a, b) {
    if (!a || !b) return a === b;
    return a.css === b.css && (a.cls || null) === (b.cls || null);
  }

  function pushUndo(entry) {
    undoStack.push(entry);
    // A new edit forks the timeline; anything undone past this point is gone.
    redoStack.length = 0;
  }

  // Revert one property to what it was at first touch — itself an undoable
  // step, so the timeline stays strictly chronological.
  function resetEditProp(el, prop) {
    const record = editRegistry.get(el);
    const entry = record && record.props.get(prop);
    if (!entry) return;
    commitEditGesture();
    record.props.delete(prop);
    applyEditValue(el, prop, entry.before, entry.after);
    pushUndo({ kind: "single", el, prop, before: entry.after, after: entry.before, isReset: true });
    pruneRecord(el);
  }

  // Every element, every property, back to how it was found — one entry.
  function resetAllEdits() {
    commitEditGesture();
    if (editRegistry.size === 0) return;
    const items = [];
    for (const record of editRegistry.values()) {
      items.push({
        el: record.el,
        styleAttr: record.originalStyleAttr,
        classAttr: record.originalClassAttr,
        props: new Map(record.props),
      });
      restoreElement(record);
    }
    editRegistry.clear();
    pushUndo({ kind: "batch", items });
  }

  function applyUndoEntry(entry, direction) {
    if (entry.kind === "batch") {
      if (direction === "undo") {
        // Put every element's edits back.
        for (const item of entry.items) {
          const record = ensureEditRecord(item.el);
          record.originalStyleAttr = item.styleAttr;
          record.originalClassAttr = item.classAttr;
          record.props = new Map(item.props);
          // The element was restored to its original state by the reset this
          // is undoing, so that original is what each value is replacing.
          for (const [prop, e] of record.props) applyEditValue(item.el, prop, e.after, e.before);
        }
      } else {
        for (const item of entry.items) {
          const record = editRegistry.get(item.el);
          if (record) restoreElement(record);
          editRegistry.delete(item.el);
        }
      }
      return entry.items.length ? entry.items[0].el : null;
    }

    const value = direction === "undo" ? entry.before : entry.after;
    const other = direction === "undo" ? entry.after : entry.before;
    const record = ensureEditRecord(entry.el);
    const original = record.props.get(entry.prop);
    const baseline = original ? original.before : other;
    // Undo and redo swap between exactly two states, so the one being left is
    // always the other side of this entry.
    applyEditValue(entry.el, entry.prop, value, other);
    if (sameEditValue(value, baseline) && !record.props.has(entry.prop)) {
      // Back at the untouched state: the property is no longer an edit.
      record.props.delete(entry.prop);
    } else if (sameEditValue(value, baseline)) {
      record.props.delete(entry.prop);
    } else {
      record.props.set(entry.prop, { before: baseline, after: value });
    }
    pruneRecord(entry.el);
    return entry.el;
  }

  function performUndo() {
    commitEditGesture();
    const entry = undoStack.pop();
    if (!entry) return null;
    const el = applyUndoEntry(entry, "undo");
    redoStack.push(entry);
    return el;
  }

  function performRedo() {
    commitEditGesture();
    const entry = redoStack.pop();
    if (!entry) return null;
    const el = applyUndoEntry(entry, "redo");
    undoStack.push(entry);
    return el;
  }

  // ===== Edit Deltas =====
  // What the panel copies: the same pointer header Copy Code emits, plus what
  // changed. The before-value earns its place — in a utility-class or token
  // codebase the old value is how you find the declaration to edit, and
  // "14px → 18px" is a far weaker instruction than "text-base → text-lg".

  // Properties read out in a fixed order, so the same set of edits always
  // produces the same block no matter what order they were made in.
  const EDIT_PROP_ORDER = [
    "font-size", "font-weight", "line-height", "letter-spacing", "text-align", "color",
    "padding", "margin", "gap",
    "width", "height",
    "background-color", "opacity",
    "border-width", "border-color", "border-radius",
    "box-shadow",
  ];

  // A side longhand sorts where its shorthand sorts, so opening padding into
  // its four sides does not scatter them through the block — padding-top
  // belongs next to margin, not after box-shadow.
  function editPropRank(prop) {
    const i = EDIT_PROP_ORDER.indexOf(prop);
    if (i !== -1) return i;
    const shorthand = SHORTHAND_OF[prop];
    const j = shorthand ? EDIT_PROP_ORDER.indexOf(shorthand) : -1;
    return j === -1 ? EDIT_PROP_ORDER.length : j;
  }

  // A token name is what the source contains, so it leads; the pixel value
  // follows in parentheses because it is what the eye was actually judging.
  function formatEditSide(value) {
    if (!value) return "";
    if (value.token && value.token.name) return `${value.token.name} (${value.css})`;
    return value.css;
  }

  // [{ prop, before, after }] → the "# edits:" lines. Pure — mirrored in
  // test/edit-deltas.mjs.
  function buildEditLines(entries) {
    const sorted = (entries || [])
      .filter((e) => e && e.prop)
      .slice()
      .sort((a, b) => editPropRank(a.prop) - editPropRank(b.prop) || a.prop.localeCompare(b.prop));
    if (sorted.length === 0) return [];
    return [
      "# edits: apply these style changes to this element in the source",
      ...sorted.map((e) => `#   ${e.prop}: ${formatEditSide(e.before)} → ${formatEditSide(e.after)}`),
    ];
  }

  function editEntriesFor(el) {
    const record = editRegistry.get(el);
    if (!record) return [];
    return Array.from(record.props, ([prop, e]) => ({ prop, before: e.before, after: e.after }));
  }

  function buildEditsBlock(el) {
    const { header, located } = buildPointerHeader(el);
    const lines = buildEditLines(editEntriesFor(el));
    const html = located ? buildRootTag(el) : buildSkeletonHTML(el);
    const body = lines.length ? header + "\n" + lines.join("\n") : header;
    return "```\n" + body + "\n" + html + "\n```";
  }

  // ===== Event Handlers =====
  function onMouseMove(e) {
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;

    // Hover tracking stays dead while something is selected — except for
    // redline, which needs to know what the cursor is over. Modifier state is
    // re-read from every event on purpose: a keyup we never saw (released
    // during Alt+Tab, or over an iframe) can neither strand nor miss the mode.
    if (selectedElement) {
      if (redlining && !e.altKey) stopRedline();
      else if (!redlining && e.altKey) startRedline();
      if (!redlining) return;

      const target = getTargetElement(e, redlineTarget);
      if (target === redlineTarget) return;
      redlineTarget = target;
      scheduleRedline();
      return;
    }

    const target = getTargetElement(e);
    if (target === hoveredElement) return;

    hoveredElement = target;

    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      if (hoveredElement && probeActive) {
        updateOverlay(hoveredElement);
      }
    });
  }

  // The chrome is position:fixed, so anything that moves the element relative to
  // the viewport invalidates every box we've drawn. Hover repairs itself on the
  // next mousemove, but a selection would otherwise sit frozen at stale
  // coordinates until you clicked something else.
  function onViewportChange() {
    if (!probeActive || viewportRafId) return;
    viewportRafId = requestAnimationFrame(() => {
      viewportRafId = null;
      const el = selectedElement || hoveredElement;
      if (!probeActive || !el) return;
      updateOverlay(el, { instant: true, keepContent: true });
      // Measurements are viewport-relative too, so they track in the same
      // frame — instant, because chasing a scroll with a glide reads as lag
      if (redlining) renderRedline({ instant: true });
      // The panel is viewport-anchored, not element-anchored: a resize can
      // strand it off-screen, so pull it back without moving it otherwise.
      // The tether joins the two, so it redraws after the panel has settled.
      if (editing) {
        placeEditPanel();
        renderTether({ instant: true });
      }
    });
  }

  function onClick(e) {
    if (!probeActive) return;

    // Ignore clicks on our own chrome. Everything interactive we inject has to be
    // listed here — this handler preventDefaults and stops propagation on every
    // other click on the page, so anything missing gets its clicks eaten and
    // selects the element behind it instead.
    if (toolbarEl && toolbarEl.contains(e.target)) return;
    if (settingsButtonEl && settingsButtonEl.contains(e.target)) return;
    if (toastEl && toastEl.contains(e.target)) return;
    if (editPanelEl && editPanelEl.contains(e.target)) return;

    e.preventDefault();
    e.stopImmediatePropagation();

    // The page is inert while editing: no re-selecting, and no Option+click
    // re-anchoring either, since that path runs through selection. Measuring
    // still works — it just cannot move the thing being edited.
    if (editing) return;

    const target = getTargetElement(e);
    if (!target) return;

    // If already selected, deselect first
    if (selectedElement) {
      deselectElement();
    }

    selectedElement = target;
    hoveredElement = target;
    updateOverlay(target);

    if (overlayContainer) {
      overlayContainer.classList.add("ccp-selected");
    }

    showToolbar(target);

    // Clicking while measuring re-anchors: deselectElement() above ended the
    // previous redline, so re-enter from the event's own modifier state. The
    // new selection is also the element under the cursor, so nothing draws
    // until the pointer moves onto something else.
    if (e.altKey) startRedline();
  }

  function onKeyDown(e) {
    // Option/Alt arms redline — only in select mode, and only bare Alt so
    // browser Alt-combos keep working. No e.repeat re-entry: startRedline()
    // is a no-op while active, but skipping the call keeps intent obvious.
    if (e.key === "Alt" && !e.repeat && !e.ctrlKey && !e.metaKey && selectedElement) {
      e.preventDefault();
      startRedline();
      return;
    }

    // Undo walks one chronological timeline across every element edited this
    // session. It only claims the key when there is something to undo — with
    // an empty stack the page keeps its own Cmd+Z, which matters on the kind
    // of page (an editor, a form) people are most likely to be tuning.
    if (editing && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
      if (isTextEntry(e.target)) return; // let a field undo its own typing
      const el = e.shiftKey ? performRedo() : performUndo();
      if (el) {
        e.preventDefault();
        e.stopImmediatePropagation();
        onEditHistoryApplied(el);
      }
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      e.stopImmediatePropagation();

      // Stages out: picker → editing → selected → probe off. Each Escape gives
      // back exactly one layer, so nothing is ever lost by more than a step.
      if (editPopoverEl) {
        closeColorPicker();
      } else if (editing) {
        exitEditMode();
      } else if (selectedElement) {
        deselectElement();
      } else {
        // Notify background to update badge
        chrome.runtime.sendMessage({ type: "DEACTIVATE" });
        deactivate();
      }
    }
  }

  function isTextEntry(node) {
    if (!node) return false;
    const tag = node.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || node.isContentEditable === true;
  }

  function onKeyUp(e) {
    if (e.key === "Alt" && redlining) {
      // A bare-Alt keyup focuses the browser's menu bar on Windows; the key
      // was consumed as a mode hold, so suppress that.
      e.preventDefault();
      stopRedline();
    }
  }

  function onWindowBlur() {
    stopRedline();
  }

  // `keep` is what a hit on our own chrome resolves to — the hover path keeps
  // its current element, redline keeps its current target.
  function getTargetElement(e, keep = hoveredElement) {
    // Use elementFromPoint to ignore our overlay
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el) return null;
    // Skip our own elements. The id check only catches a top-level root — an
    // unprefixed child (a <span> inside a button, an SVG path) needs the
    // closest() clauses, so every root we inject has to appear in both lists.
    if (
      el.id?.startsWith("ccp-") ||
      el.closest("#ccp-overlay-container") ||
      el.closest("#ccp-toolbar") ||
      el.closest("#ccp-label") ||
      el.closest("#ccp-settings-btn") ||
      el.closest("#ccp-toast") ||
      el.closest("#ccp-edit-panel")
    ) {
      return keep;
    }
    return el;
  }

  function deselectElement() {
    exitEditMode(); // and every deselection path ends editing — same reason
    stopRedline(); // every deselection path ends redline — it has no anchor
    selectedElement = null;
    if (overlayContainer) {
      overlayContainer.classList.remove("ccp-selected");
    }
    removeToolbar();
  }

  // ===== Toolbar =====
  function showToolbar(el) {
    removeToolbar();

    toolbarEl = document.createElement("div");
    toolbarEl.id = "ccp-toolbar";

    // Copy actions live in the bar; Select Parent is a sibling button beside it.
    // Both are flex children of #ccp-toolbar with align-items:stretch, so the
    // button always matches the bar's height without hard-coded padding.
    const bar = document.createElement("div");
    bar.className = "ccp-bar";

    // Actions read selectedElement at click time so they follow "Select Parent" hops.
    // Edit is icon-only: it opens a mode rather than performing an action, and the
    // two labelled buttons beside it are what the bar is for.
    const buttons = [
      { label: "Copy Code", icon: ICONS.code, action: (btnEl) => copyElement(selectedElement, btnEl) },
      { label: "Screenshot", icon: ICONS.camera, action: (btnEl) => copyScreenshot(selectedElement, btnEl) },
      { label: "Edit", icon: ICONS.edit, iconOnly: true, action: () => enterEditMode() },
    ];

    for (const btn of buttons) {
      const button = document.createElement("button");
      button.dataset.origHtml = btn.icon + (btn.iconOnly ? "" : `<span>${btn.label}</span>`);
      button.innerHTML = button.dataset.origHtml;
      if (btn.iconOnly) {
        button.className = "ccp-icon-btn";
        button.title = btn.label;
        button.setAttribute("aria-label", btn.label);
      }
      button.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.action(button);
      });
      bar.appendChild(button);
    }

    parentButtonEl = document.createElement("button");
    parentButtonEl.className = "ccp-parent-btn";
    parentButtonEl.innerHTML = ICONS.parent + `<span>Select Parent</span>`;
    parentButtonEl.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      selectParent();
    });

    toolbarEl.appendChild(bar);
    toolbarEl.appendChild(parentButtonEl);

    document.documentElement.appendChild(toolbarEl);
    updateParentButton();

    // Lock widths before placing: the toolbar has to be measured at its final
    // size, or it gets positioned against a width that then changes under it.
    updateToolbarDensity(document.documentElement.clientWidth);
    lockButtonWidths();
    layoutChrome(el, { newToolbar: true });
  }

  // ===== Select Parent =====
  function getSelectableParent(el) {
    const parent = el?.parentElement;
    // Stop at <body> — <html> has no meaningful selector or screenshot
    if (!parent || parent === document.documentElement) return null;
    return parent;
  }

  function updateParentButton() {
    if (!parentButtonEl) return;
    const disabled = !getSelectableParent(selectedElement);
    parentButtonEl.disabled = disabled;
    parentButtonEl.classList.toggle("ccp-button-disabled", disabled);
    parentButtonEl.title = disabled
      ? "No parent element to select"
      : "Select this element's parent";
  }

  function selectParent() {
    const parent = getSelectableParent(selectedElement);
    if (!parent) return;

    selectedElement = parent;
    hoveredElement = parent;
    updateOverlay(parent); // glides both boxes to the parent's geometry
    updateParentButton();
  }

  function removeToolbar() {
    if (toolbarEl) {
      toolbarEl.remove();
      toolbarEl = null;
    }
    parentButtonEl = null;
  }

  // ===== Selector Builder =====
  function buildSelector(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === "html" || tag === "body") return tag;

    let selector = tag;
    if (el.id) {
      return `${tag}#${el.id}`;
    }

    // A test id identifies far better than a pile of utility classes
    const testId = el.getAttribute("data-testid") || el.getAttribute("data-test");
    if (testId) {
      return `${tag}[data-testid="${testId}"]`;
    }

    const classes = Array.from(el.classList)
      .filter((c) => !c.startsWith("ccp-"))
      .slice(0, 2);
    if (classes.length > 0) {
      selector += classes.map((c) => `.${c}`).join("");
    }

    // Add nth-child if selector isn't unique among siblings
    const parent = el.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (s) => s.tagName === el.tagName
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(el) + 1;
        selector += `:nth-child(${index})`;
      }
    }

    return selector;
  }

  function buildSelectorPath(el) {
    // An id or test id on the element itself already resolves — no path needed
    if (el.id) return `#${el.id}`;
    const ownTestId = el.getAttribute("data-testid") || el.getAttribute("data-test");
    if (ownTestId && document.querySelectorAll(`[data-testid="${ownTestId}"]`).length === 1) {
      return buildSelector(el);
    }

    const parts = [];
    let current = el;
    while (current && current !== document.documentElement) {
      const sel = buildSelector(current);
      parts.unshift(sel);
      // Stop early if we hit an element with an ID (already unique)
      if (current.id) break;
      current = current.parentElement;
    }
    return parts.join(" > ");
  }

  // ===== Resolve background color =====
  function resolveBackgroundColor(el) {
    let current = el;
    while (current && current !== document.documentElement) {
      const bg = getComputedStyle(current).backgroundColor;
      // Skip transparent / rgba with 0 alpha
      if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") {
        return bg;
      }
      current = current.parentElement;
    }
    // Not a design value and not themed: this is the browser's own default page
    // background, reported as a fact about the page being inspected. Theming it
    // would make the tool misreport what it is looking at.
    return "#ffffff";
  }

  // ===== Skeleton HTML Builder =====
  // Attributes are reproduced whole \u2014 on a utility-CSS project the class list is
  // the construct being pointed at, so eliding the middle of it removes the edit target.
  // Source-tooling attributes are dropped: they are already reported as `source:`.
  const TOOLING_ATTR = /^(data-inspector|data-source|data-v-inspector)/;

  function formatAttrs(el) {
    return Array.from(el.attributes)
      .filter((a) => !a.name.startsWith("ccp-") && a.name !== "style" && !TOOLING_ATTR.test(a.name))
      .map((a) => ` ${a.name}="${a.value}"`)
      .join("");
  }

  const SELF_CLOSING = ["img", "br", "hr", "input", "meta", "link", "area", "base", "col", "embed", "source", "track", "wbr"];

  function buildSkeletonHTML(el, depth = 0, maxDepth = 3) {
    const tag = el.tagName.toLowerCase();
    const attrs = formatAttrs(el);

    if (SELF_CLOSING.includes(tag)) {
      return `<${tag}${attrs} />`;
    }

    const indent = "  ".repeat(depth);
    const childIndent = "  ".repeat(depth + 1);

    // Collect children: text nodes + elements
    const parts = [];
    for (const child of el.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent.trim();
        if (text) {
          parts.push(text.length > 50 ? text.slice(0, 47) + "\u2026" : text);
        }
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        if (depth + 1 >= maxDepth) {
          const n = child.children.length;
          const childTag = child.tagName.toLowerCase();
          parts.push(`<${childTag}${formatAttrs(child)}>${n > 0 ? `<!-- ${n} children -->` : "\u2026"}</${childTag}>`);
        } else {
          parts.push(buildSkeletonHTML(child, depth + 1, maxDepth));
        }
      }
    }

    if (parts.length === 0) {
      return `<${tag}${attrs}></${tag}>`;
    }

    // If only a single short text node, keep inline
    if (parts.length === 1 && !parts[0].startsWith("<") && parts[0].length < 60) {
      return `<${tag}${attrs}>${parts[0]}</${tag}>`;
    }

    return `<${tag}${attrs}>\n${parts.map((p) => childIndent + p).join("\n")}\n${indent}</${tag}>`;
  }

  // ===== Source-discovery helpers =====
  function getVisibleText(el) {
    const raw = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (!raw) return "";
    return raw.length > 200 ? raw.slice(0, 197) + "\u2026" : raw;
  }

  function isDevOrigin() {
    const h = window.location.hostname;
    if (!h) return false;
    if (h === "localhost" || h === "0.0.0.0") return true;
    if (h === "127.0.0.1" || h === "::1") return true;
    if (h.endsWith(".local") || h.endsWith(".localhost")) return true;
    if (/^10\./.test(h)) return true;
    if (/^192\.168\./.test(h)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
    return false;
  }

  function getPageString() {
    const loc = window.location;
    const path = loc.pathname || "/";
    const tail = (loc.search || "") + (loc.hash || "");
    return isDevOrigin() ? `${loc.origin}${path}${tail}` : `${path}${tail}`;
  }

  // ===== Pointer fields =====
  // The payload's job is to point at a source construct, not to describe the DOM.
  // Each helper returns a string, an array of lines, or null to be omitted.

  // Our own chrome is excluded from the page when counting how unique a text
  // string or attribute is — otherwise the label's own readout of an element
  // gets counted as a second occurrence of it.
  const OUR_CHROME =
    "#ccp-toolbar,#ccp-label,#ccp-overlay-container,#ccp-settings-btn,#ccp-toast";

  // Trim an absolute path down to something that reads as project-relative.
  function toProjectPath(p) {
    const m = p.match(/\/(?:src|app|pages|components|lib|routes)\//);
    if (m) return p.slice(p.indexOf(m[0]) + 1);
    const parts = p.split("/");
    return parts.length > 2 ? parts.slice(-2).join("/") : p;
  }

  // Source location, read from whatever the dev tooling already emits as attributes.
  function readSourceAttrs(node) {
    const relPath = node.getAttribute("data-inspector-relative-path");
    if (relPath) {
      const line = node.getAttribute("data-inspector-line");
      const col = node.getAttribute("data-inspector-column");
      return relPath + (line ? `:${line}` : "") + (line && col ? `:${col}` : "");
    }
    const inspector = node.getAttribute("data-v-inspector") || node.getAttribute("data-inspector");
    if (inspector) return toProjectPath(inspector);

    const loc = node.getAttribute("data-source-loc");
    if (loc) return toProjectPath(loc);

    const file = node.getAttribute("data-source-file");
    if (file) {
      const line = node.getAttribute("data-source-line");
      return toProjectPath(file) + (line ? `:${line}` : "");
    }
    return null;
  }

  function getSourceLocation(el) {
    const own = readSourceAttrs(el);
    if (own) return own;

    // Fall back to the nearest annotated ancestor, said out loud so the pointer isn't
    // mistaken for the element's own location.
    let node = el.parentElement;
    for (let i = 0; node && i < 3; i++, node = node.parentElement) {
      const found = readSourceAttrs(node);
      if (found) return `${found} (nearest annotated ancestor: ${briefName(node)})`;
    }
    return null;
  }

  // Component ancestry. Reading fibers needs page-world access — see README.
  function getComponentChain(el, max = 3) {
    const names = [];
    const fiberKey = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
    if (fiberKey) {
      let fiber = el[fiberKey];
      while (fiber && names.length < max) {
        const t = fiber.type;
        const name =
          t && (typeof t === "function" || typeof t === "object")
            ? t.displayName || t.name || (t.render && (t.render.displayName || t.render.name))
            : null;
        if (name && /^[A-Z]/.test(name) && names[names.length - 1] !== name) names.push(name);
        fiber = fiber.return;
      }
    }
    if (names.length === 0) {
      let c = el.__vueParentComponent;
      while (c && names.length < max) {
        const n = c.type && (c.type.__name || c.type.name);
        if (n && names[names.length - 1] !== n) names.push(n);
        c = c.parent;
      }
    }
    if (names.length === 0) {
      const host = el.closest("[data-component]");
      if (host) names.push(host.getAttribute("data-component"));
    }
    return names.length > 0 ? names.join(" <- ") : null;
  }

  // The function names bound to the element — names only, never values.
  function getHandlers(el) {
    const out = [];
    for (const attr of el.attributes) {
      if (!/^on[a-z]+$/i.test(attr.name) || !attr.value) continue;
      const called = attr.value.match(/([A-Za-z_$][\w$]*)\s*\(/);
      out.push(`${attr.name}=${called ? called[1] : attr.value.slice(0, 24)}`);
    }
    const propsKey = Object.keys(el).find((k) => k.startsWith("__reactProps$"));
    if (propsKey) {
      const props = el[propsKey] || {};
      for (const k of Object.keys(props)) {
        if (!/^on[A-Z]/.test(k) || typeof props[k] !== "function") continue;
        out.push(`${k}=${props[k].name || "anonymous"}`);
      }
    }
    return out.length > 0 ? out.join(", ") : null;
  }

  function cssAttrSelector(name, value) {
    return `[${name}="${value.replace(/["\\]/g, "\\$&")}"]`;
  }

  function countMatches(selector) {
    try {
      return document.querySelectorAll(selector).length;
    } catch {
      return 0;
    }
  }

  // First non-empty text node inside the element — what a grep for source would hit.
  function firstTextNode(el) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const t = node.textContent.replace(/\s+/g, " ").trim();
      if (t) return t;
    }
    return "";
  }

  // How many text nodes elsewhere in the page carry exactly this string. Ancestors and
  // descendants are excluded by walking text nodes rather than elements.
  function countTextElsewhere(el, target) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    let n = 0;
    while ((node = walker.nextNode())) {
      if (el.contains(node)) continue;
      const parent = node.parentElement;
      if (!parent || parent.closest(OUR_CHROME)) continue;
      if (node.textContent.replace(/\s+/g, " ").trim() === target) n++;
      if (n > 99) break;
    }
    return n;
  }

  // The best search target on the element, with a verdict on whether it actually resolves.
  function getAnchor(el) {
    const lines = [];
    for (const name of ["data-testid", "data-test", "data-cy", "data-component", "id"]) {
      const v = el.getAttribute(name);
      if (!v) continue;
      const n = countMatches(name === "id" ? cssAttrSelector("id", v) : cssAttrSelector(name, v));
      lines.push(`${name}="${v}" ${n === 1 ? "(unique in page)" : `(${n} matches)`}`);
      break;
    }

    const text = firstTextNode(el);
    if (text) {
      const shown = text.length > 40 ? text.slice(0, 40) + "\u2026" : text;
      const n = countTextElsewhere(el, text);
      lines.push(
        n === 0
          ? `text "${shown}" (unique in page)`
          : `text "${shown}" (also on ${n} other element${n > 1 ? "s" : ""} - weak grep target)`
      );
    }
    return lines.length > 0 ? lines : null;
  }

  function briefName(node) {
    if (!node) return null;
    const tag = node.tagName.toLowerCase();
    if (node.id) return `${tag}#${node.id}`;
    const cls = Array.from(node.classList).filter((c) => !c.startsWith("ccp-"))[0];
    return cls ? `${tag}.${cls}` : tag;
  }

  function siblingLabel(node) {
    if (!node) return null;
    const text = firstTextNode(node);
    const hint = text ? ` "${text.length > 20 ? text.slice(0, 20) + "\u2026" : text}"` : "";
    return briefName(node) + hint;
  }

  // Where the element sits — what "insert after this" needs in order to resolve.
  function getPosition(el) {
    const parent = el.parentElement;
    if (!parent || parent === document.documentElement) return null;

    const kids = Array.from(parent.children);
    const lines = [`child ${kids.indexOf(el) + 1} of ${kids.length} in ${briefName(parent)}`];

    const after = siblingLabel(el.previousElementSibling);
    const before = siblingLabel(el.nextElementSibling);
    const neighbours = [after && `after ${after}`, before && `before ${before}`].filter(Boolean);
    if (neighbours.length > 0) lines.push(neighbours.join(", "));

    return lines;
  }

  // Tag + sorted class list: two siblings sharing one are almost always one template.
  function signatureOf(node) {
    const cls = Array.from(node.classList)
      .filter((c) => !c.startsWith("ccp-"))
      .sort()
      .join(".");
    return node.tagName + (cls ? "." + cls : "");
  }

  function getRepetition(el) {
    const parent = el.parentElement;
    if (!parent) return null;
    const sig = signatureOf(el);
    const twins = Array.from(parent.children).filter((c) => signatureOf(c) === sig);
    if (twins.length < 2) return null;
    return [
      `${twins.indexOf(el) + 1} of ${twins.length} identical siblings - likely one template; change`,
      `the component or the data unless this instance alone is meant`,
    ];
  }

  // The element's own tag, whole, with its children summarised rather than reproduced.
  function buildRootTag(el) {
    const tag = el.tagName.toLowerCase();
    const attrs = formatAttrs(el);
    if (SELF_CLOSING.includes(tag)) return `<${tag}${attrs} />`;

    const n = el.children.length;
    if (n > 0) return `<${tag}${attrs}> \u2026 ${n} child${n > 1 ? "ren" : ""} </${tag}>`;

    const text = getDirectText(el);
    const inner = text.length > 60 ? text.slice(0, 57) + "\u2026" : text;
    return `<${tag}${attrs}>${inner}</${tag}>`;
  }

  // ===== Build Structured Element Info =====
  // The pointer header alone, shared by Copy Code and the Edit Mode delta block so
  // both name an element in exactly the same dialect. `located` reports whether a
  // source file or component chain was found — the caller's cue for how much of
  // the rendered subtree the payload still needs to carry.
  function buildPointerHeader(el) {
    const source = getSourceLocation(el);
    const component = getComponentChain(el);

    const fields = [];
    const push = (key, value) => {
      if (!value || (Array.isArray(value) && value.length === 0)) return;
      fields.push({ key, lines: Array.isArray(value) ? value : [value] });
    };

    push("source", source);
    push("component", component);
    push("page", getPageString());
    push("anchor", getAnchor(el));
    push("handlers", getHandlers(el));
    push("selector", buildSelectorPath(el));
    push("position", getPosition(el));
    push("repeated", getRepetition(el));
    push("text", getVisibleText(el));

    const header = fields
      .map((f) => f.lines.map((l, i) => (i === 0 ? `# ${f.key}: ` : "#   ") + l).join("\n"))
      .join("\n");

    return { header, located: Boolean(source || component) };
  }

  // A fenced comment header: no per-field tags, and the fence both delimits the block
  // from the surrounding prompt and stops "#" from rendering as a markdown heading.
  function buildElementInfo(el) {
    const { header, located } = buildPointerHeader(el);

    // With a file or component to open, the agent reads the real source and a rendered
    // subtree is a lossy copy of it. With neither, the subtree is all the payload has.
    const html = located ? buildRootTag(el) : buildSkeletonHTML(el);

    return "```\n" + header + "\n" + html + "\n```";
  }

  // ===== Screenshot Capture =====
  async function captureElementScreenshot(el) {
    const canvas = await html2canvas(el, {
      backgroundColor: resolveBackgroundColor(el),
      logging: false,
      useCORS: true,
      scale: window.devicePixelRatio || 1,
    });

    return new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
    });
  }

  async function writeImageToClipboard(blob) {
    try {
      const item = new ClipboardItem({
        "image/png": Promise.resolve(blob),
      });
      await navigator.clipboard.write([item]);
      return true;
    } catch {
      // Clipboard writes need a focused document and can be denied outright;
      // fall back to handing the user the file instead of losing the capture.
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "element-screenshot.png";
      a.click();
      URL.revokeObjectURL(url);
      return false;
    }
  }

  // ===== Button State Helpers =====
  function setButtonLoading(btnEl) {
    if (!btnEl) return;
    btnEl.innerHTML = CLAWD_MINI + `<span>Copying...</span>`;
    btnEl.disabled = true;
    btnEl.style.opacity = token("--ccp-opacity-loading", "0.7");
  }

  function setButtonSuccess(btnEl, message) {
    if (!btnEl) return;
    btnEl.innerHTML = `<span>${message}</span>`;
    btnEl.disabled = true;
    setTimeout(() => {
      if (btnEl && btnEl.dataset.origHtml) {
        btnEl.innerHTML = btnEl.dataset.origHtml;
        btnEl.disabled = false;
        btnEl.style.opacity = "";
      }
    }, 1500);
  }

  function resetButton(btnEl) {
    if (!btnEl) return;
    if (btnEl.dataset.origHtml) {
      btnEl.innerHTML = btnEl.dataset.origHtml;
    }
    btnEl.disabled = false;
    btnEl.style.opacity = "";
  }

  // ===== Clipboard Actions =====
  async function copyElement(el, btnEl) {
    try {
      const info = buildElementInfo(el);
      await navigator.clipboard.writeText(info);
      setButtonSuccess(btnEl, "Copied!");
    } catch (err) {
      resetButton(btnEl);
      showToast("Failed to copy: " + err.message, true);
    }
  }

  async function copyScreenshot(el, btnEl) {
    try {
      setButtonLoading(btnEl);
      const blob = await captureElementScreenshot(el);
      const ok = await writeImageToClipboard(blob);
      setButtonSuccess(btnEl, ok ? "Copied!" : "Downloaded!");
    } catch (err) {
      resetButton(btnEl);
      showToast("Failed to capture: " + err.message, true);
    }
  }

  // ===== Toast =====
  // The `isLoading` variant (CLAWD_MINI plus text) was never reachable — no
  // caller ever passed a third argument, and the loading affordance in practice
  // is setButtonLoading() on the button itself. Removed with the signature.
  function showToast(message, isError = false) {
    if (toastTimer) clearTimeout(toastTimer);

    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.id = "ccp-toast";
    }

    toastEl.textContent = message;
    toastEl.className = isError ? "ccp-toast-error" : "";

    const z = token("--ccp-z-chrome", "2147483647");

    // Position next to toolbar if visible, otherwise fixed bottom-right
    if (toolbarEl && toolbarEl.parentElement) {
      document.documentElement.appendChild(toastEl);
      const toolbarRect = toolbarEl.getBoundingClientRect();
      const gap = parseFloat(token("--ccp-gap-section", "8px")) || 8;
      toastEl.style.position = "fixed";
      toastEl.style.top = toolbarRect.top + "px";
      toastEl.style.left = (toolbarRect.right + gap) + "px";
      toastEl.style.height = toolbarRect.height + "px";
      toastEl.style.zIndex = z;
    } else {
      const inset = token("--ccp-toast-inset", "24px");
      document.documentElement.appendChild(toastEl);
      toastEl.style.position = "fixed";
      toastEl.style.bottom = inset;
      toastEl.style.right = inset;
      toastEl.style.top = "";
      toastEl.style.left = "";
      toastEl.style.zIndex = z;
    }

    // Force reflow for transition
    toastEl.offsetHeight;
    toastEl.classList.add("ccp-toast-visible");

    toastTimer = setTimeout(() => {
      if (toastEl) {
        toastEl.classList.remove("ccp-toast-visible");
        toastTimer = setTimeout(() => {
          if (toastEl) {
            toastEl.remove();
            toastEl = null;
          }
        }, 300);
      }
    }, 2000);
  }
})();
