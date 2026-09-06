---
status: proposed
---

# Bundle the typefaces inside the extension

Pointee's chrome is injected into every page a user visits, and until 2.0 its
typeface arrived through an `@import` of Google Fonts in `tokens.css`. That made
the font the one thing in the product that phoned home, earned a paragraph in
PRIVACY.md, and — because subresources of a content script's stylesheet are
fetched under the host page's Content-Security-Policy — fell back to a system
font on any page with a strict `font-src`. From 2.0 Geist Sans and Geist Mono
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

## To verify before accepting

The CSP fallback is inferred from how Chrome fetches stylesheet subresources,
not observed in this session. Load a strict-CSP page (github.com) with 1.5.0
and confirm the console reports the blocked font before this is marked accepted.
