---
status: accepted
---

# Bundle the typefaces inside the extension

Pointee's chrome is injected into every page a user visits, and until 2.0 its
typeface arrived through an `@import` of Google Fonts in `tokens.css`. That made
the font the one thing in the product that phoned home, earned a paragraph in
PRIVACY.md, and — as it turned out when checked — never produced a font face
at all, so the chrome was rendering in the fallback stack on every page. From 2.0 Geist Sans and Geist Mono
ship as woff2 inside the extension and are declared in `@font-face` through
`chrome-extension://__MSG_@@extension_id__/`, a scheme page CSP does not govern.
Roughly 100 KB more on disk; no network request, no privacy disclosure, one
rendering on every page.

## Considered options

System fonts (`system-ui`, `ui-monospace`) were the other honest answer: zero
bytes, and literally what Cursor and Aside do. They lost on consistency — the
chrome should look the same in a README screenshot, on a Windows machine, and
in a settings preview. Inter + JetBrains Mono was rejected as generic; Geist
keeps the mono users already see and adds its matched sans.

## Observed, 2026-09-06

Checked with the unpacked extension loaded into a Chromium (Aside) and
`document.fonts` asked which faces had loaded. The 1.5.0 build's `@import`
registered **no** Geist face on github.com and none on example.com either —
so the mono users saw was the fallback stack all along, strict policy or
not. The 2.0 build's bundled faces load on both pages and on the options
page, through one `@font-face` declaration: Chrome substitutes
`__MSG_@@extension_id__` in `tokens.css` whether it is injected as a
content-script stylesheet or linked from an extension page.
