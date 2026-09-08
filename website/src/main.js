import { animate } from "motion";
import { measureGap } from "./geometry.js";
import "./style.css";
const $ = (s) => document.querySelector(s);
let active = true,
  selected = null,
  hovered = null,
  editing = false,
  measuring = false,
  measureTarget = null,
  noticeTimer,
  frame;
let records = new Map();
const scale = {
  fontSize: [16, 20, 24, 28, 32, 40, 48],
  padding: [8, 12, 16, 24, 32],
  borderRadius: [0, 4, 8, 12, 16, 24],
};
const names = {
  fontSize: "--title",
  padding: "--space",
  borderRadius: "--radius",
};
function initScene() {
  $("#demo-page")
    .querySelectorAll("[data-node]")
    .forEach((el) => {
      const style = getComputedStyle(el);
      records.set(el, {
        fontSize: parseFloat(style.fontSize),
        padding: parseFloat(style.paddingTop),
        borderRadius: parseFloat(style.borderRadius),
        backgroundColor: style.backgroundColor,
        original: el.getAttribute("style") || "",
        changes: {},
      });
      el.addEventListener("focus", () => {
        if (active && !editing) {
          if (measuring && selected) measureTarget = el;
          else hovered = el;
          render();
        }
      });
    });
  render();
}
function record() {
  return records.get(selected);
}
function state() {
  return !active
    ? "off"
    : editing
      ? "editing"
      : selected
        ? "selected"
        : hovered
          ? "hovering"
          : "pointing";
}
function render() {
  document.body.dataset.state = state();
  $("#toolbar").hidden = !selected || !active;
  $("#inspector").hidden = !editing;
  $("#point-toggle").setAttribute("aria-pressed", String(active));
  $("#point-toggle").setAttribute(
    "aria-label",
    active ? "Turn Point Mode off" : "Turn Point Mode on",
  );
  $("#point-toggle span").textContent = active ? "Pointing on" : "Pointing off";
  $("#measure-toggle").hidden = !selected || editing;
  $("#measure-toggle").setAttribute("aria-pressed", String(measuring));
  $("#guidance").textContent = {
    off: "Point Mode is off. Switch it on in the browser bar.",
    pointing: "Move over an element. Click to select it.",
    hovering: "This is a hover. Click to reveal the actions.",
    selected: measuring
      ? "Point at another element to measure. Click it to re-anchor."
      : "Selected. Copy its context, open Edit, or hold Option / Alt to measure.",
    editing: "Adjust the selected element. Esc returns to selection.",
  }[state()];
  $("#demo-page")
    .querySelectorAll("[data-node]")
    .forEach((el) => {
      if (el.getAttribute("role") === "button")
        el.setAttribute("aria-pressed", String(el === selected));
      el.dataset.selected = String(el === selected);
      el.tabIndex = editing || !active ? -1 : 0;
    });
  place();
}
function relative(el) {
  const r = el.getBoundingClientRect(),
    s = $("#scene").getBoundingClientRect();
  return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height };
}
function place() {
  const el = selected || hovered,
    ring = $("#selection-ring"),
    info = $("#info-label");
  ring.hidden = info.hidden = !el || !active;
  if (!el || !active) {
    $("#redlines").replaceChildren();
    return;
  }
  const r = relative(el);
  Object.assign(ring.style, {
    left: r.x + "px",
    top: r.y + "px",
    width: r.w + "px",
    height: r.h + "px",
    borderRadius: getComputedStyle(el).borderRadius,
  });
  ring.classList.toggle("locked", !!selected);
  info.textContent = `${el.dataset.tag}.${el.dataset.node}  ${Math.round(el.getBoundingClientRect().width)} × ${Math.round(el.getBoundingClientRect().height)}`;
  info.style.left =
    Math.max(0, Math.min(r.x, $("#scene").clientWidth - info.offsetWidth)) +
    "px";
  info.style.top = Math.max(0, r.y - 25) + "px";
  if (selected) {
    const bar = $("#toolbar");
    bar.style.left =
      Math.max(
        0,
        Math.min(
          r.x + r.w / 2 - bar.offsetWidth / 2,
          $("#scene").clientWidth - bar.offsetWidth,
        ),
      ) + "px";
    bar.style.top = r.y + r.h + 10 + "px";
    bar.style.bottom = "auto";
    bar.style.transform = "none";
    if (editing) {
      const panel = $("#inspector"),
        stage = $("#stage").getBoundingClientRect(),
        scene = $("#scene").getBoundingClientRect();
      const available = stage.right - scene.left;
      let x = r.x + r.w + 14,
        y = r.y;
      if (x + panel.offsetWidth > available) {
        x = r.x - panel.offsetWidth - 14;
        if (x < 0) {
          x = Math.max(
            0,
            Math.min(r.x, $("#scene").clientWidth - panel.offsetWidth),
          );
          y = r.y + r.h + 54;
        }
      }
      panel.style.left = x + "px";
      panel.style.right = "auto";
      panel.style.top = y + "px";
      const needed = scene.top - stage.top + y + panel.offsetHeight + 62;
      $("#stage").style.minHeight = Math.max(450, needed) + "px";
    } else $("#stage").style.minHeight = "";
  }
  if (measuring && selected && measureTarget && measureTarget !== selected)
    drawMeasure();
  else $("#redlines").replaceChildren();
}
function notify(text) {
  $("#status").textContent = text;
  $("#status").classList.add("visible");
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(
    () => $("#status").classList.remove("visible"),
    2500,
  );
}
function select(el) {
  if (!active || editing || !el) return;
  selected = el;
  hovered = el;
  $("#copy-preview").hidden = true;
  render();
}
function fields() {
  const r = record(),
    type = /^h[1-6]$|^p$/.test(selected.dataset.tag);
  $("#edit-identity").textContent =
    selected.dataset.tag + "." + selected.dataset.node;
  $("#edit-fields").innerHTML =
    (type ? ["fontSize", "padding"] : ["padding", "borderRadius"])
      .map(
        (prop) =>
          `<section class="edit-group"><h4>${{ fontSize: "Typography", padding: "Spacing", borderRadius: "Border" }[prop]}</h4><div class="field-name">${{ fontSize: "Size", padding: "Padding", borderRadius: "Radius" }[prop]}<span>px</span></div><div class="token-step"><button data-prop="${prop}" data-dir="-1" aria-label="Decrease ${prop}">‹</button><output id="value-${prop}">${parseFloat(getComputedStyle(selected)[prop])}</output><button data-prop="${prop}" data-dir="1" aria-label="Increase ${prop}">›</button></div><span class="token-name" id="token-${prop}">${names[prop]} scale</span></section>`,
      )
      .join("") +
    `<section class="edit-group"><h4>Surface</h4><div class="swatches">${["#292925", "#45443a", "#414d43"].map((c, i) => `<button class="swatch" style="--swatch:${c}" data-fill="${c}" aria-label="${["Graphite", "Warm gray", "Sage"][i]} fill"></button>`).join("")}</div></section>`;
  $("#edit-fields")
    .querySelectorAll("[data-prop]")
    .forEach(
      (b) =>
        (b.onclick = () => {
          const prop = b.dataset.prop,
            value = parseFloat(getComputedStyle(selected)[prop]),
            values = scale[prop],
            dir = Number(b.dataset.dir);
          const next =
            dir > 0
              ? values.find((v) => v > value)
              : [...values].reverse().find((v) => v < value);
          if (next === undefined) return;
          selected.style[prop] = "var(" + names[prop] + "-" + next + ")";
          if (next === r[prop]) delete r.changes[prop];
          else r.changes[prop] = names[prop] + "-" + next + " (" + next + "px)";
          $("#value-" + prop).value = next;
          $("#token-" + prop).textContent = names[prop] + "-" + next;
          place();
        }),
    );
  $("#edit-fields")
    .querySelectorAll("[data-fill]")
    .forEach(
      (b) =>
        (b.onclick = () => {
          selected.style.backgroundColor = b.dataset.fill;
          if (getComputedStyle(selected).backgroundColor === r.backgroundColor)
            delete r.changes.backgroundColor;
          else r.changes.backgroundColor = b.dataset.fill;
          syncFills();
          place();
        }),
    );
  function syncFills() {
    const fill = getComputedStyle(selected).backgroundColor;
    $("#edit-fields")
      .querySelectorAll("[data-fill]")
      .forEach((button) => {
        button.setAttribute(
          "aria-pressed",
          String(getComputedStyle(button).backgroundColor === fill),
        );
      });
  }
  syncFills();
}
function openEdit() {
  if (!selected) return;
  editing = true;
  measuring = false;
  $("#copy-preview").hidden = true;
  fields();
  render();
}
function closeEdit() {
  editing = false;
  $("#stage").style.minHeight = "";
  render();
}
function context(el = selected) {
  const id = el.dataset.node,
    r = records.get(el);
  let text = `# source: src/components/ProjectCard.tsx\n# selector: [data-node="${id}"]\n# text: ${(el.innerText.trim() || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").slice(0, 100)}`;
  const edits = Object.entries(r.changes);
  if (edits.length)
    text +=
      "\n# edits: apply in the source\n" +
      edits
        .map(
          ([p, v]) =>
            `#   ${p.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())}: ${r[p]}${p === "backgroundColor" ? "" : "px"} → ${v}`,
        )
        .join("\n");
  return text;
}
async function copy(all = false) {
  if (!selected) return;
  const edited =
    all === true
      ? [...records]
          .filter(([, r]) => Object.keys(r.changes).length)
          .map(([el]) => el)
      : [];
  const text = (edited.length ? edited : [selected])
    .map((el) => context(el))
    .join("\n\n");
  $("#payload").textContent = text;
  $("#copy-preview").hidden = false;
  $("#payload").focus({ preventScroll: true });
  try {
    await navigator.clipboard.writeText(text);
    notify("Element context copied");
  } catch {
    notify("Select and copy the context from the preview.");
  }
}
function resetEdits() {
  for (const [el, r] of records) {
    el.setAttribute("style", r.original);
    r.changes = {};
  }
  if (editing) fields();
  render();
  notify("Every demo edit reset");
}
let captureLibrary;
function loadCapture() {
  if (!captureLibrary)
    captureLibrary = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/assets/html2canvas-pro.min.js";
      script.onload = () => resolve(window.html2canvas);
      script.onerror = () => {
        script.remove();
        captureLibrary = null;
        reject(new Error("Screenshot library unavailable"));
      };
      document.head.append(script);
    });
  return captureLibrary;
}
async function screenshot() {
  if (!selected) return;
  try {
    const target = selected;
    const capture = await loadCapture();
    const canvas = await capture(target, {
      backgroundColor: null,
      scale: 2,
      logging: false,
    });
    canvas.toBlob((blob) => {
      if (!blob) {
        notify("Could not create a screenshot.");
        return;
      }
      const url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = "pointee-" + target.dataset.node + ".png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify("Element screenshot downloaded");
    });
  } catch {
    notify("Screenshot unavailable in this browser.");
  }
}
function parent() {
  if (!selected) return;
  const p = selected.parentElement.closest("[data-node]");
  if (!p) {
    notify("This is the outermost demo component.");
    return;
  }
  editing = false;
  selected = p;
  $("#copy-preview").hidden = true;
  $("#stage").style.minHeight = "";
  render();
}
function drawMeasure() {
  const gapLine = measureGap(relative(selected), relative(measureTarget));
  if (!gapLine) {
    $("#redlines").replaceChildren();
    return;
  }
  const { x1, x2, y1, y2, gap } = gapLine;
  $("#redlines").innerHTML =
    `<path d="M ${x1} ${y1} L ${x2} ${y2}"/><circle cx="${x1}" cy="${y1}" r="2"/><circle cx="${x2}" cy="${y2}" r="2"/><rect x="${(x1 + x2) / 2 - 24}" y="${(y1 + y2) / 2 - 23}" width="48" height="18" rx="4"/><text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 10}" text-anchor="middle">${Math.round(gap)} px</text>`;
}
$("#demo-page").addEventListener("pointermove", (e) => {
  const el = e.target.closest("[data-node]");
  if (!active || editing) return;
  if (measuring && selected) {
    measureTarget = el;
    place();
    return;
  }
  if (!selected && hovered !== el) {
    hovered = el;
    render();
  }
});
$("#demo-page").addEventListener("pointerleave", () => {
  measureTarget = null;
  if (!selected) hovered = null;
  render();
});
$("#demo-page").addEventListener("click", (e) => {
  const el = e.target.closest("[data-node]");
  if (measuring && e.pointerType === "touch" && el !== selected) {
    measureTarget = el;
    render();
    return;
  }
  select(el);
});
$("#demo-page").addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    select(e.target.closest("[data-node]"));
  }
});
$("#toolbar").addEventListener("click", (e) => {
  const action = e.target.closest("button")?.dataset.action;
  ({ copy, screenshot, edit: openEdit, parent })[action]?.();
});
$("#back-selection").onclick = closeEdit;
$("#copy-edits").onclick = () => copy(true);
$("#reset-edits").onclick = resetEdits;
$("#close-copy").onclick = () => {
  $("#copy-preview").hidden = true;
  $("#toolbar [data-action=copy]").focus({ preventScroll: true });
};
$("#point-toggle").onclick = () => {
  active = !active;
  selected = null;
  hovered = null;
  editing = false;
  measuring = false;
  $("#stage").style.minHeight = "";
  $("#copy-preview").hidden = true;
  if (!active) resetEdits();
  render();
};
$("#measure-toggle").onclick = () => {
  measuring = !measuring;
  render();
};
document.addEventListener("keydown", (e) => {
  if (e.key === "Alt" && selected && !editing) {
    e.preventDefault();
    measuring = true;
    render();
  }
  if (e.key === "Escape") {
    if (!$("#copy-preview").hidden) {
      $("#copy-preview").hidden = true;
      return;
    }
    if (editing) closeEdit();
    else if (selected) {
      selected = null;
      measuring = false;
      render();
    } else if (active) {
      active = false;
      hovered = null;
      resetEdits();
      render();
    }
  }
});
document.addEventListener("keyup", (e) => {
  if (e.key === "Alt") {
    measuring = false;
    render();
  }
});
window.addEventListener("blur", () => {
  measuring = false;
  render();
});
// The hit region remains the stage after entry, so moving the window cannot
// manufacture a pointerleave/pointerenter loop at the original window edge.
const motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
const hand = $("#pointee-cursor"),
  titleHand = $(".wordmark img");
let pointerOwned = false,
  handAnimation = null,
  geometryFrame = 0,
  handPose = null,
  flight = null;
let pointer = { x: 0, y: 0 };
function titlePose() {
  const r = titleHand.getBoundingClientRect();
  return { x: r.left, y: r.top, size: r.width, flip: 0 };
}
function pointerPose() {
  return { x: pointer.x - 7, y: pointer.y - 5, size: 38, flip: 180 };
}
function paintHand(p) {
  handPose = p;
  hand.style.transform = `translate3d(${p.x}px,${p.y}px,0)`;
  hand.style.width = p.size + "px";
  hand.style.height = p.size + "px";
  hand.firstElementChild.style.transform = `rotateY(${p.flip}deg)`;
}
function animateHand(toTitle = false) {
  handAnimation?.stop();
  const from = handPose || titlePose();
  const currentFlight = { toTitle };
  flight = currentFlight;
  hand.classList.add("visible");
  const update = (progress) => {
    const to = toTitle ? titlePose() : pointerPose();
    paintHand({
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
      size: from.size + (to.size - from.size) * progress,
      flip: from.flip + (to.flip - from.flip) * progress,
    });
  };
  const complete = () => {
    if (flight !== currentFlight) return;
    flight = null;
    if (toTitle) {
      hand.classList.remove("visible");
      document.body.classList.remove("hand-away");
      handPose = null;
    } else if (pointerOwned) paintHand(pointerPose());
  };
  if (motionPreference.matches) {
    update(1);
    complete();
    return;
  }
  handAnimation = animate(0, 1, {
    duration: 0.28,
    ease: [0.23, 1, 0.32, 1],
    onUpdate: update,
    onComplete: complete,
  });
}
function followGeometry() {
  cancelAnimationFrame(geometryFrame);
  const until = performance.now() + 650;
  const tick = () => {
    place();
    if (performance.now() < until) geometryFrame = requestAnimationFrame(tick);
  };
  geometryFrame = requestAnimationFrame(tick);
}
function beginExploration(e) {
  const isMouse = e?.pointerType === "mouse";
  if (isMouse) {
    pointer = { x: e.clientX, y: e.clientY };
    if (!pointerOwned) {
      handPose = handPose || titlePose();
      pointerOwned = true;
      document.body.classList.add("hand-away", "custom-pointer");
      animateHand();
    }
  }
  if (!document.body.classList.contains("exploring")) {
    document.body.classList.add("exploring");
    followGeometry();
  }
}
function finishExploration(immediate = false) {
  pointerOwned = false;
  document.body.classList.remove("custom-pointer", "exploring");
  selected = null;
  hovered = null;
  editing = false;
  measuring = false;
  measureTarget = null;
  $("#copy-preview").hidden = true;
  $("#stage").style.minHeight = "";
  if (immediate) {
    handAnimation?.stop();
    flight = null;
    handPose = null;
    hand.classList.remove("visible");
    document.body.classList.remove("hand-away");
  } else if (document.body.classList.contains("hand-away")) animateHand(true);
  render();
  followGeometry();
}
$("#scene").addEventListener("pointerenter", (e) => {
  if (e.pointerType === "mouse") beginExploration(e);
});
$("#scene").addEventListener("pointerdown", (e) => {
  if (e.pointerType !== "mouse") beginExploration(e);
});
$("#stage").addEventListener("pointermove", (e) => {
  if (e.pointerType !== "mouse") return;
  pointer = { x: e.clientX, y: e.clientY };
  if (pointerOwned && !flight) paintHand(pointerPose());
});
$("#stage").addEventListener("pointerleave", (e) => {
  if (e.pointerType === "mouse") finishExploration();
});
$("#scene").addEventListener("focusin", () => {
  if (!document.body.classList.contains("exploring")) beginExploration();
});
$("#stage").addEventListener("focusout", () =>
  queueMicrotask(() => {
    if (!pointerOwned && !$("#stage").contains(document.activeElement))
      finishExploration();
  }),
);
document.addEventListener("pointerdown", (e) => {
  if (
    !$("#stage").contains(e.target) &&
    document.body.classList.contains("exploring")
  )
    finishExploration();
});
window.addEventListener("blur", () => finishExploration(true));
document.addEventListener("visibilitychange", () => {
  if (document.hidden) finishExploration(true);
});
window.addEventListener(
  "scroll",
  () => {
    if (!pointerOwned) return;
    const r = $("#stage").getBoundingClientRect();
    if (
      pointer.x < r.left ||
      pointer.x > r.right ||
      pointer.y < r.top ||
      pointer.y > r.bottom
    )
      finishExploration(true);
    else place();
  },
  { passive: true },
);
window.addEventListener("resize", () => {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(place);
});
$("#point-toggle").disabled = false;
initScene();
document.fonts.ready.then(place);
