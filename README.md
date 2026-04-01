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

### Chrome

1. Download the [latest release](https://github.com/Jingquank/Claude-Code-Probe/releases) or clone this repo
2. Go to `chrome://extensions` and enable **Developer mode**
3. Click **Load unpacked** and select the project folder

### Firefox

1. Go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on** and select `manifest.json`

## Usage

1. Click the extension icon — badge shows **ON** and cursor becomes a crosshair
2. Hover over elements — wireframe outlines appear with the info card
3. Click an element — it locks the selection and shows the action toolbar
4. Choose a copy action from the toolbar
5. Press **Escape** to deselect, press again to exit Probe Mode

## Built with

- Vanilla JS — no framework, no build step
- [html2canvas](https://html2canvas.hertzen.com/) — element screenshot capture
- [Geist Mono](https://vercel.com/font) — UI typography
- Claude brand colors and the pixel-art Clawd mascot

## Building

```sh
./build.sh
```

Outputs Chrome and Firefox zip files to `dist/`.

## Privacy

Claude Code Probe collects no data. All processing happens locally in your browser. See [PRIVACY.md](PRIVACY.md) for details.

## License

MIT
