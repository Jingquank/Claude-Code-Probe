(() => {
  "use strict";

  // ===== State =====
  let probeActive = false;
  let hoveredElement = null;
  let selectedElement = null;
  let overlayContainer = null;
  let labelEl = null;
  let toolbarEl = null;
  let toastEl = null;
  let toastTimer = null;
  let rafId = null;

  // ===== Clawd Mini (for toast loading state) =====
  const CLAWD_MINI = `<svg viewBox="-4 -4 120 80" width="28" height="20" fill="none" style="flex-shrink:0;overflow:visible"><rect x="8" y="0" width="96" height="56" rx="4" fill="#C27C5C"/><rect x="-4" y="25.6" width="12" height="14.4" rx="3" fill="#C27C5C"/><rect x="104" y="25.6" width="12" height="14.4" rx="3" fill="#C27C5C"/><rect x="28" y="14" width="8" height="16" rx="2" fill="#141413"/><rect x="76" y="14" width="8" height="16" rx="2" fill="#141413"/><rect x="16" y="56" width="9.6" height="20" rx="2" fill="#8B5A42"><animate attributeName="height" values="20;16;20" dur="0.4s" begin="0s" repeatCount="indefinite"/></rect><rect x="30.4" y="56" width="9.6" height="20" rx="2" fill="#8B5A42"><animate attributeName="height" values="20;16;20" dur="0.4s" begin="0.1s" repeatCount="indefinite"/></rect><rect x="72" y="56" width="9.6" height="20" rx="2" fill="#8B5A42"><animate attributeName="height" values="20;16;20" dur="0.4s" begin="0.2s" repeatCount="indefinite"/></rect><rect x="86.4" y="56" width="9.6" height="20" rx="2" fill="#8B5A42"><animate attributeName="height" values="20;16;20" dur="0.4s" begin="0.3s" repeatCount="indefinite"/></rect></svg>`;

  // ===== SVG Icons =====
  const ICONS = {
    code: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
    camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
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
  }

  function deactivate() {
    probeActive = false;
    hoveredElement = null;
    selectedElement = null;
    document.documentElement.classList.remove("ccp-probe-active");
    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    removeOverlay();
    removeToolbar();
  }

  // ===== Overlay DOM =====
  function createOverlay() {
    if (overlayContainer) return;

    overlayContainer = document.createElement("div");
    overlayContainer.id = "ccp-overlay-container";

    const ids = ["ccp-margin-box", "ccp-border-box", "ccp-padding-box", "ccp-content-box"];
    for (const id of ids) {
      const div = document.createElement("div");
      div.id = id;
      overlayContainer.appendChild(div);
    }

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

  function updateOverlay(el) {
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

    // Border box (= bounding rect)
    positionBox("ccp-border-box", rect.top, rect.left, rect.width, rect.height);

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

    // Label
    updateLabel(el, rect);
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

    labelEl.style.display = "block";

    // Position: above element by default, below if near top
    const labelHeight = labelEl.offsetHeight || 40;
    const gap = 6;
    let top = rect.top - labelHeight - gap;
    if (top < 4) {
      top = rect.bottom + gap;
    }
    let left = rect.left;
    // Clamp to viewport
    const labelWidth = labelEl.offsetWidth || 150;
    if (left + labelWidth > window.innerWidth - 4) {
      left = window.innerWidth - labelWidth - 4;
    }
    if (left < 4) left = 4;

    labelEl.style.top = top + "px";
    labelEl.style.left = left + "px";
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

    const buttons = [
      { label: "Copy Element", icon: ICONS.code, action: (btnEl) => copyElement(el, btnEl) },
      { label: "Copy Screenshot", icon: ICONS.camera, action: (btnEl) => copyScreenshot(el, btnEl) },
      { label: "Copy Both", icon: ICONS.copy, action: (btnEl) => copyBoth(el, btnEl) },
    ];

    for (const btn of buttons) {
      const button = document.createElement("button");
      button.dataset.origHtml = btn.icon + `<span>${btn.label}</span>`;
      button.innerHTML = button.dataset.origHtml;
      // Lock width after first render so it doesn't shift during state changes
      requestAnimationFrame(() => {
        button.style.minWidth = button.offsetWidth + "px";
      });
      button.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.action(button);
      });
      toolbarEl.appendChild(button);
    }

    document.documentElement.appendChild(toolbarEl);
    positionToolbar(el);
  }

  function positionToolbar(el) {
    if (!toolbarEl) return;

    const rect = el.getBoundingClientRect();
    const toolbarRect = toolbarEl.getBoundingClientRect();
    const gap = 8;

    // Vertical: prefer below, then above
    let top;
    if (rect.bottom + gap + toolbarRect.height < window.innerHeight) {
      top = rect.bottom + gap;
    } else if (rect.top - gap - toolbarRect.height > 0) {
      top = rect.top - gap - toolbarRect.height;
    } else {
      top = Math.max(4, window.innerHeight - toolbarRect.height - 4);
    }

    // Horizontal: align left, clamp to viewport
    let left = rect.left;
    if (left + toolbarRect.width > window.innerWidth - 4) {
      left = window.innerWidth - toolbarRect.width - 4;
    }
    if (left < 4) left = 4;

    toolbarEl.style.top = top + "px";
    toolbarEl.style.left = left + "px";
  }

  function removeToolbar() {
    if (toolbarEl) {
      toolbarEl.remove();
      toolbarEl = null;
    }
  }

  // ===== Selector Builder =====
  function buildSelector(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === "html" || tag === "body") return tag;

    let selector = tag;
    if (el.id) {
      return `${tag}#${el.id}`;
    }

    const classes = Array.from(el.classList)
      .filter((c) => !c.startsWith("ccp-"))
      .slice(0, 3);
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
  function formatAttrs(el) {
    return Array.from(el.attributes)
      .filter((a) => !a.name.startsWith("ccp-") && a.name !== "style")
      .map((a) => {
        let val = a.value;
        if (a.name === "class" && val.length > 120) {
          const tokens = val.split(/\s+/).filter(Boolean);
          if (tokens.length > 6) {
            val = `${tokens.slice(0, 3).join(" ")} \u2026 ${tokens.slice(-3).join(" ")}`;
          }
        }
        return ` ${a.name}="${val}"`;
      })
      .join("");
  }

  function buildSkeletonHTML(el, depth = 0, maxDepth = 3) {
    const tag = el.tagName.toLowerCase();
    const attrs = formatAttrs(el);

    const selfClosing = ["img", "br", "hr", "input", "meta", "link", "area", "base", "col", "embed", "source", "track", "wbr"];
    if (selfClosing.includes(tag)) {
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
  function detectFramework() {
    const probeReact = (node) =>
      !!node && Object.keys(node).some((k) => k.startsWith("__reactFiber$"));
    const probeVue = (node) =>
      !!node && (node.__vue_app__ || node.__vue__ || node.__vueParentComponent);

    const body = document.body;
    if (probeReact(body)) return "react";
    if (probeVue(body)) return "vue";
    for (const child of body?.children || []) {
      if (probeReact(child)) return "react";
      if (probeVue(child)) return "vue";
    }
    return null;
  }

  function getReactComponentName(el) {
    const fiberKey = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
    if (!fiberKey) return null;
    let fiber = el[fiberKey];
    while (fiber) {
      const t = fiber.type;
      if (t && (typeof t === "function" || typeof t === "object")) {
        const name =
          t.displayName ||
          t.name ||
          (t.render && (t.render.displayName || t.render.name));
        if (name && /^[A-Z]/.test(name)) return name;
      }
      fiber = fiber.return;
    }
    return null;
  }

  function getIdentifiers(el) {
    const wanted = ["id", "data-testid", "data-cy", "data-component", "data-source-loc", "data-source-file"];
    const out = [];
    for (const attr of wanted) {
      const v = el.getAttribute(attr);
      if (v) out.push(`${attr}: ${v}`);
    }
    return out;
  }

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

  // ===== Build Structured Element Info =====
  function buildElementInfo(el) {
    const page = getPageString();
    const framework = detectFramework();
    const componentName = framework === "react" ? getReactComponentName(el) : null;
    const identifiers = getIdentifiers(el);
    const text = getVisibleText(el);
    const skeleton = buildSkeletonHTML(el);

    const lines = [
      `<picked-element>`,
      `<!-- Captured from the browser. Use to locate and edit the source. -->`,
      `<page>${page}</page>`,
    ];
    if (framework) lines.push(`<framework>${framework}</framework>`);
    if (componentName) lines.push(`<component>${componentName}</component>`);
    if (identifiers.length > 0) {
      lines.push(`<identifiers>`);
      lines.push(...identifiers);
      lines.push(`</identifiers>`);
    }
    if (text) lines.push(`<text>${text}</text>`);
    lines.push(`<html>`);
    lines.push("```html");
    lines.push(skeleton);
    lines.push("```");
    lines.push(`</html>`);
    lines.push(`</picked-element>`);
    return lines.join("\n");
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

  async function copyBoth(el, btnEl) {
    try {
      setButtonLoading(btnEl);
      const info = buildElementInfo(el);
      const blob = await captureElementScreenshot(el);

      try {
        const item = new ClipboardItem({
          "text/plain": new Blob([info], { type: "text/plain" }),
          "image/png": Promise.resolve(blob),
        });
        await navigator.clipboard.write([item]);
        setButtonSuccess(btnEl, "Copied!");
      } catch {
        await navigator.clipboard.writeText(info);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "element-screenshot.png";
        a.click();
        URL.revokeObjectURL(url);
        setButtonSuccess(btnEl, "Text copied, image downloaded!");
      }
    } catch (err) {
      resetButton(btnEl);
      showToast("Failed to copy: " + err.message, true);
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
