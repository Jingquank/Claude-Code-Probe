# Design tokens & theming — design & implementation

How every colour, typeface, radius, shadow and duration in the probe's chrome is
declared, and how a theme replaces the ones that vary. Replaces ~45 hardcoded
values spread across four files with two tiers of CSS custom properties.

---

## The defect

The palette existed in five places at once, and none of them knew about the
others:

| | held | how it drifted |
|---|---|---|
| `content.css` | 59 colour literals, 16 distinct hex values | the source of truth by accident, not by design |
| `content.js` | 25 more, baked into `CLAWD_SVG` / `CLAWD_MINI` string literals | uppercase (`#C27C5C`), so a lowercase grep missed them |
| `background.js` | the badge colour | browser chrome, can't read CSS at all |
| `test/harness.html` | its own copy of surface / text / accent | already stale in places |
| `icons/generate-icons.js` | `#7C3AED` | **a purple from before the terracotta identity** |

That last row is the proof: the icon generator had been wrong for at least one
rebrand and nothing caught it, because there was nothing to catch it *with*.

Three more symptoms of the same cause:

1. **The font stack was written out six times** and the motion curve
   `0.15s cubic-bezier(0.4, 0, 0.2, 1)` eight times. Changing either meant a
   find-and-replace and hoping.
2. **The one token block that existed was scoped to a single selector.**
   `#ccp-label` declared `--ccp-xs` through `--ccp-gap-section` — so nothing else
   could use them, and `--ccp-lg: 14px` sat declared-but-unreferenced while
   `.ccp-parent-btn` wrote `padding: 0 14px` by hand ten lines away.
3. **Adding a second palette was impossible** without duplicating the stylesheet.

### Measured

| | before | after |
|---|---|---|
| colour literals in `content.css` | 59 | **0** |
| colour literals in `content.js` | 25 | **0** |
| font stack declarations | 6 | **1** |
| motion curve declarations | 8 | **1** |
| selectable themes | 1 | **8** |
| declarations to add a theme | a stylesheet | **19** |

Enforced by `node test/tokens.mjs` — 71 checks, 0 failures. `node test/sim.mjs`
still reports 138/138, which is the evidence that no geometry moved.

---

## The design

### 1. Two tiers, and only one of them is themed

`tokens.css` is `:root` scales followed by one block per theme.

**Tier 1 — 40 theme-invariant tokens.** Type scale, spacing, radii, motion,
z-index layers, opacity states. A theme cannot change these, which is the point:
Dracula should recolour the chrome, not resize it.

**Tier 2 — 19 semantic tokens, redeclared per theme.** Surface, a four-step text
ramp, accent trio plus its ink, two syntax colours, error plus its ink, two
shadows, a swatch border, and Clawd's body and legs.

The split is what makes the contract checkable. "Every theme declares exactly
these 19" is a test; "the theme looks right" is not.

### 2. Alpha variants are derived, never declared

The accent appeared at six different alphas (`.15 .25 .3 .5 .75 .85`) and the
surface at three. Declaring all of them per theme would make each theme ~35 lines
and near-impossible to keep coherent — nine chances to paste a slightly wrong
hex.

```css
border-color: rgb(from var(--ccp-accent) r g b / 0.5);
```

Relative colour syntax, Chrome 119+. Available unconditionally since the Firefox
target was dropped in 1.2.0. **This is the single decision that keeps a theme to
19 declarations** — every alpha follows its base automatically, so a theme cannot
have a border that disagrees with its own accent.

### 3. One attribute, because custom properties survive `all: initial`

`data-ccp-theme` on `<html>`, and every token block keys off it. All five injected
roots — `#ccp-overlay-container`, `#ccp-label`, `#ccp-toolbar`,
`#ccp-settings-btn`, `#ccp-toast` — inherit from there. No per-root plumbing.

This works because of one specific guarantee. Four of those roots set
`all: initial`, and **`all` does not reset custom properties** (CSS Cascade 4
§3.2 states it explicitly). Regular inherited properties *are* reset, which is
why `font-family` and `box-sizing` are still redundantly re-declared on
`.ccp-bar`, `.ccp-bar button` and `.ccp-parent-btn` — that redundancy is load
bearing, not leftover.

Had it gone the other way, the token block would have to be duplicated at each
`all: initial` boundary, and this document would say so instead.

Theme blocks are keyed on `[data-ccp-theme="…"]` rather than
`:root[data-ccp-theme="…"]`, so a theme can be scoped to any subtree. The
settings page relies on it: each pill's swatch carries its own
`data-ccp-theme` and draws its stripes from `var(--ccp-surface)`,
`var(--ccp-accent)` and the two syntax colours. **The swatch is not a picture of
the palette, it is the palette** — no hex is repeated in the settings page at
all.

### 4. `system` resolves in JS, not in a media query

`matchMedia("(prefers-color-scheme: dark)")` picks one of the two terracotta
blocks and writes the *resolved* id into the attribute, with a `change` listener
so it follows the OS live.

The alternative — wrapping every block in `@media` — would double the file and
put two copies of each palette one edit apart. It would also make the settings
page lie: the preview shows what the attribute selects, so resolving in JS means
the preview and the page agree by construction.

This also matches the precedent already set in `content.css` for `.ccp-compact`,
where a JS-toggled class beat a media query because the JS needed to know.

### 5. Geometry stays in JS — the one deliberate exception

`GEOMETRY` in `content.js` keeps `margin`, `gap`, `pair`, `minLabelHeight`,
`narrowToolbar`, `radiusFallback` and `maxSweepDiagonal` as JavaScript numbers.

Not an oversight. `computeChromeLayout()` is a **pure function**, mirrored in
`test/placement.mjs` and validated over 8280 configurations with no DOM present.
A pure function cannot call `getComputedStyle`, so a CSS custom property is
unreachable from the place these values are actually consumed. Moving them would
buy tidiness and cost the spec.

The rule, stated once: **values the layout algorithm reasons about live in
`GEOMETRY`; values that only paint live in `tokens.css`.** `--ccp-ring: 2px` is a
token because it draws a stroke; `GEOMETRY.gap: 6` is not because the solver does
arithmetic on it.

`test/placement.mjs` mirrors four of them. Change one, change both — the
harness's live sweep is what catches the drift.

### 6. Three things are never themed, on purpose

Each carries a comment at its definition, or the next sweep absorbs it.

| value | why it stays fixed |
|---|---|
| `--ccp-checker` | the chequerboard behind a translucent swatch. The swatch reports the *page's* colour, so its backdrop must stay a neutral reference or the tool misreports what it is inspecting |
| `--ccp-mask` | a stencil, not a colour — `mask-image` reads only its alpha. Theming it could do nothing useful and could break the mask |
| `resolveBackgroundColor()`'s `#ffffff` | the browser's default page background, reported as a fact about the page |

The colour swatch's *fill* is written inline from JS for the same reason. Only its
border follows the theme.

### 7. Motion is part of the token set, so reduced-motion is part of the contract

Four durations and one curve are tokens. That made an existing gap obvious: the
`prefers-reduced-motion` query disabled `#ccp-ants` and `.ccp-spin` but **not
Clawd's 24s walk or 1.1s bob**, so the mascot kept pacing for anyone who had
asked their OS for stillness. The marquee was missing too. Both are now in the
query.

Anything animated must be listed there. There is no automated check for this one
— it is the weakest link in this document.

### 8. Contrast is checked, and one shortfall is recorded rather than hidden

Eight hand-tuned palettes is exactly how an unreadable theme ships, so
`test/tokens.mjs` computes WCAG 2.1 ratios for ten foreground/background pairs
per theme. Two tiers:

| tier | pairs | floor | rationale |
|---|---|---|---|
| text | `text`, `text-dim`, `text-muted`, `syntax-id`, `syntax-class`, `on-accent` on `accent`, `on-error` on `error` | **4.5:1** | AA for body text |
| non-text / transient | `text-faint`, `accent` on `surface`, `on-accent` on `accent-dark` | **3:1**, warn under 4.5 | `accent` doubles as a border and icon colour, where 3:1 is the correct AA bar; `accent-dark` is only the `:active` fill, held for as long as a mouse button is down |

**`--ccp-text-faint` does not reach AA in seven of the eight themes** — 3.39:1 in
the default. This is inherited, not introduced: it is the shipped 1.2.0 grey, and
`terracotta-dark` must stay pixel-identical. Raising it to 4.5:1 would collapse
the info panel's four-step text hierarchy into two, because `text-muted` sits at
5.14:1 and there is no room between them.

So it is reported as a WARN on every run rather than quietly passed. Ten warnings
stand today. The honest summary: **the de-emphasised 10px readout is below AA,
and fixing it is a redesign of the label's hierarchy, not a token change.** A
High Contrast theme is the intended answer and is not in this release.

Finding this is what the checker is for. It also caught five genuine failures in
the new palettes before they shipped — Nord's and Solarized's error inks, and
three accent/ink pairs — all corrected in `tokens.css`.

### 9. The badge is the one place a hex is legitimately duplicated

`chrome.action.setBadgeBackgroundColor` is browser chrome. It cannot read
`tokens.css`, so `background.js` holds a `BADGE_ACCENT` map. That is real
duplication, so `test/tokens.mjs` asserts it matches every theme's `--ccp-accent`
and that neither side has an entry the other lacks. A new theme with a forgotten
badge fails the run.

---

## Adding a theme

1. Copy any block in `tokens.css` and change the 19 values. Order them
   surface → text ramp → accent → syntax → status → shadows → mascot, as the
   others do, so the blocks diff cleanly.
2. Add `{ id, name }` to `THEMES` in `settings/settings.js`. No colours — the
   pill's swatch reads them from the block you just wrote.
3. Add the accent to `BADGE_ACCENT` in `background.js`.
4. `node test/tokens.mjs`. It will tell you which of the 19 you missed and which
   pairs are unreadable.

Light themes need their **shadows re-tuned, not inverted**. The dark themes'
`rgba(20, 20, 19, 0.6)` reads as a smudge on a light surface, which is why
`--ccp-shadow-card` and `--ccp-shadow-bar` are themed values rather than derived
from the surface.

---

## Verification

```sh
node test/tokens.mjs     # 71 checks: literals, completeness, undeclared vars,
                         # badge drift, contrast
node test/sim.mjs        # 138/138 — proves the refactor moved no geometry
```

Then, in the browser — a `content.js` or `content.css` edit needs an *extension*
reload, not just a page reload:

1. **The default must be pixel-identical to the previous release.** This is the
   whole regression surface of the refactor; screenshot-diff if in doubt.
2. Switch theme in the options tab — an already-open probe tab re-themes with no
   reload, via `chrome.storage.onChanged`.
3. `System` follows an OS light/dark flip live.
4. Per theme: the label's swatches still show *page* colours, and light-theme
   shadows read as shadows.
5. Turn on reduced motion at the OS level: Clawd stops walking and bobbing.

## Out of scope

- Custom user-authored themes, or a colour picker.
- Per-site theme overrides — the preference is global.
- A High Contrast theme. It needs contrast *targets* driving the palette, not a
  palette hoping to clear them.
- Theming inside cross-origin iframes.
- Tokenising `test/select-parent-fixture.html`. It stands in for an arbitrary
  website under inspection; if its colours followed the theme it would stop being
  a fair test of what the info panel reports.
