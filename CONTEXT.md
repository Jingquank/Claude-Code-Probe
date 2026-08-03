# Context

The vocabulary this codebase uses for itself. Terms here are the ones that turn
out to be load-bearing — where using the wrong word leads to the wrong design,
or where two things that sound alike are not the same thing.

This is a glossary, not a spec. How anything works lives in `DESIGN.md`,
`test/PLACEMENT-PLAN.md`, or the code.

## Modes

**Probe Mode** — the extension is switched on for a tab. Hovering outlines
whatever is under the pointer; clicking selects. Everything below happens inside
it. Signalled by `ccp-probe-active` on `<html>`.

**Selection** — one element is locked in, and the toolbar is showing. The
extension has exactly one selection at a time. Its truthiness *is* the state:
there is no separate flag.

**Redline** — held-Option spacing measurement. A sub-mode of Selection: it
cannot be entered without one, and every path that drops the selection ends it.

**Edit Mode** — live-tuning the selected element through a panel. Also a
sub-mode of Selection, and the only feature that writes to the page.

Redline and Edit Mode differ in who owns the pointer. Redline is a held
modifier and the page underneath stays live. Edit Mode owns the mouse for as
long as it lasts — the page is **inert**, meaning clicks, double-clicks and
context menus over it are swallowed so a scrub across a page of links cannot
navigate away mid-drag.

## Editing

**Edit** — one property's before→after on one element. Not "a change to an
element": each property is tracked separately, because each is a separate line
in the block and a separate thing to undo.

**Edit panel** — the draggable control surface. An *inspector column*: one
narrow column of titled groups, chosen over eleven alternatives in
`test/edit-ui-prototypes.html`.

**Tether** — what says "this panel edits that element" in Edit Mode, once the
selection box has been taken away. Four ticks at the element's edge midpoints
plus a dashed run from the panel to the tick on the facing edge. Chosen over
eleven alternatives in `test/edit-association-prototypes.html`.

The box had to go, and the reason is the whole design: the panel writes
`border-width`, `border-color`, `border-radius` and `box-shadow`, and the box is
a ring drawn 2px outside the element — sitting on exactly the four things being
judged. The tether works only in the ring of space *outside* the element, and
`test/tether.mjs` sweeps that as a property rather than trusting it.

Not the same thing as Redline, though they share a dashed vocabulary on purpose.
Redline measures the distance between two elements and puts a number on it; the
tether asserts a relationship between chrome and an element and carries no
value. A run that is longer means the panel was dragged further away, nothing
more.

**Delta block** — what the panel copies: the same source pointer Copy Code
emits, plus one line per edit. This is the product. The panel is how you produce
it.

**Origin vs. from** — two different "before"s, and conflating them makes an undo
stack wrong. *Origin* is the value at first touch and belongs to the delta: the
block should say where a property started, however many times it was nudged
since. *From* is the value a particular gesture is leaving and belongs to the
undo entry, so one ⌘Z gives back one change rather than the whole session.

**Gesture** — a continuous interaction that repaints many times and must land as
one undo entry: a scrub, a held arrow key, a drag in the colour picker.

**Token family** — a name-prefixed scale a stepper can walk (`--title-sm/md/lg`,
`text-xs…text-2xl`, `p-0…p-96`). A family of one is not a family: a scale you
cannot step along is not a scale.

**Rung** — one member of a family. A value is *on* a rung when its resolved
value matches within half a pixel; anything else is *off-scale*, and off-scale
claims no token.

**Own chrome** — the DOM this extension injects, all `ccp-`-prefixed. Kept
distinct from the page's own DOM everywhere: in hit-testing, in what the info
label reports, and in which stylesheets the token resolver reads. The
extension's design tokens are not the page's design tokens.

## Copy

**Pointer** — the `# key: value` header naming an element: where it came from in
source, how to find it again, what it says. Shared by Copy Code and the delta
block, so both name an element in the same dialect.

**Skeleton** — the depth-limited HTML fallback, used only when no source file
and no component name could be found. With a pointer, the agent should read the
real source rather than a rendered copy of it.
