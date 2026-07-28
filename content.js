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

  // ===== Clawd Mini (for toast loading state) =====
  const CLAWD_MINI = `<svg viewBox="-4 -4 120 80" width="28" height="20" fill="none" style="flex-shrink:0;overflow:visible"><rect x="8" y="0" width="96" height="56" rx="4" fill="#C27C5C"/><rect x="-4" y="25.6" width="12" height="14.4" rx="3" fill="#C27C5C"/><rect x="104" y="25.6" width="12" height="14.4" rx="3" fill="#C27C5C"/><rect x="28" y="14" width="8" height="16" rx="2" fill="#141413"/><rect x="76" y="14" width="8" height="16" rx="2" fill="#141413"/><rect x="16" y="56" width="9.6" height="20" rx="2" fill="#8B5A42"><animate attributeName="height" values="20;16;20" dur="0.4s" begin="0s" repeatCount="indefinite"/></rect><rect x="30.4" y="56" width="9.6" height="20" rx="2" fill="#8B5A42"><animate attributeName="height" values="20;16;20" dur="0.4s" begin="0.1s" repeatCount="indefinite"/></rect><rect x="72" y="56" width="9.6" height="20" rx="2" fill="#8B5A42"><animate attributeName="height" values="20;16;20" dur="0.4s" begin="0.2s" repeatCount="indefinite"/></rect><rect x="86.4" y="56" width="9.6" height="20" rx="2" fill="#8B5A42"><animate attributeName="height" values="20;16;20" dur="0.4s" begin="0.3s" repeatCount="indefinite"/></rect></svg>`;

  // ===== SVG Icons =====
  const ICONS = {
    code: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
    camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
    parent: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3"/><path d="M12 20v-8"/><polyline points="9 15 12 12 15 15"/></svg>',
  };

  // ===== Clawd Mascot SVG (mood="happy", from clawd-react) =====
  const CLAWD_SVG = `<svg viewBox="-16 -4 144 104" fill="none" xmlns="http://www.w3.org/2000/svg">
    <!-- Shadow -->
    <ellipse cx="56" cy="91.5" rx="32" ry="4" fill="rgba(0,0,0,0.15)"/>
    <!-- Body -->
    <rect x="8" y="0" width="96" height="56" rx="4" fill="#C27C5C"/>
    <!-- Arm nubs -->
    <rect x="-4" y="25.6" width="12" height="14.4" rx="3" fill="#C27C5C"/>
    <rect x="104" y="25.6" width="12" height="14.4" rx="3" fill="#C27C5C"/>
    <!-- Eyes -->
    <rect x="28" y="14" width="8" height="16" rx="2" fill="#141413"/>
    <rect x="76" y="14" width="8" height="16" rx="2" fill="#141413"/>
    <!-- Legs -->
    <rect x="16" y="56" width="9.6" height="20" rx="2" fill="#8B5A42">
      <animate attributeName="height" values="20;16;20" dur="0.4s" begin="0s" repeatCount="indefinite"/>
    </rect>
    <rect x="30.4" y="56" width="9.6" height="20" rx="2" fill="#8B5A42">
      <animate attributeName="height" values="20;16;20" dur="0.4s" begin="0.1s" repeatCount="indefinite"/>
    </rect>
    <rect x="72" y="56" width="9.6" height="20" rx="2" fill="#8B5A42">
      <animate attributeName="height" values="20;16;20" dur="0.4s" begin="0.2s" repeatCount="indefinite"/>
    </rect>
    <rect x="86.4" y="56" width="9.6" height="20" rx="2" fill="#8B5A42">
      <animate attributeName="height" values="20;16;20" dur="0.4s" begin="0.3s" repeatCount="indefinite"/>
    </rect>
    <!-- Sparkles -->
    <circle cx="108" cy="8" r="3.5" fill="#d97757" opacity="0">
      <animate attributeName="opacity" values="0;1;0" dur="1.5s" repeatCount="indefinite"/>
      <animate attributeName="r" values="1;3.5;1" dur="1.5s" repeatCount="indefinite"/>
    </circle>
    <circle cx="116" cy="-2" r="2.5" fill="#d97757" opacity="0">
      <animate attributeName="opacity" values="0;1;0" dur="1.5s" begin="0.4s" repeatCount="indefinite"/>
      <animate attributeName="r" values="0.5;2.5;0.5" dur="1.5s" begin="0.4s" repeatCount="indefinite"/>
    </circle>
    <circle cx="120" cy="18" r="2" fill="#d97757" opacity="0">
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

  // Read cursor without the probe-mode crosshair override.
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
    document.documentElement.classList.add("ccp-probe-active");
    createOverlay();
    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);
    // Capture, so scrolling any nested container counts too
    document.addEventListener("scroll", onViewportChange, { capture: true, passive: true });
    window.addEventListener("resize", onViewportChange);
  }

  function deactivate() {
    probeActive = false;
    hoveredElement = null;
    selectedElement = null;
    document.documentElement.classList.remove("ccp-probe-active");
    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
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
  }

  // ===== Corner radius =====
  const CORNERS = [
    "borderTopLeftRadius",
    "borderTopRightRadius",
    "borderBottomRightRadius",
    "borderBottomLeftRadius",
  ];
  const RADIUS_FALLBACK = 4;
  const MAX_SWEEP_DIAGONAL = 2600;

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
        ? `${Math.max(0, RADIUS_FALLBACK + offset)}px`
        : radii.values[i]
            .split(" ")
            .map((p) => `max(0px, calc(${p} + ${offset}px))`)
            .join(" ");
    });
  }

  // Corner radii in px for the SVG path. Only the horizontal component is used,
  // so a percentage resolves against the width.
  function radiiInPixels(radii, width) {
    if (radii.square) return [RADIUS_FALLBACK, RADIUS_FALLBACK, RADIUS_FALLBACK, RADIUS_FALLBACK];
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
    const oversized = diagonal > MAX_SWEEP_DIAGONAL;
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

  const CHROME = { margin: 4, gap: 6, pair: 6, minLabelHeight: 24 };
  const NARROW_TOOLBAR = 470;

  function overlapArea(a, b) {
    const x = Math.max(0, Math.min(a.left + a.w, b.left + b.w) - Math.max(a.left, b.left));
    const y = Math.max(0, Math.min(a.top + a.h, b.top + b.h) - Math.max(a.top, b.top));
    return x * y;
  }

  // `toolbar` is null while merely hovering — then the label is placed alone.
  function computeChromeLayout(rect, label, toolbar, vw, vh) {
    const M = CHROME.margin, GAP = CHROME.gap, PAIR = CHROME.pair;

    const T = toolbar
      ? { w: toolbar.w, h: toolbar.h, hidden: false }
      : { w: 0, h: 0, hidden: true };

    // The toolbar is interactive — clipping it breaks the tool — so it is the
    // hard constraint and the label yields: first by shrinking, then by
    // disappearing once not even one line will fit.
    const room = vh - 2 * M - (T.hidden ? 0 : T.h + PAIR);
    const labelH = Math.min(label.h, Math.max(0, room));
    const labelHidden = labelH < CHROME.minLabelHeight;
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
    const narrow = vw < NARROW_TOOLBAR;
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

  // ===== Event Handlers =====
  function onMouseMove(e) {
    if (selectedElement) return; // Don't update hover while selected

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
    });
  }

  function onClick(e) {
    if (!probeActive) return;

    // Ignore clicks on our own toolbar
    if (toolbarEl && toolbarEl.contains(e.target)) return;

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
  }

  function onKeyDown(e) {
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

  function getTargetElement(e) {
    // Use elementFromPoint to ignore our overlay
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el) return null;
    // Skip our own elements
    if (
      el.id?.startsWith("ccp-") ||
      el.closest("#ccp-overlay-container") ||
      el.closest("#ccp-toolbar") ||
      el.closest("#ccp-label")
    ) {
      return hoveredElement; // Keep current
    }
    return el;
  }

  function deselectElement() {
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

  // ===== Firefox detection =====
  const isFirefox = typeof browser !== "undefined";

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

  const OUR_CHROME = "#ccp-toolbar,#ccp-label,#ccp-overlay-container";

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
  // A fenced comment header: no per-field tags, and the fence both delimits the block
  // from the surrounding prompt and stops "#" from rendering as a markdown heading.
  function buildElementInfo(el) {
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

    // With a file or component to open, the agent reads the real source and a rendered
    // subtree is a lossy copy of it. With neither, the subtree is all the payload has.
    const html = source || component ? buildRootTag(el) : buildSkeletonHTML(el);

    return "```\n" + header + "\n" + html + "\n```";
  }

  // ===== Screenshot Capture =====
  async function captureElementScreenshot(el) {
    if (isFirefox) {
      // Firefox: use background script to capture visible tab, then crop
      const rect = el.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "CAPTURE_TAB" }, resolve);
      });

      if (response.error) throw new Error(response.error);

      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error("Failed to load screenshot"));
        i.src = response.dataUrl;
      });

      const canvas = document.createElement("canvas");
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(
        img,
        Math.round(rect.left * dpr),
        Math.round(rect.top * dpr),
        Math.round(rect.width * dpr),
        Math.round(rect.height * dpr),
        0,
        0,
        canvas.width,
        canvas.height
      );

      return new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
      });
    } else {
      // Chrome: use html2canvas
      const bgColor = resolveBackgroundColor(el);
      const canvas = await html2canvas(el, {
        backgroundColor: bgColor,
        logging: false,
        useCORS: true,
        scale: window.devicePixelRatio || 1,
      });

      return new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
      });
    }
  }

  async function writeImageToClipboard(blob) {
    try {
      const item = new ClipboardItem({
        "image/png": Promise.resolve(blob),
      });
      await navigator.clipboard.write([item]);
      return true;
    } catch {
      // Firefox fallback: download the image if clipboard write fails
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
    btnEl.style.opacity = "0.7";
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
  function showToast(message, isError = false, isLoading = false) {
    if (toastTimer) clearTimeout(toastTimer);

    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.id = "ccp-toast";
    }

    if (isLoading) {
      toastEl.innerHTML = CLAWD_MINI + `<span>${message}</span>`;
    } else {
      toastEl.textContent = message;
    }
    toastEl.className = isError ? "ccp-toast-error" : "";

    // Position next to toolbar if visible, otherwise fixed bottom-right
    if (toolbarEl && toolbarEl.parentElement) {
      document.documentElement.appendChild(toastEl);
      const toolbarRect = toolbarEl.getBoundingClientRect();
      toastEl.style.position = "fixed";
      toastEl.style.top = toolbarRect.top + "px";
      toastEl.style.left = (toolbarRect.right + 8) + "px";
      toastEl.style.height = toolbarRect.height + "px";
      toastEl.style.zIndex = "2147483647";
    } else {
      document.documentElement.appendChild(toastEl);
      toastEl.style.position = "fixed";
      toastEl.style.bottom = "24px";
      toastEl.style.right = "24px";
      toastEl.style.top = "";
      toastEl.style.left = "";
      toastEl.style.zIndex = "2147483647";
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
