---
status: accepted
---

# Motion stays in CSS; `motion` is not vendored

ADR 0002 vendored `motion` so the redesign could lean on springs. Round two
of the brand directions chose restrained motion — 180 ms eased entrances,
140 ms exits, nothing past its target — after the author played springs and
eases side by side on the real chrome. An eased transition is what CSS
already does, interruptibly, so the library would have cost about 140 KB on
every page a user visits and bought nothing. Durations and the curve are
tokens in `tokens.css`; entrances use `@starting-style`; every animated thing
stays in the reduced-motion block. If a later round wants a spring, ADR 0002
describes how to bring the library in without a bundler.
