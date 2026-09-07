---
status: accepted
---

# Page values sit beside token families; only the source lends a name

The token layer claims a design token only when the source is in force — the
class actually worn, or a `var()` in the declaration that won — and never on a
value that merely equals one. That rule is right for a delta block a coding
agent will apply to source, and it is why the layer is silent on most
production pages: their lengths are hard-coded or compiled away, so the panel
shows no scale at all. From 2026-09-06 a second scale is read straight off the
page — *page values*, the distinct sizes, weights, leadings, trackings,
colours, radii and stroke widths that the elements here actually carry — so
every field can step on any page, and the source model keeps the one thing
the page cannot give: the name. A step that lands on a page value reports the
value; a value that happens to equal an in-scope token is offered as a
suggestion in the field's rung list, on demand, and becomes a claim only after
it is written as that token. Spacing is not harvested: a page's paddings are a
histogram, not a scale.

## Considered options

Replacing the source model with harvesting alone was the tempting
simplification — no stylesheet walk, no cascade modelling, no cross-origin
fetch — and was rejected because the delta block would then only ever say
pixels, which is what the token layer exists to avoid. Loosening the claim to
value coincidence was rejected because a wrong token sends the agent to edit a
reference the source never had. Harvesting spacing was rejected on noise.

## Consequences

The panel now has to draw two kinds of rung as two kinds of thing, and the
accent means "exists in the source" rather than "there is a scale here". The
service-worker fetch of blocked stylesheets buys less than it did — stepping
no longer needs it — and is kept only for naming; revisit once page values
have shipped and its hit rate is known. Hashed single-class selectors
(`css-1a2b3c`) can still form a spurious family under the source model and
need their own guard and fixture.
