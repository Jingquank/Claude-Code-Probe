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

    // Line 2: key computed properties
    const props = [];
    const display = style.display;
    const position = style.position;
    if (display && display !== "block") props.push(display);
    if (position && position !== "static") props.push(`pos:${position}`);
    const fontSize = style.fontSize;
    if (fontSize) props.push(fontSize);
    const fontWeight = style.fontWeight;
    if (fontWeight && fontWeight !== "400" && fontWeight !== "normal") props.push(`w:${fontWeight}`);
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
      line2 = `<div class="ccp-label-line"><span class="ccp-label-prop">${props.join('<span class="ccp-label-sep"> · </span>')}</span></div>`;
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
      const path = crumbs.join('<span class="ccp-label-sep"> › </span>') +
        '<span class="ccp-label-sep"> › </span>' +
        `<span class="ccp-label-tag">${tag}${id || classes}</span>`;
      line3 = `<div class="ccp-label-line ccp-label-marquee"><span class="ccp-label-breadcrumb ccp-marquee-inner">${path}<span class="ccp-label-sep">&nbsp;&nbsp;&nbsp;·&nbsp;&nbsp;&nbsp;</span>${path}</span></div>`;
    }

    // Preserve Clawd mascot, update only the content wrapper
    let contentWrap = labelEl.querySelector(".ccp-label-content");
    if (!contentWrap) {
      contentWrap = document.createElement("div");
      contentWrap.className = "ccp-label-content";
      labelEl.appendChild(contentWrap);
    }
    contentWrap.innerHTML =
      `<div class="ccp-label-line">${line1}</div>` + line2 + line3;

    labelEl.style.display = "block";

    // Position: above element by default, below if near top
    const lineCount = 1 + (line2 ? 1 : 0) + (line3 ? 1 : 0);
    const labelHeight = 14 + lineCount * 16;
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
      { label: "Copy Element", icon: ICONS.code, action: () => copyElement(el) },
      { label: "Copy Screenshot", icon: ICONS.camera, action: () => copyScreenshot(el) },
      { label: "Copy Both", icon: ICONS.copy, action: () => copyBoth(el) },
    ];

    for (const btn of buttons) {
      const button = document.createElement("button");
      button.innerHTML = btn.icon + `<span>${btn.label}</span>`;
      button.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.action();
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
  function buildSkeletonHTML(el, depth = 0, maxDepth = 3) {
    const tag = el.tagName.toLowerCase();
    const attrs = Array.from(el.attributes)
      .filter((a) => !a.name.startsWith("ccp-"))
      .map((a) => ` ${a.name}="${a.value}"`)
      .join("");

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
          parts.push(`<${childTag}${Array.from(child.attributes).map((a) => ` ${a.name}="${a.value}"`).join("")}>${n > 0 ? `<!-- ${n} children -->` : "\u2026"}</${childTag}>`);
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

  // ===== Build Structured Element Info =====
  function buildElementInfo(el) {
    const url = window.location.href;
    const selector = buildSelectorPath(el);
    const skeleton = buildSkeletonHTML(el);

    return [
      `/* URL */`,
      url,
      ``,
      `/* Selector */`,
      selector,
      ``,
      `/* HTML */`,
      skeleton,
    ].join("\n");
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

  // ===== Clipboard Actions =====
  async function copyElement(el) {
    try {
      const info = buildElementInfo(el);
      await navigator.clipboard.writeText(info);
      showToast("Element info copied");
    } catch (err) {
      showToast("Failed to copy: " + err.message, true);
    }
  }

  async function copyScreenshot(el) {
    try {
      showToast("Copying...", false, true);
      const blob = await captureElementScreenshot(el);
      const ok = await writeImageToClipboard(blob);
      showToast(ok ? "Screenshot copied" : "Screenshot downloaded");
    } catch (err) {
      showToast("Failed to capture: " + err.message, true);
    }
  }

  async function copyBoth(el) {
    try {
      showToast("Copying...", false, true);
      const info = buildElementInfo(el);
      const blob = await captureElementScreenshot(el);

      try {
        const item = new ClipboardItem({
          "text/plain": new Blob([info], { type: "text/plain" }),
          "image/png": Promise.resolve(blob),
        });
        await navigator.clipboard.write([item]);
        showToast("Element + Screenshot copied");
      } catch {
        // Fallback: copy text, download image
        await navigator.clipboard.writeText(info);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "element-screenshot.png";
        a.click();
        URL.revokeObjectURL(url);
        showToast("Text copied, screenshot downloaded");
      }
    } catch (err) {
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
