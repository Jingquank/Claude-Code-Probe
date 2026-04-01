```
┌─┐┌─┐┌─┐┌─┐┌─┐┌─┐  ┌─┐┌─┐┌─┐┌─┐  ┌─┐┌─┐┌─┐┌┐ ┌─┐
│  │  ├─┤│ │├─┤├┤   │  │ │├─┤├┤   ├─┘├┬┘│ │├┴┐├┤ 
└─┘┴─┘┴ ┴└─┘└─┘└─┘  └─┘└─┘└─┘└─┘  ┴  ┴└─└─┘└─┘└─┘
```

Inspect, highlight, and copy any element on any webpage — without opening DevTools.

## What it does

Click the extension icon to enter **Probe Mode**. Hover over any element to see a wireframe overlay with a live info card. Click to select, then copy element details or a screenshot to your clipboard.

### Copy actions

| Action | What you get |
|--------|-------------|
| **Copy Element** | Structured summary: CSS selector path, skeleton HTML, computed styles, dimensions |
| **Copy Screenshot** | Pixel-perfect PNG of the element with its background |
| **Copy Both** | Text summary + screenshot together in the clipboard |

### Info card

The floating info card shows three lines of context as you hover:

```
div#main.container                    842 x 320
flex · 16px · w:600 · 3 children
body › main.content › section › div#main.container
```

- **Line 1** — tag, id, classes, dimensions
- **Line 2** — display type, font size, font weight, ARIA attributes, child count
- **Line 3** — DOM breadcrumb path (scrolling marquee for long paths)

## Install

### Quick install

```sh
git clone https://github.com/Jingquank/Claude-Code-Probe.git
cd Claude-Code-Probe
npm install
```

`npm install` automatically downloads the html2canvas dependency and shows setup instructions in your terminal.

### Load in Chrome

1. Open `chrome://extensions` in your browser
2. Toggle on **Developer mode** (top right corner)
3. Click **Load unpacked**
4. Select the `Claude-Code-Probe` folder you just cloned
5. The pixel-art Clawd icon appears in your toolbar — you're ready to go

### Load in Firefox

1. Open `about:debugging#/runtime/this-firefox` in your browser
2. Click **Load Temporary Add-on**
3. Navigate to the `Claude-Code-Probe` folder and select `manifest.json`
4. The icon appears in your toolbar

> **Note:** Firefox temporary add-ons reset when you restart the browser. You'll need to reload it each session until the extension is approved on the Firefox Add-ons store.

## Usage

1. **Activate** — Click the extension icon. The badge shows **ON** and your cursor becomes a crosshair.
2. **Inspect** — Hover over elements. A wireframe outline follows your cursor with a floating info card showing element details.
3. **Select** — Click any element to lock the selection. An action toolbar appears.
4. **Copy** — Click one of the three buttons:
   - **Copy Element** — copies a structured text breakdown to your clipboard
   - **Copy Screenshot** — copies a PNG screenshot of the element
   - **Copy Both** — copies text + screenshot together
5. **Deselect** — Press **Escape** to deselect the element.
6. **Exit** — Press **Escape** again to turn off Probe Mode.

### What "Copy Element" gives you

When you paste after copying an element, you get a structured summary like this:

```
/* Selector */
main#content > div.hero-section > h1.title

/* HTML */
<div class="hero-section" data-testid="hero">
  <h1 class="title">Welcome to our platfor…</h1>
  <p class="subtitle">Build something amazi…</p>
  <button class="cta-btn">Get Started</button>
</div>

/* Styles */
display: flex; flex-direction: column; gap: 16px;
padding: 48px 24px; background: rgb(26, 26, 46);
font-size: 36px; font-weight: 600; color: rgb(255, 255, 255)

/* Dimensions */
842 × 320
```

This format is designed to paste directly into AI coding assistants like Claude Code, giving it full context about the element you're looking at.

## Built with

- Vanilla JS — no framework, no build step
- [html2canvas](https://html2canvas.hertzen.com/) — element screenshot capture
- [Geist Mono](https://vercel.com/font) — UI typography
- Claude brand colors and the pixel-art Clawd mascot

## Building distribution packages

To create zip files for Chrome Web Store or Firefox Add-ons submission:

### Requirements

- **OS:** macOS, Linux, or Windows (with bash)
- **Node.js:** v18 or later
- **curl:** for downloading html2canvas (included on macOS and most Linux distros)

### Steps

1. Clone and install:
   ```sh
   git clone https://github.com/Jingquank/Claude-Code-Probe.git
   cd Claude-Code-Probe
   npm install
   ```

2. Build the distribution zips:
   ```sh
   npm run build
   ```

3. Output:
   - `dist/claude-code-probe-chrome.zip` — Chrome Web Store package
   - `dist/claude-code-probe-firefox.zip` — Firefox Add-ons package

### Source code notes

All source files (`background.js`, `content.js`, `content.css`) are hand-written vanilla JavaScript and CSS — no transpilation, concatenation, or minification. The only machine-generated file is `lib/html2canvas.min.js`, which is an open-source third-party library ([html2canvas v1.4.1](https://github.com/niklasvh/html2canvas), MIT license) downloaded directly from npm/CDN.

## Privacy

Claude Code Probe collects no data. All processing happens locally in your browser. See [PRIVACY.md](PRIVACY.md) for details.

## License

MIT
