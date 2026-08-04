// Edit Mode delta block — spec for what the panel copies.
//
// formatEditSide / editPropRank / buildEditLines below are transcribed from
// the "Edit Deltas" section of content.js — content scripts are classic
// scripts, so nothing can be imported, only mirrored (same arrangement as
// placement.mjs / redline.mjs). Change them there and change them here.
//
// This block is the product. The panel is how you produce it, but what gets
// pasted into Claude Code is these lines, so their shape is worth pinning
// down: the token name leads because it is what the source contains, the
// before-value earns its place because it is how you find the declaration to
// change, and the order is fixed so the same set of edits always reads the
// same way regardless of what order they were made in.
//
// Run: node test/edit-deltas.mjs   (exit 1 on any failure)

// ===== Mirror of the Edit Deltas pure core (content.js) =====

const EDIT_PROP_ORDER = [
  "font-size", "font-weight", "line-height", "letter-spacing", "text-align", "color",
  "padding", "margin", "gap",
  "width", "height",
  "background-color", "opacity",
  "border-width", "border-color", "border-radius",
  "box-shadow",
];

// Mirrored from the Edit Tokens section of content.js — change both.
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

export function editPropRank(prop) {
  const i = EDIT_PROP_ORDER.indexOf(prop);
  if (i !== -1) return i;
  const shorthand = SHORTHAND_OF[prop];
  const j = shorthand ? EDIT_PROP_ORDER.indexOf(shorthand) : -1;
  return j === -1 ? EDIT_PROP_ORDER.length : j;
}

// Mirrored from the Edit Color section of content.js — change both. They are
// duplicated here as well as in edit-color.mjs because formatEditSide needs
// them, and a suite file cannot import a sibling that runs its own checks and
// calls process.exit on load. test/mirror-drift.mjs compares every copy.
export function parseCssColor(str) {
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

export function formatHex(c) {
  const h = (n) => Math.round(n).toString(16).padStart(2, "0");
  const base = "#" + h(c.r) + h(c.g) + h(c.b);
  return c.a === undefined || c.a >= 1 ? base : base + h(c.a * 255);
}

export function displayCss(css) {
  const colour = parseCssColor(css);
  return colour ? formatHex(colour) : css;
}

export function formatEditSide(value) {
  if (!value) return "";
  const shown = displayCss(value.css);
  if (value.token && value.token.name) return `${value.token.name} (${shown})`;
  return shown;
}

export function buildEditLines(entries) {
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

// ===== Harness =====

const rows = [];
let failures = 0;

function check(name, fn) {
  const errs = [];
  fn((msg) => errs.push(msg));
  failures += errs.length;
  rows.push({ case: name, result: errs.length ? "FAIL" : "ok", detail: errs.slice(0, 3).join("; ") });
}

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Shorthand for an EditValue as the panel builds them.
const raw = (css) => ({ css, inline: css, priority: "", cls: null, token: null });
const cls = (css, name) => ({ css, inline: null, priority: "", cls: name, token: { kind: "class", name } });
const cssVar = (css, name) => ({ css, inline: css, priority: "", cls: null, token: { kind: "var", name } });

// ===== 1. formatEditSide =====

check("side · a plain value reads as itself", (fail) => {
  const cases = [
    [raw("18px"), "18px"],
    [raw("#4a4a45"), "#4a4a45"],
    [raw("1.5"), "1.5"],
    [raw("center"), "center"],
    [raw("0 2px 8px rgb(0 0 0 / 0.08)"), "0 2px 8px rgb(0 0 0 / 0.08)"],
  ];
  for (const [value, want] of cases) {
    const got = formatEditSide(value);
    if (got !== want) fail(`${JSON.stringify(value.css)} → ${got}, want ${want}`);
  }
});

// The token leads and the pixel value follows, because the source contains the
// token but the eye was judging the pixels.
check("side · a token value names the token first", (fail) => {
  if (formatEditSide(cls("18px", "text-lg")) !== "text-lg (18px)") {
    fail(`class → ${formatEditSide(cls("18px", "text-lg"))}`);
  }
  if (formatEditSide(cssVar("28px", "--title-lg")) !== "--title-lg (28px)") {
    fail(`var → ${formatEditSide(cssVar("28px", "--title-lg"))}`);
  }
});

// getComputedStyle hands back rgb() and the picker hands back hex, so without
// normalising, a colour delta reads "rgb(255, 255, 255) → #a94f30" and the
// reader has to convert one side in their head to see how far it moved.
check("side · colours read as hex on both sides", (fail) => {
  const cases = [
    [raw("rgb(255, 255, 255)"), "#ffffff"],
    [raw("rgb(169 79 48)"), "#a94f30"],
    [raw("rgba(0, 0, 0, 0.5)"), "#00000080"],
    [raw("#A94F30"), "#a94f30"],
    [cssVar("rgb(169, 79, 48)", "--terra"), "--terra (#a94f30)"],
  ];
  for (const [value, want] of cases) {
    const got = formatEditSide(value);
    if (got !== want) fail(`${value.css} → ${got}, want ${want}`);
  }
});

// Only colours. A length that happens to look colour-ish must pass through,
// and so must a shadow, which contains a colour but is not one.
check("side · non-colours pass through untouched", (fail) => {
  const cases = ["18px", "1.5", "center", "0 2px 8px rgb(0 0 0 / 0.08)", "normal", "auto"];
  for (const css of cases) {
    const got = formatEditSide(raw(css));
    if (got !== css) fail(`${css} → ${got}`);
  }
});

check("side · degenerate values are empty, not 'undefined'", (fail) => {
  for (const v of [null, undefined]) {
    if (formatEditSide(v) !== "") fail(`${v} → ${JSON.stringify(formatEditSide(v))}`);
  }
  // A token object with no name must fall back to the raw value rather than
  // printing "undefined (18px)".
  const nameless = { css: "18px", token: { kind: "class" } };
  if (formatEditSide(nameless) !== "18px") fail(`nameless token → ${formatEditSide(nameless)}`);
});

// ===== 2. Ordering =====

check("order · properties read out in the panel's own order", (fail) => {
  // Deliberately built backwards: the output must not reflect this.
  const entries = [
    { prop: "box-shadow", before: raw("none"), after: raw("0 2px 8px") },
    { prop: "border-radius", before: raw("0px"), after: raw("12px") },
    { prop: "opacity", before: raw("1"), after: raw("0.9") },
    { prop: "padding", before: raw("8px"), after: raw("16px") },
    { prop: "font-size", before: raw("14px"), after: raw("18px") },
  ];
  const props = buildEditLines(entries).slice(1).map((l) => l.slice(4).split(":")[0]);
  const want = ["font-size", "padding", "opacity", "border-radius", "box-shadow"];
  if (!eq(props, want)) fail(`${JSON.stringify(props)}`);
});

// Same edits, any order made → the same block. Otherwise two people tuning the
// same element the same way would produce different-looking diffs.
check("order · the block is stable under permutation", (fail) => {
  const entries = [
    { prop: "font-size", before: raw("14px"), after: raw("18px") },
    { prop: "color", before: raw("#000"), after: raw("#333") },
    { prop: "padding", before: raw("8px"), after: raw("16px") },
    { prop: "gap", before: raw("4px"), after: raw("8px") },
  ];
  const reference = buildEditLines(entries).join("\n");
  // Every rotation, plus a reversal.
  for (let r = 1; r < entries.length; r++) {
    const rotated = entries.slice(r).concat(entries.slice(0, r));
    if (buildEditLines(rotated).join("\n") !== reference) fail(`rotation ${r} differs`);
  }
  if (buildEditLines(entries.slice().reverse()).join("\n") !== reference) fail("reversal differs");
});

// Opening a linked control into its four sides must not scatter them through
// the block: each side sorts where its shorthand does.
check("order · side longhands sort with their shorthand", (fail) => {
  const entries = [
    { prop: "box-shadow", before: raw("none"), after: raw("0 2px 8px") },
    { prop: "padding-top", before: raw("16px"), after: raw("40px") },
    { prop: "font-size", before: raw("14px"), after: raw("18px") },
    { prop: "border-top-left-radius", before: raw("0px"), after: raw("8px") },
    { prop: "margin-left", before: raw("0px"), after: raw("12px") },
  ];
  const props = buildEditLines(entries).slice(1).map((l) => l.slice(4).split(":")[0]);
  const want = ["font-size", "padding-top", "margin-left", "border-top-left-radius", "box-shadow"];
  if (!eq(props, want)) fail(`${JSON.stringify(props)}`);
});

// Four sides of the same shorthand tie on rank, so they fall back to
// alphabetical — stable, if not in visual order, and never interleaved with
// another property's sides.
check("order · sides of one shorthand stay together", (fail) => {
  const sides = ["padding-top", "padding-right", "padding-bottom", "padding-left"];
  const entries = [
    { prop: "margin-top", before: raw("0px"), after: raw("4px") },
    ...sides.map((prop) => ({ prop, before: raw("0px"), after: raw("8px") })),
  ];
  const props = buildEditLines(entries).slice(1).map((l) => l.slice(4).split(":")[0]);
  const paddingRun = props.filter((p) => p.startsWith("padding-"));
  const firstPad = props.findIndex((p) => p.startsWith("padding-"));
  const contiguous = props.slice(firstPad, firstPad + 4).every((p) => p.startsWith("padding-"));
  if (paddingRun.length !== 4 || !contiguous) fail(`sides split up: ${JSON.stringify(props)}`);
  if (props[props.length - 1] !== "margin-top") fail(`margin should follow padding: ${JSON.stringify(props)}`);
});

// A property the panel does not know about must still be reported — it sorts
// to the end rather than vanishing, because a dropped edit is a silent lie.
check("order · unknown properties sort last but are never dropped", (fail) => {
  const entries = [
    { prop: "z-index", before: raw("auto"), after: raw("10") },
    { prop: "font-size", before: raw("14px"), after: raw("18px") },
    { prop: "aspect-ratio", before: raw("auto"), after: raw("16/9") },
  ];
  const lines = buildEditLines(entries);
  if (lines.length !== 4) return fail(`expected 4 lines, got ${lines.length}`);
  if (!lines[1].includes("font-size")) fail("known property should lead");
  // Unknown ones tie on rank and fall back to alphabetical, so they're stable too.
  if (!lines[2].includes("aspect-ratio") || !lines[3].includes("z-index")) {
    fail(`unknown order: ${JSON.stringify(lines.slice(2))}`);
  }
});

// ===== 3. Line shape =====

check("lines · the header line introduces the edits", (fail) => {
  const lines = buildEditLines([{ prop: "font-size", before: raw("14px"), after: raw("18px") }]);
  if (lines[0] !== "# edits: apply these style changes to this element in the source") {
    fail(`header: ${lines[0]}`);
  }
});

// Continuation lines are indented "#   " to match the existing pointer fields,
// so the whole block reads as one comment dialect.
check("lines · continuation indent matches the pointer header", (fail) => {
  const lines = buildEditLines([
    { prop: "font-size", before: raw("14px"), after: raw("18px") },
    { prop: "color", before: raw("#000"), after: raw("#333") },
  ]);
  for (const line of lines.slice(1)) {
    if (!line.startsWith("#   ")) fail(`bad indent: ${JSON.stringify(line)}`);
    if (line.startsWith("#    ")) fail(`over-indented: ${JSON.stringify(line)}`);
  }
});

check("lines · the arrow separates before from after", (fail) => {
  const [, line] = buildEditLines([{ prop: "font-size", before: cls("14px", "text-base"), after: cls("18px", "text-lg") }]);
  if (line !== "#   font-size: text-base (14px) → text-lg (18px)") fail(line);
});

// The worked example from the plan, end to end.
check("lines · the canonical block", (fail) => {
  const lines = buildEditLines([
    { prop: "font-size", before: cls("16px", "text-base"), after: cls("18px", "text-lg") },
    { prop: "color", before: raw("#21201c"), after: raw("#4a4a45") },
    { prop: "padding", before: cssVar("8px", "--space-2"), after: cssVar("12px", "--space-3") },
  ]);
  const want = [
    "# edits: apply these style changes to this element in the source",
    "#   font-size: text-base (16px) → text-lg (18px)",
    "#   color: #21201c → #4a4a45",
    "#   padding: --space-2 (8px) → --space-3 (12px)",
  ];
  if (!eq(lines, want)) fail(`\n got: ${lines.join("\n      ")}\nwant: ${want.join("\n      ")}`);
});

// ===== 4. Empty and malformed input =====

// No edits means no "# edits:" section at all — Copy on an untouched element
// must produce exactly what Copy Code produces, not a header with nothing
// under it.
check("empty · no edits produces no section", (fail) => {
  for (const input of [[], null, undefined]) {
    const got = buildEditLines(input);
    if (!Array.isArray(got) || got.length !== 0) fail(`${JSON.stringify(input)} → ${JSON.stringify(got)}`);
  }
});

check("empty · entries without a property are skipped", (fail) => {
  const lines = buildEditLines([
    null,
    { before: raw("1"), after: raw("2") },      // no prop
    { prop: "", before: raw("1"), after: raw("2") },
    { prop: "font-size", before: raw("14px"), after: raw("18px") },
  ]);
  if (lines.length !== 2) fail(`expected header + 1 line, got ${JSON.stringify(lines)}`);
});

// A one-sided entry still reports: knowing a property changed and not knowing
// from what is more useful than silence.
check("empty · a missing side degrades rather than disappears", (fail) => {
  const lines = buildEditLines([{ prop: "font-size", before: null, after: raw("18px") }]);
  if (lines[1] !== "#   font-size:  → 18px") fail(JSON.stringify(lines[1]));
});

// ===== 5. Sweep — every property in the order list, both value kinds =====

check("sweep · every known property formats and sorts", (fail) => {
  const kinds = [
    ["raw", (i) => raw(`${i}px`)],
    ["class", (i) => cls(`${i}px`, `step-${i}`)],
    ["var", (i) => cssVar(`${i}px`, `--step-${i}`)],
  ];
  for (const [label, make] of kinds) {
    const entries = EDIT_PROP_ORDER.map((prop, i) => ({
      prop, before: make(i), after: make(i + 1),
    }));
    // Shuffle deterministically, then confirm the output is the sorted order.
    const shuffled = entries.slice().sort((a, b) => a.prop.length - b.prop.length || a.prop.localeCompare(b.prop));
    const lines = buildEditLines(shuffled);
    if (lines.length !== EDIT_PROP_ORDER.length + 1) {
      fail(`${label}: ${lines.length} lines for ${EDIT_PROP_ORDER.length} properties`);
      continue;
    }
    const props = lines.slice(1).map((l) => l.slice(4).split(":")[0]);
    if (!eq(props, EDIT_PROP_ORDER)) fail(`${label}: order ${JSON.stringify(props)}`);
    for (const line of lines.slice(1)) {
      if (!line.includes(" → ")) fail(`${label}: missing arrow in ${line}`);
      if (line.includes("undefined") || line.includes("[object")) fail(`${label}: leaked internals in ${line}`);
    }
  }
});

// ===== Report =====

for (const r of rows) {
  console.log(`${r.result.padEnd(5)} ${r.case}${r.detail ? " — " + r.detail : ""}`);
}
console.log(failures === 0 ? "\nedit-deltas: all checks passed" : `\nedit-deltas: ${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
