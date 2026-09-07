#!/usr/bin/env node
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const libDir = path.join(__dirname, "..", "lib");
const outFile = path.join(libDir, "html2canvas-pro.min.js");

console.log(`
██████╗  ██████╗ ██╗███╗   ██╗████████╗███████╗███████╗
██╔══██╗██╔═══██╗██║████╗  ██║╚══██╔══╝██╔════╝██╔════╝
██████╔╝██║   ██║██║██╔██╗ ██║   ██║   █████╗  █████╗
██╔═══╝ ██║   ██║██║██║╚██╗██║   ██║   ██╔══╝  ██╔══╝
██║     ╚██████╔╝██║██║ ╚████║   ██║   ███████╗███████╗
╚═╝      ╚═════╝ ╚═╝╚═╝  ╚═══╝   ╚═╝   ╚══════╝╚══════╝

  Point at any element. Copy it. Paste it into your coding agent.
`);

// Download html2canvas-pro if the checked-in copy is missing. The fork, not
// html2canvas 1.4.1: that one's colour parser predates oklch(), lab() and
// color-mix(), and Chrome reports computed colours in the space they were
// written in, so on any page styled that way every capture threw. The UMD
// build assigns window.html2canvas, so content.js calls it by the old name.
if (!fs.existsSync(libDir)) {
  fs.mkdirSync(libDir, { recursive: true });
}

if (!fs.existsSync(outFile)) {
  console.log("  Downloading html2canvas-pro v2.4.1...");
  execSync(
    `curl -sL "https://cdn.jsdelivr.net/npm/html2canvas-pro@2.4.1/dist/html2canvas-pro.min.js" -o "${outFile}"`
  );
  console.log("  Done!\n");
} else {
  console.log("  html2canvas-pro already present.\n");
}

console.log(`  To use Pointee:

  chrome://extensions → Developer mode → Load unpacked → select this folder
`);
