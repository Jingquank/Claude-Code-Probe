// Host-page mutation audit.
//
// Every other feature in this extension is additive: it appends its own chrome
// and reads the page. Edit Mode is the first one that reaches in and changes
// the page's own elements, which is a different kind of risk — a stray write
// that nothing restores leaves the user's page altered after the tool is gone.
//
// So all of it is funnelled through one section of content.js, and this file
// is what keeps it there. It parses the file's "// ===== Name =====" banners
// and asserts that the verbs which write to a host element appear inside the
// Edit Apply section and nowhere else:
//
//   .setProperty(     .removeProperty(
//   .setAttribute("style"|"class", …)      .removeAttribute("style"|"class")
//
// Those four are exclusive on purpose. Chrome elements are positioned with
// direct assignments (node.style.left = …) and classed with classList, which
// this audit ignores — so the extension's own DOM stays unrestricted while the
// page's DOM has exactly one door. If you need to restyle a page element from
// somewhere else, call an Edit Apply function rather than widening this rule.
//
// Run: node test/edit-audit.mjs   (exit 1 on any failure)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const SOURCE = join(root, "content.js");
const MUTATION_SECTION = "Edit Apply";

const text = readFileSync(SOURCE, "utf8");
const lines = text.split("\n");

// ===== Parse the file into sections =====

const BANNER = /^\s*\/\/\s*=====\s*(.+?)\s*=====\s*$/;
const sections = [];
lines.forEach((line, i) => {
  const m = line.match(BANNER);
  if (m) sections.push({ name: m[1], start: i + 1 });
});
sections.forEach((s, i) => {
  s.end = i + 1 < sections.length ? sections[i + 1].start - 1 : lines.length;
});

const sectionAt = (lineNo) =>
  sections.find((s) => lineNo >= s.start && lineNo <= s.end) || { name: "(before any banner)" };

// ===== The rules =====

// A line is a host-page write if it uses one of these verbs. Comments are
// stripped first so this file's own prose — and content.js's — cannot trip it.
const RULES = [
  { name: "setProperty", re: /\.setProperty\s*\(/ },
  { name: "removeProperty", re: /\.removeProperty\s*\(/ },
  { name: 'setAttribute("style"|"class")', re: /\.setAttribute\s*\(\s*["'](?:style|class)["']/ },
  { name: 'removeAttribute("style"|"class")', re: /\.removeAttribute\s*\(\s*["'](?:style|class)["']/ },
];

// Strip line comments and block comments so prose never counts as code.
function stripComments(src) {
  const out = [];
  let inBlock = false;
  for (const line of src.split("\n")) {
    let s = line;
    if (inBlock) {
      const close = s.indexOf("*/");
      if (close === -1) { out.push(""); continue; }
      s = s.slice(close + 2);
      inBlock = false;
    }
    for (;;) {
      const open = s.indexOf("/*");
      if (open === -1) break;
      const close = s.indexOf("*/", open + 2);
      if (close === -1) { s = s.slice(0, open); inBlock = true; break; }
      s = s.slice(0, open) + " " + s.slice(close + 2);
    }
    const lineComment = s.indexOf("//");
    if (lineComment !== -1) s = s.slice(0, lineComment);
    out.push(s);
  }
  return out;
}

const code = stripComments(text);

// ===== Harness =====

const rows = [];
let failures = 0;

function check(name, fn) {
  const errs = [];
  fn((msg) => errs.push(msg));
  failures += errs.length;
  rows.push({ case: name, result: errs.length ? "FAIL" : "ok", detail: errs.slice(0, 4).join("; ") });
}

// ===== 1. The section exists and is the only door =====

check("the Edit Apply section exists", (fail) => {
  const found = sections.filter((s) => s.name === MUTATION_SECTION);
  if (found.length === 0) fail(`no "// ===== ${MUTATION_SECTION} =====" banner in content.js`);
  if (found.length > 1) fail(`${found.length} sections named ${MUTATION_SECTION} — the audit needs exactly one`);
});

check("host-page writes live only in Edit Apply", (fail) => {
  const strays = [];
  code.forEach((line, i) => {
    for (const rule of RULES) {
      if (!rule.re.test(line)) continue;
      const lineNo = i + 1;
      const section = sectionAt(lineNo).name;
      if (section !== MUTATION_SECTION) {
        strays.push(`${rule.name} at content.js:${lineNo} in "${section}"`);
      }
    }
  });
  for (const s of strays) fail(s);
});

// A rule that never fires is a rule that has quietly stopped protecting
// anything — if the section stops using these verbs, the audit is vacuous.
check("the audited verbs are actually in use", (fail) => {
  const apply = sections.find((s) => s.name === MUTATION_SECTION);
  if (!apply) return;
  const body = code.slice(apply.start - 1, apply.end);
  for (const rule of RULES) {
    if (!body.some((line) => rule.re.test(line))) {
      fail(`${rule.name} no longer appears in ${MUTATION_SECTION} — audit would pass vacuously`);
    }
  }
});

// ===== 2. The audit can actually catch something =====
// A check that cannot fail is not a check. Plant each violation in a section
// that is not Edit Apply and confirm the rule sees it.

check("the audit detects a planted violation", (fail) => {
  const samples = [
    ['el.style.setProperty("color", "red");', "setProperty"],
    ["el.style.removeProperty(\"color\");", "removeProperty"],
    ['el.setAttribute("style", "color:red");', 'setAttribute("style"|"class")'],
    ["el.removeAttribute('class');", 'removeAttribute("style"|"class")'],
    ['node.setAttribute( "class" , x);', 'setAttribute("style"|"class")'],
  ];
  for (const [sample, ruleName] of samples) {
    const rule = RULES.find((r) => r.name === ruleName);
    if (!rule.re.test(sample)) fail(`rule ${ruleName} missed: ${sample}`);
  }
});

// ...and must not fire on the chrome-positioning idioms this file is full of,
// or the audit would be noise and get switched off.
check("the audit ignores the extension's own chrome", (fail) => {
  const benign = [
    'node.style.left = Math.round(x) + "px";',
    'labelEl.style.top = top + "px";',
    'node.classList.add("ccp-no-transition");',
    "node.className = cls;",
    'document.documentElement.classList.add("ccp-editing");',
    'settingsButtonEl.setAttribute("aria-label", "Probe settings");',
    'path.setAttribute("d", roundedRectPath(w, h, r));',
    'ants.setAttribute("viewBox", `0 0 ${w} ${h}`);',
  ];
  for (const line of benign) {
    for (const rule of RULES) {
      if (rule.re.test(line)) fail(`rule ${rule.name} false-positives on: ${line}`);
    }
  }
});

// ===== 3. Comment stripping is sound =====
// The rule text appears in prose in both files; if stripping broke, the audit
// would fail on its own documentation.

check("prose mentioning the verbs does not count as code", (fail) => {
  const src = [
    "// setProperty and removeProperty may appear here",
    "/* el.setAttribute(\"style\", x) — described, not called */",
    "  * removeAttribute(\"class\") in a jsdoc line",
    'const ok = 1; // el.style.setProperty("color", "red")',
  ].join("\n");
  const stripped = stripComments(src);
  for (const line of stripped) {
    for (const rule of RULES) {
      if (rule.re.test(line)) fail(`${rule.name} survived stripping: ${JSON.stringify(line)}`);
    }
  }
  // Code on the same line as a trailing comment must survive.
  const mixed = stripComments('el.style.setProperty("a", b); // note')[0];
  if (!/\.setProperty\s*\(/.test(mixed)) fail("stripping ate real code before a trailing comment");
});

// ===== 4. Restore is complete =====
// Recording one attribute but not the other would leave an element half
// restored, which is exactly the silent damage this section exists to prevent.

check("both attributes are recorded and restored", (fail) => {
  const apply = sections.find((s) => s.name === MUTATION_SECTION);
  if (!apply) return;
  const body = code.slice(apply.start - 1, apply.end).join("\n");
  for (const needle of ["originalStyleAttr", "originalClassAttr"]) {
    if (!body.includes(needle)) fail(`${MUTATION_SECTION} never records ${needle}`);
  }
  for (const needle of [/removeAttribute\s*\(\s*["']style["']/, /setAttribute\s*\(\s*["']style["']/,
                        /removeAttribute\s*\(\s*["']class["']/, /setAttribute\s*\(\s*["']class["']/]) {
    if (!needle.test(body)) fail(`${MUTATION_SECTION} never performs ${needle}`);
  }
});

// ===== Report =====

for (const r of rows) {
  console.log(`${r.result.padEnd(5)} ${r.case}${r.detail ? " — " + r.detail : ""}`);
}
console.log(`\n${sections.length} sections parsed from content.js`);
console.log(failures === 0 ? "edit-audit: all checks passed" : `edit-audit: ${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
