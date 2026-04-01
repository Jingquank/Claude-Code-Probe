#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

rm -rf dist
mkdir -p dist/chrome dist/firefox

SRC_FILES="manifest.json background.js content.js content.css"
SRC_DIRS="icons lib"

# Chrome build — strip browser_specific_settings (Chrome ignores it but cleaner without)
for f in $SRC_FILES; do cp "$f" dist/chrome/; done
for d in $SRC_DIRS; do cp -r "$d" dist/chrome/; done
rm -f dist/chrome/icons/generate-icons.js
node -e "
  const fs = require('fs');
  const m = JSON.parse(fs.readFileSync('dist/chrome/manifest.json', 'utf8'));
  delete m.browser_specific_settings;
  fs.writeFileSync('dist/chrome/manifest.json', JSON.stringify(m, null, 2));
"
(cd dist/chrome && zip -r ../claude-code-probe-chrome.zip . -x ".*")
echo "Chrome build: dist/claude-code-probe-chrome.zip"

# Firefox build — manifest already has browser_specific_settings
for f in $SRC_FILES; do cp "$f" dist/firefox/; done
for d in $SRC_DIRS; do cp -r "$d" dist/firefox/; done
rm -f dist/firefox/icons/generate-icons.js
(cd dist/firefox && zip -r ../claude-code-probe-firefox.zip . -x ".*")
echo "Firefox build: dist/claude-code-probe-firefox.zip"

echo "Done!"
