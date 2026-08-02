// Edit Mode integration suite — the real content.js, in a real browser.
//
// Every other test in this repo checks something *about* the source: the pure
// sweeps run a transcribed copy, edit-audit reads the file as text, tokens.mjs
// parses the CSS. None of them execute the shipped content script. That gap is
// not academic — five bugs shipped through it, and four of them were real
// browser behaviours no hand-written stub would have reproduced:
//
//   · CSS Nesting gives every CSSStyleRule a cssRules list, so the collector's
//     "is this a group rule?" test matched everything and read nothing.
//   · Chrome keeps an empty attribute node after the first removeAttribute,
//     so every reset left a style="" behind.
//
// A stub would have encoded the same wrong assumptions and passed. So this file
// drives an actual Chromium over the DevTools Protocol, loads the harness, and
// asserts against computed styles the browser really produced.
//
// Zero dependencies, deliberately — the repo has none and should keep none.
// Node 24 ships WebSocket and fetch globally, which is the whole client.
//
// Run: node test/cdp.mjs   (exit 1 on any failure)
//      node test/cdp.mjs --headful   to watch it happen

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const HEADFUL = process.argv.includes("--headful");
const PORT = 8791;
const DEBUG_PORT = 9333;
const PROFILE = join(tmpdir(), "ccp-cdp-profile");

// Any Chromium will do — the extension targets Chrome but the protocol is the
// same everywhere, and a contributor may well not have Chrome installed. The
// list is ordered by "most likely to be the browser this extension is
// developed against".
const BROWSERS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  `${process.env.HOME}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/Applications/Aside.app/Contents/MacOS/Aside",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

function findBrowser() {
  if (process.env.CCP_CHROME) return process.env.CCP_CHROME;
  const found = BROWSERS.find((p) => existsSync(p));
  if (!found) {
    console.error(
      "No Chromium-based browser found. Install Chrome, or point CCP_CHROME at a binary:\n" +
      "  CCP_CHROME='/path/to/browser' node test/cdp.mjs"
    );
    process.exit(1);
  }
  return found;
}

// ===== static server =====
// file:// cannot be used: a file:// stylesheet throws on .cssRules exactly like
// a cross-origin one, which would disable the token layer under test.

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function serve() {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    try {
      const body = await readFile(join(ROOT, path));
      res.writeHead(200, {
        "content-type": MIME[extname(path)] || "application/octet-stream",
        // The harness rewrites stylesheet URLs to dodge caching; belt and
        // braces, so a stale content.css can never make a run lie.
        "cache-control": "no-store",
      });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  return new Promise((resolve) => server.listen(PORT, "127.0.0.1", () => resolve(server)));
}

// ===== CDP client =====

let nextId = 1;
const pending = new Map();

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.addEventListener("open", () => resolve(ws));
    ws.addEventListener("error", reject);
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      const waiter = pending.get(msg.id);
      if (!waiter) return;
      pending.delete(msg.id);
      if (msg.error) waiter.reject(new Error(msg.error.message));
      else waiter.resolve(msg.result);
    });
  });
}

function send(ws, method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

// Evaluate in the page and hand back the value. Errors inside the page become
// errors here rather than an undefined that quietly passes an assertion.
async function evaluate(ws, expression) {
  const result = await send(ws, "Runtime.evaluate", {
    expression: `(async () => { ${expression} })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    const e = result.exceptionDetails;
    throw new Error(e.exception?.description || e.text || "page threw");
  }
  return result.result.value;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, what, timeout = 5000) {
  const started = Date.now();
  for (;;) {
    if (await fn()) return;
    if (Date.now() - started > timeout) throw new Error(`timed out waiting for ${what}`);
    await sleep(50);
  }
}

// ===== harness driving =====
// Written as page-side helpers so each case reads as the user's actions rather
// than as DOM plumbing.

const HELPERS = `
  window.__t = {
    panel: () => document.getElementById("ccp-edit-panel"),
    row: (name) => document.querySelector('#ccp-edit-panel .ccp-edit-row[data-control="' + name + '"]'),
    probeOn: () => window.__ccpHarness.setState(true),
    probeOff: () => window.__ccpHarness.setState(false),
    select: (sel, dx = 5, dy = 5) => {
      const el = document.querySelector(sel);
      const r = el.getBoundingClientRect();
      el.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: r.left + dx, clientY: r.top + dy }));
      return el;
    },
    edit: () => document.querySelector("#ccp-toolbar .ccp-bar button.ccp-icon-btn").click(),
    esc: () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
    undo: (shift) => document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "z", metaKey: true, shiftKey: !!shift, bubbles: true })),
    step: (name, dir) => window.__t.row(name).querySelector(".ccp-edit-tok")
      .querySelectorAll("button")[dir > 0 ? 1 : 0].click(),
    type: (name, value) => {
      const input = window.__t.row(name).querySelector(".ccp-edit-input");
      input.focus();
      input.value = String(value);
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    },
    css: (sel, prop) => getComputedStyle(document.querySelector(sel)).getPropertyValue(prop).trim(),
    copy: async () => {
      let text = null;
      const real = navigator.clipboard.writeText.bind(navigator.clipboard);
      navigator.clipboard.writeText = (t) => { text = t; return Promise.resolve(); };
      document.querySelector("#ccp-edit-panel .ccp-edit-copy").click();
      await new Promise((r) => setTimeout(r, 30));
      navigator.clipboard.writeText = real;
      return text;
    },
  };
  return true;
`;

async function loadHarness(ws) {
  await send(ws, "Page.navigate", { url: `http://127.0.0.1:${PORT}/test/edit-harness.html` });
  await waitFor(
    async () => await evaluate(ws, "return !!(window.__ccpHarness && window.__ccpProbe)"),
    "the harness to boot"
  );
  // The harness re-fetches its stylesheets with a cache-busting query, so the
  // token collector must not run until they have parsed — otherwise it reads
  // an empty document.styleSheets and every token case fails for the wrong
  // reason. This waits for the real signal rather than guessing at a delay.
  await waitFor(
    async () => await evaluate(ws, "return window.__ccpProbe.stylesheetsReady()"),
    "stylesheets to parse"
  );
  await evaluate(ws, HELPERS);
}

// ===== harness =====

const rows = [];
let failures = 0;

async function check(name, fn) {
  const errs = [];
  try {
    await fn((msg) => errs.push(msg));
  } catch (err) {
    errs.push(String(err.message || err));
  }
  failures += errs.length;
  rows.push({ case: name, result: errs.length ? "FAIL" : "ok", detail: errs.slice(0, 3).join("; ") });
}

// ===== the run =====

const server = await serve();
const browserPath = findBrowser();
rmSync(PROFILE, { recursive: true, force: true });

const browser = spawn(browserPath, [
  ...(HEADFUL ? [] : ["--headless=new"]),
  `--remote-debugging-port=${DEBUG_PORT}`,
  `--user-data-dir=${PROFILE}`,
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-extensions",
], { stdio: "ignore" });

let ws;
try {
  let version;
  await waitFor(async () => {
    try {
      version = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).json();
      return true;
    } catch { return false; }
  }, "the browser to expose CDP", 15000);

  const targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
  const page = targets.find((t) => t.type === "page");
  ws = await connect(page.webSocketDebuggerUrl);
  await send(ws, "Page.enable");
  await send(ws, "Runtime.enable");

  console.log(`${browserPath.split("/").pop()} — ${version.Browser}\n`);

  // ===== 1. Regression: the token layer was entirely dead =====
  // CSS Nesting gave every CSSStyleRule a cssRules list, so the collector
  // treated every ordinary rule as a group, recursed into an empty list, and
  // never read a single declaration. Nothing failed; the feature just silently
  // did nothing. The index size is the direct measurement.

  await loadHarness(ws);

  await check("token index is populated", async (fail) => {
    await evaluate(ws, `
      window.__t.probeOn();
      window.__t.select(".card h2");
      window.__t.edit();
      return true;
    `);
    const size = await evaluate(ws, "return window.__ccpProbe.tokenIndexSize()");
    if (!size || size.rules === 0) fail(`collector read ${size && size.rules} rules from the page`);
    if (!size || size.varNames === 0) fail(`collector found ${size && size.varNames} custom properties`);
  });

  await check("palette offers the page's own tokens", async (fail) => {
    const names = await evaluate(ws, `
      window.__t.row("color") || window.__t.row("background-color");
      const row = document.querySelector('#ccp-edit-panel .ccp-edit-row[data-control="color"]')
        || document.querySelector('#ccp-edit-panel .ccp-edit-row[data-control="background-color"]');
      row.querySelector(".ccp-edit-swatch").click();
      const pop = document.querySelector(".ccp-edit-pop");
      return [...pop.querySelectorAll(".ccp-edit-pal")].map((b) => b.title.split(" — ")[0]);
    `);
    if (!names.length) fail("palette was empty");
    if (!names.includes("--terra")) fail(`page tokens missing; got ${JSON.stringify(names.slice(0, 5))}`);
  });

  // ===== 2. Regression: our own tokens leaked into the page's palette =====
  // tokens.css and content.css ride along on every page as content scripts, so
  // the collector was offering --ccp-accent as a fill for the user's elements.

  await check("palette excludes our own chrome tokens", async (fail) => {
    const leaked = await evaluate(ws, `
      const pop = document.querySelector(".ccp-edit-pop");
      return [...pop.querySelectorAll(".ccp-edit-pal")]
        .map((b) => b.title.split(" — ")[0]).filter((n) => n.startsWith("--ccp-"));
    `);
    if (leaked.length) fail(`leaked ${JSON.stringify(leaked.slice(0, 4))}`);
    await evaluate(ws, "window.__t.esc(); return true;"); // close the picker
  });

  // ===== 3. Regression: a token step was recorded but never applied =====
  // applyEditValue read "the current value" back out of the registry, but every
  // caller stored the new value first — so it compared the new value with
  // itself, concluded nothing had changed, and skipped the write. The delta
  // said the step happened; the page disagreed.

  await check("stepping a token moves the page", async (fail) => {
    await loadHarness(ws);
    const seen = await evaluate(ws, `
      window.__t.probeOn();
      window.__t.select(".card h2");
      window.__t.edit();
      const before = window.__t.css(".card h2", "font-size");
      window.__t.step("font-size", 1);
      const after = window.__t.css(".card h2", "font-size");
      return { before, after };
    `);
    if (seen.before !== "18px") fail(`expected to start at 18px, got ${seen.before}`);
    if (seen.after !== "22px") fail(`step wrote ${seen.after}, not 22px — recorded but not applied`);
  });

  // ===== 4. Regression: undo walked to the beginning instead of stepping =====
  // The registry pins a property's "before" at first touch, which is right for
  // the delta. The undo entry reused it, so every entry meant "back to the
  // original" and two steps collapsed into one undo.

  await check("undo gives back one change at a time", async (fail) => {
    const seen = await evaluate(ws, `
      window.__t.step("font-size", 1);          // 22 -> 28
      const twoSteps = window.__t.css(".card h2", "font-size");
      window.__t.undo();
      const once = window.__t.css(".card h2", "font-size");
      window.__t.undo();
      const twice = window.__t.css(".card h2", "font-size");
      window.__t.undo(true);
      const redone = window.__t.css(".card h2", "font-size");
      return { twoSteps, once, twice, redone };
    `);
    if (seen.twoSteps !== "28px") fail(`two steps reached ${seen.twoSteps}, not 28px`);
    if (seen.once !== "22px") fail(`one undo landed on ${seen.once}, not 22px — jumped past a step`);
    if (seen.twice !== "18px") fail(`two undos landed on ${seen.twice}, not 18px`);
    if (seen.redone !== "22px") fail(`redo landed on ${seen.redone}, not 22px`);
  });

  // ===== 5. Regression: every reset left a style="" behind =====
  // Once an inline block has been written through CSSOM, Chrome's first
  // removeAttribute empties it but leaves the attribute node — so an element
  // the tool had finished with still carried a mark of having been touched.

  await check("every path back leaves no residue", async (fail) => {
    for (const [label, undoExpr] of [
      ["undo", `window.__t.undo();`],
      ["dirty dot", `window.__t.row("font-size").querySelector(".ccp-edit-dot").click();`],
      ["reset all", `document.querySelector("#ccp-edit-panel .ccp-edit-resetall").click();`],
    ]) {
      // A fresh page each time: this asserts "one edit, one way back, nothing
      // left" and would otherwise inherit whatever the previous case left in
      // the undo stack.
      await loadHarness(ws);
      const seen = await evaluate(ws, `
        window.__t.probeOn();
        window.__t.select(".card h2");
        window.__t.edit();
        window.__t.step("font-size", 1);
        ${undoExpr}
        const el = document.querySelector(".card h2");
        return { style: el.getAttribute("style"), size: window.__t.css(".card h2", "font-size") };
      `);
      if (seen.style !== null) fail(`${label} left style=${JSON.stringify(seen.style)}`);
      if (seen.size !== "18px") fail(`${label} left the size at ${seen.size}`);
    }
  });

  // ===== Beyond the five: the escalation the dead index also disabled =====
  // findWinningDeclaration reads the same index, so while it was empty an edit
  // to an !important-covered property silently did nothing.

  await check("an !important page rule is matched, not lost to", async (fail) => {
    await loadHarness(ws);
    const seen = await evaluate(ws, `
      window.__t.probeOn();
      window.__t.select(".card.stubborn", 3, 60);
      window.__t.edit();
      const before = window.__t.css(".card.stubborn", "padding-top");
      window.__t.type("padding", 44);
      // Typing commits twice — once on Enter, once on the blur that follows.
      // The second commit is what used to strip the escalation, so asserting
      // after it is the whole point.
      window.__t.type("padding", 44);
      const el = document.querySelector(".card.stubborn");
      return { before, after: window.__t.css(".card.stubborn", "padding-top"),
               priority: el.style.getPropertyPriority("padding"),
               styleAttr: el.getAttribute("style") };
    `);
    if (seen.before !== "20px") fail(`fixture changed: expected 20px, got ${seen.before}`);
    if (seen.after !== "44px") fail(`edit was overridden by the page's !important (got ${seen.after})`);
    if (seen.priority !== "important") {
      fail(`escalation lost — style=${JSON.stringify(seen.styleAttr)}`);
    }
  });

  // ===== The loop the whole feature exists for =====

  await check("the delta block reports what changed", async (fail) => {
    const block = await evaluate(ws, `
      await new Promise(r => setTimeout(r, 20));
      return await window.__t.copy();
    `);
    if (!block) return fail("copy produced nothing");
    if (!block.includes("# edits:")) fail("no edits section");
    if (!/padding[^\\n]*20px[^\\n]*→[^\\n]*44px/.test(block)) {
      fail(`padding delta missing from block: ${JSON.stringify(block.slice(0, 200))}`);
    }
  });
} finally {
  try { if (ws) ws.close(); } catch { /* already gone */ }
  browser.kill();
  server.close();
  rmSync(PROFILE, { recursive: true, force: true });
}

for (const r of rows) {
  console.log(`${r.result.padEnd(5)} ${r.case}${r.detail ? " — " + r.detail : ""}`);
}
console.log(failures === 0 ? "\ncdp: all checks passed" : `\ncdp: ${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
