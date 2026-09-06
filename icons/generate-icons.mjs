// Renders icons/icon-{16,32,48,128}.png from assets/icon.svg.
// Run: node icons/generate-icons.mjs
//
// A headless Chromium does the rasterising — the same browser finder the test
// suite uses, so this needs nothing installed that the tests do not. The SVG is
// opened at each size on a transparent page and captured; PNGs come out with
// real alpha, which the 1.x canvas-based generator never gave them.

import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const SIZES = [16, 32, 48, 128];
const PORT = 9337;
const PROFILE = join(ROOT, ".pointee-icon-profile");

// Mirrors BROWSERS in test/cdp.mjs — change both.
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
const browserPath = process.env.PNT_CHROME || BROWSERS.find((p) => existsSync(p));
if (!browserPath) {
  console.error("No Chromium-based browser found. Point PNT_CHROME at a binary.");
  process.exit(1);
}

const svg = readFileSync(join(ROOT, "assets/icon.svg"), "utf8");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let nextId = 1;
const pending = new Map();
const send = (ws, method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});

rmSync(PROFILE, { recursive: true, force: true });
const browser = spawn(browserPath, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--hide-scrollbars",
], { stdio: "ignore" });

try {
  let page;
  for (let i = 0; i < 80 && !page; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      page = targets.find((t) => t.type === "page");
    } catch { /* not up yet */ }
    if (!page) await sleep(250);
  }
  if (!page) throw new Error("the browser opened no page target");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
  });
  await send(ws, "Page.enable");
  await send(ws, "Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });

  for (const size of SIZES) {
    const html = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`;
    await send(ws, "Emulation.setDeviceMetricsOverride", { width: size, height: size, deviceScaleFactor: 1, mobile: false });
    await send(ws, "Page.navigate", { url: "data:text/html;charset=utf-8," + encodeURIComponent(html) });
    await sleep(250);
    const shot = await send(ws, "Page.captureScreenshot", {
      format: "png",
      clip: { x: 0, y: 0, width: size, height: size, scale: 1 },
    });
    const out = join(HERE, `icon-${size}.png`);
    writeFileSync(out, Buffer.from(shot.data, "base64"));
    console.log(`Generated ${out}`);
  }
} catch (err) {
  console.error("generate-icons:", err.message);
  process.exitCode = 1;
} finally {
  browser.kill("SIGKILL");
  rmSync(PROFILE, { recursive: true, force: true });
  setTimeout(() => process.exit(process.exitCode || 0), 300);
}
