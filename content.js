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
  // GUIDE_OVERSHOOT / PILL_MARGIN in test/redline.mjs. Change them here and
  // change them there.
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
    // stays put instead.
    settingsButtonEl.classList.toggle("ccp-yielded", !redlining && (hit(labelEl) || hit(toolbarEl)));
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
    // The redline nodes went down with the container; drop the pool refs
    redlineEl = null;
    redlineHoverEl = null;
    redlineLineEls = [];
    redlineGuideEls = [];
    redlinePillEls = [];
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

    e.preventDefault();
    e.stopImmediatePropagation();

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

    if (e.key === "Escape") {
      e.preventDefault();
      e.stopImmediatePropagation();

      if (selectedElement) {
        deselectElement();
      } else {
        // Notify background to update badge
        chrome.runtime.sendMessage({ type: "DEACTIVATE" });
        deactivate();
      }
    }
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
      el.closest("#ccp-toast")
    ) {
      return keep;
    }
    return el;
  }

  function deselectElement() {
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

    // Actions read selectedElement at click time so they follow "Select Parent" hops
    const buttons = [
      { label: "Copy Code", icon: ICONS.code, action: (btnEl) => copyElement(selectedElement, btnEl) },
      { label: "Screenshot", icon: ICONS.camera, action: (btnEl) => copyScreenshot(selectedElement, btnEl) },
    ];

    for (const btn of buttons) {
      const button = document.createElement("button");
      button.dataset.origHtml = btn.icon + `<span>${btn.label}</span>`;
      button.innerHTML = button.dataset.origHtml;
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
