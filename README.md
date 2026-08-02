```
 ██████╗██╗      █████╗ ██╗   ██╗██████╗ ███████╗
██╔════╝██║     ██╔══██╗██║   ██║██╔══██╗██╔════╝
██║     ██║     ███████║██║   ██║██║  ██║█████╗
██║     ██║     ██╔══██║██║   ██║██║  ██║██╔══╝
╚██████╗███████╗██║  ██║╚██████╔╝██████╔╝███████╗
 ╚═════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝
 ██████╗ ██████╗ ██████╗ ███████╗
██╔════╝██╔═══██╗██╔══██╗██╔════╝
██║     ██║   ██║██║  ██║█████╗
██║     ██║   ██║██║  ██║██╔══╝
╚██████╗╚██████╔╝██████╔╝███████╗
 ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝
██████╗ ██████╗  ██████╗ ██████╗ ███████╗
██╔══██╗██╔══██╗██╔═══██╗██╔══██╗██╔════╝
██████╔╝██████╔╝██║   ██║██████╔╝█████╗
██╔═══╝ ██╔══██╗██║   ██║██╔══██╗██╔══╝
██║     ██║  ██║╚██████╔╝██████╔╝███████╗
╚═╝     ╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝
```

Point at any element. Copy it. Paste it into Claude Code.

## Install

**[Install from Chrome Web Store](https://chromewebstore.google.com/detail/igboajiogegaabhkjehjmdgmfkcopogj?utm_source=item-share-cb)**

### From source

```sh
git clone https://github.com/Jingquank/Claude-Code-Probe.git
cd Claude-Code-Probe
npm install
```

Then load it: `chrome://extensions` → Developer mode → Load unpacked → select the folder.

## How it works

1. Click the extension icon to enter Probe Mode
2. Hover over elements — a wireframe outline highlights what you're pointing at
3. Click to select — a toolbar appears
4. Pick what to copy:

| | What you get |
|---|---|
| **Copy Code** | Where the element came from in your source, and how to find it again |
| **Screenshot** | PNG of the element |
| **Select Parent** | Moves the selection up one level in the DOM — click again to keep climbing |

Paste into Claude Code and it knows exactly which element you mean.

### What the outline tells you

Hovering is useful on its own. The outline draws the element's box model — margin,
border and padding bands, with its real corner radii — and the panel beside it reads out:

- **Identity** — tag, `#id`, classes, and pixel dimensions
- **Text** — the first of the element's own text, when it has any
- **Layout** — display, position, font size and weight, `role`, `aria-label`, child count.
  Only the parts that aren't the default, so the line stays short.
- **Paint** — background, color, border, radius, shadow, opacity, cursor, transform,
  z-index, with a swatch next to each color
- **Breadcrumb** — the ancestor path, scrolling if it's longer than the panel

The panel and the toolbar are placed together in one pass, so they stay on screen and
off each other whatever the element's geometry — including elements taller than the
window, and `<body>` itself.

### Measuring spacing

With an element selected, hold **Option** (Alt on Windows/Linux) and point at any other
element — Figma-style redlines appear in the theme's accent: a line across each gap with
the distance in pixels, dashed guides extending an edge when the two boxes don't line
up, four inset measurements when one contains the other. The hovered element's outline
carries its real corner radii, and everything glides between targets as you sweep. The
panel and toolbar step aside while the key is down and return where they were when you
release it.

Clicking while holding re-selects: the clicked element becomes the new anchor, and
measuring continues from it — walk a row of siblings without ever releasing the key.

### Settings

A gear sits in the top-right corner for as long as Probe Mode is on — whether or not
anything is selected. It opens the settings page in a tab.

The page is a spec sheet — dotted-leader rows in collapsible sections, with a preview
rail that answers whichever section you're in: the probe chrome while you pick a theme,
a measuring vignette while you tune redlines. Hovering a measuring row spotlights the
part of the vignette that row controls.

**Appearance** — the theme. Eight of them.

| | |
|---|---|
| Terracotta Dark | the default — unchanged from before there was a switch |
| Terracotta Light | same accent, light ground |
| System | follows your OS, and switches when it does |
| Dracula · Monokai · Nord · Solarized Dark · Tokyo Night | |

The info panel already colours tag, `#id` and `.class` separately, which is the same
thing an editor theme defines — so these map onto real palette roles rather than being
approximations of them.

**Measuring** — six controls over the held-Option redlines, defaults matching what
ships: readout unit (`px` / `rem`, against the page's root font-size), precision
(whole / tenths), where the value pill sits (beside its line / on the line), the
dashed extension guides (on / off), a quiet overlay that hides the box-model
tints while measuring (off by default), and whether flush edges are marked with
a `0`.

Everything is stored on this device with `chrome.storage.local` and never leaves it.
Changes repaint tabs that are already open — including a measurement you're holding
at that moment; no reload.

The gear hides itself when the info panel or the toolbar lands on top of it — three of
the six placement strategies dock the panel to the top edge, which is where the gear
lives. It comes back as soon as the panel moves.

### What "Copy Code" outputs

A pointer, not a description — it tells the agent which construct you mean, then gets out
of the way so your own instruction is the loudest thing in the prompt.

````
```
# source: src/components/PlanCard.tsx:42:6
# page: localhost:5173/pricing
# anchor: data-testid="plan-card" (unique in page)
#   text "Pro Plan" (unique in page)
# selector: div[data-testid="plan-card"]
# position: child 2 of 3 in div.grid
#   after div.card "Starter", before div.card "Team"
# repeated: 2 of 3 identical siblings - likely one template; change
#   the component or the data unless this instance alone is meant
# text: Pro Plan For teams that need more. Upgrade
<div class="card flex flex-col gap-3 rounded-xl border p-6 shadow-sm" data-testid="plan-card"> … 3 children </div>
```
````

Notes on the fields:

- **source** is best-effort. It reads the attributes dev tooling already emits —
  `data-inspector-*` (react-dev-inspector), `data-v-inspector` (vite-plugin-vue-inspector),
  `data-source-loc` / `data-source-file`. No plugin, no line.
- **repeated** only appears when the element has identical siblings. It's the difference
  between editing one card and editing the component that renders all of them.
- The **HTML** is the element's own tag with its children summarised, because with a source
  pointer the agent should read the real JSX rather than a rendered copy of it. When neither
  a source location nor a component name resolves, the full skeleton comes back instead —
  it's the only concrete description left.

## Development

```sh
npm install     # fetches html2canvas into lib/
npm run build   # writes dist/chrome, and a zip of it ready for the Web Store
```

Load unpacked from the repo root while you work — `dist/` is build output and every
build starts by deleting it. Changes to `content.js` or `content.css` need an extension
reload in `chrome://extensions` before the page will pick them up; reloading the page
alone isn't enough.

### The placement harness

The info panel and the toolbar have to stay inside the viewport and off each other for
any element geometry — near an edge, taller than the window, scrolled halfway out of
view. `test/` holds the rig that proves it:

| | |
|---|---|
| `test/placement.mjs` | the executable spec — placement algorithms and a 23-case geometry matrix |
| `test/sim.mjs` | headless runner, comparing algorithms across viewports |
| `test/redline.mjs` | the redline solver's spec — named cases plus a 10,000-config sweep |
| `test/edit-color.mjs` | Edit Mode's colour conversions — round trips bounded by 8-bit quantisation |
| `test/harness.html` | browser harness: simulate, or sweep the real extension and reconcile |
| `test/PLACEMENT-PLAN.md` | why the placement works the way it does |

```sh
node test/sim.mjs                        # the matrix, across six viewports
node test/sim.mjs 1440x900 --detail      # one viewport, with per-case geometry
node test/redline.mjs                    # spacing-measurement geometry
node test/edit-color.mjs                 # picker colour maths

python3 -m http.server 8765              # then open /test/harness.html
```

The harness is keyboard-driven — `s` simulates, `r` sweeps the live extension, `n`/`p`
walk the cases — because Probe Mode captures every click on the page, including on the
harness's own buttons. Serve it over HTTP: `file://` works only if the extension has
"Allow access to file URLs".

`content.js` can't import the spec — MV3 content scripts are classic scripts — so the
algorithm lives in two places. The live sweep is what keeps them honest: it measures the
real `#ccp-label` and `#ccp-toolbar` and reports any case where they disagree with the
simulation. Run it after touching placement.

### Design tokens

Every colour, typeface, radius, shadow and duration lives in `tokens.css` as a CSS
custom property. A theme is one block of 19 declarations; nothing else changes.
[DESIGN.md](DESIGN.md) is the contract — what the two token tiers are, why placement
geometry deliberately stays in JavaScript, and which three values are never themed.

```sh
node test/tokens.mjs    # 71 checks
```

It fails the run on a colour literal left in `content.css`, a theme missing one of the
19, a `var(--ccp-…)` nothing declares, a badge colour that has drifted from its theme,
or text that can't be read against its own surface. Warnings are real too: the
de-emphasised 10px grey is below WCAG AA in most themes, which DESIGN.md explains
rather than hides.

## Privacy

No data collected. Everything runs locally. [Details](PRIVACY.md).

## License

MIT
