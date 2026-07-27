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

Then load in your browser:

- **Chrome** — `chrome://extensions` → Developer mode → Load unpacked → select the folder
- **Firefox** — `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → select `manifest.json`

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

## Privacy

No data collected. Everything runs locally. [Details](PRIVACY.md).

## License

MIT
