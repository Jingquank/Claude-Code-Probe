# Privacy Policy — Claude Code Probe

**Last updated:** April 1, 2026

## Overview

Claude Code Probe is a browser extension that lets developers inspect and copy element information from web pages. Your privacy is important to us, and this extension is designed to operate entirely on your device with no data collection whatsoever.

## Data Collection

Claude Code Probe does **not** collect, store, transmit, or share any data. Specifically:

- **No personal information** is collected
- **No browsing history** is recorded or transmitted
- **No page content** is sent to any server
- **No analytics or tracking** of any kind is used
- **No cookies** are set or read by the extension
- **No accounts or sign-ups** are required

## How the Extension Works

All processing happens locally in your browser:

1. When you activate Probe Mode, the extension reads the DOM of the active tab to display element information (tag names, CSS classes, computed styles, dimensions)
2. When you copy an element, the information is written directly to your system clipboard using the browser's Clipboard API
3. When you capture a screenshot, the element is rendered to a canvas locally using the bundled html2canvas library, then copied to your clipboard

No data ever leaves your browser. The extension does not communicate with any external servers or APIs.

## Permissions

The extension requests the following permissions, used solely for its core functionality:

- **activeTab** — to read element information on the current page when you activate Probe Mode
- **clipboardWrite** — to copy element information and screenshots to your clipboard
- **Host permissions (`<all_urls>`)** — to allow the content script to run on any webpage you choose to inspect

## Third-Party Services

The extension loads the **Geist Mono** font from Google Fonts via a CSS import. This is the only external network request made by the extension. Google's privacy policy applies to this font loading: https://policies.google.com/privacy

No other third-party services, APIs, or external resources are used.

## Data Storage

Claude Code Probe does not use any storage mechanisms — no localStorage, no IndexedDB, no chrome.storage, and no cookies. The extension maintains no persistent state between browsing sessions.

## Changes to This Policy

If this privacy policy is updated, the changes will be posted to this page with an updated date. As the extension collects no data, meaningful changes to this policy are unlikely.

## Contact

If you have questions about this privacy policy, please open an issue at:
https://github.com/Jingquank/Claude-Code-Probe/issues
