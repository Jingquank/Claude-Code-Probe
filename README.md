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
| **Copy Element** | Page URL + CSS selector + skeleton HTML |
| **Copy Screenshot** | PNG of the element |
| **Copy Both** | Both in one clipboard |

Paste into Claude Code and it knows exactly which element you mean.

### What "Copy Element" outputs

```
/* URL */
https://myapp.com/dashboard

/* Selector */
main#content > div.card:nth-child(3)

/* HTML */
<div class="card p-6 rounded-xl" data-testid="plan-card">
  <h3 class="text-lg font-semibold">Pro Plan</h3>
  <p class="text-gray-500">For teams that need…</p>
  <button class="btn btn-primary">Upgrade</button>
</div>
```

## Privacy

No data collected. Everything runs locally. [Details](PRIVACY.md).

## License

MIT
