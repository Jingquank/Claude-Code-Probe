# Pointee landing page — background prototypes, round two

Run from the repository root:

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory website/prototypes
```

Open http://127.0.0.1:4173. Prototype lab compares three background scenes with three wordmark compositions. URLs preserve both choices. The page remains a local first-screen prototype, not a production deployment.

## Visual direction

Retain the supplied banner's charcoal UI, cream Ancho UltraBold wordmark, official hand logo and vermilion selection treatment. All visitor-facing copy is English, with the agreed “Point. Copy. Build.” message and Chrome Web Store CTA. The background is HTML/CSS, not a flattened image.

## Interaction correction

Round one incorrectly showed selection actions and an Appearance panel at rest. Round two follows the real extension's state ladder, studied by running `test/edit-harness.html` with the shipping `content.js` and `content.css`:

- Point Mode on, no selection: no toolbar or edit panel. Hover shows an outline and identity/dimensions only.
- Click: lock one element and show Copy Code, Screenshot, Edit and Select Parent.
- Edit: show contextual Typography/Spacing/Border/Surface controls. Other demo targets cannot be selected while editing.
- Token steps: write real CSS variables from the demo's scale, visibly update the element, retain before/after context.
- Escape: close a context preview, leave editing, clear selection, then turn Point Mode off, one step per key press. Leaving editing retains changes; turning Point Mode off resets them.
- Select Parent: climb from a heading to its containing card and then the collection, never switch arbitrarily to a sibling.
- Measurement: hold Option/Alt with a selection, then point at a neighbour. A redline reports the actual DOM gap. The Measure gaps toggle provides a keyboard/touch alternative; touch taps inspect a measurement target without re-anchoring.

## Scenes

1. **Select a component**: three portfolio cards with selectable nested headings. Demonstrates hover versus selection, source context and parent selection.
2. **Tune typography**: an editorial headline and abstract artwork. Demonstrates contextual editing, token steps, copying edits and resetting.
3. **Measure a layout**: pricing cards with real gaps. Demonstrates anchored redlines and re-anchoring.

All three start with Point Mode on and no selected element. The three composition options remain: make room on Explore, overlapping wordmark, separated wordmark.

## Prototype boundaries

The demo inspects only its own marked sample elements; it does not run the extension on visitors' pages. Source paths in copied context are illustrative and labelled as such. Copy every edit aggregates edited sample elements. Screenshots use the repository's existing html2canvas-pro library and download a PNG of the chosen element. Measurement covers external horizontal/vertical gaps, not the extension's full box-model/inset measurement system. No agent connection is implied.

Files are isolated from the extension's scripts and packaging allowlist. Ancho came from the user-provided archive; supporting fonts, hand icon and screenshot library came from this repository. No Vercel deployment has been performed.

## Validation

Compared real harness selection, Edit, typography token stepping and Escape behavior before redesigning. Browser checks cover initial hidden surfaces, selecting a nested heading, Select Parent, opening Edit, updating a CSS token, stepping back through Escape, and a measured 16px gap matching the DOM geometry. JavaScript syntax is checked with `node --check website/prototypes/app.js`.

## Round three — chosen direction

The user chose scene 01 + composition A. The gallery now uses skeleton heading/description/button shapes, with accessible target names retained. The small header brand, visible interaction guidance and explicit Explore/Back buttons are removed. Contextual inspector labels still appear only after interaction.

Mouse entry into the dummy window automatically makes room in the wordmark. The title hand travels to the pointer over 280ms, flips horizontally, and then tracks the pointer directly with a tip-aligned hotspot. Leaving the stage returns the hand to the title and restores the native cursor. The stable stage boundary prevents entry/exit loops as the browser window moves. Selection and panels close on exit; edited sample styles are retained until reset or Point Mode is turned off.

Keyboard focus and touch activate exploration without hiding the native cursor. Reduced motion skips the hand flight. Blur, hidden-document transitions and scrolling the demo out from under the pointer restore the native cursor. The other scene/composition comparisons remain available in Prototype lab.
