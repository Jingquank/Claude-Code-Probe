#!/usr/bin/env node
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const libDir = path.join(__dirname, "..", "lib");
const outFile = path.join(libDir, "html2canvas.min.js");

console.log(`
┌─┐┌─┐┌─┐┌─┐┌─┐┌─┐  ┌─┐┌─┐┌─┐┌─┐  ┌─┐┌─┐┌─┐┌┐ ┌─┐
│  │  ├─┤│ │├─┤├┤   │  │ │├─┤├┤   ├─┘├┬┘│ │├┴┐├┤
└─┘┴─┘┴ ┴└─┘└─┘└─┘  └─┘└─┘└─┘└─┘  ┴  ┴└─└─┘└─┘└─┘

  Inspect, highlight, and copy any element on any webpage.
`);

// Download html2canvas
if (!fs.existsSync(libDir)) {
  fs.mkdirSync(libDir, { recursive: true });
}

if (!fs.existsSync(outFile)) {
  console.log("  Downloading html2canvas v1.4.1...");
  execSync(
    `curl -sL "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js" -o "${outFile}"`
  );
  console.log("  Done!\n");
} else {
  console.log("  html2canvas already present.\n");
}

console.log(`  To use Claude Code Probe:

  Chrome  →  chrome://extensions → Developer mode → Load unpacked → select this folder
  Firefox →  about:debugging#/runtime/this-firefox → Load Temporary Add-on → select manifest.json
`);
