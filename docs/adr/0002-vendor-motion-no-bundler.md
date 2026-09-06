---
status: accepted
---

# Vendor `motion` as a classic script; still no bundler

The 2.0 redesign wants spring physics and interruptible transitions for the
panel, toolbar and toast, which CSS transitions cannot express. Rather than add
a bundler — which would change the build, the load-unpacked-from-root workflow
and the five harnesses that load `content.js` directly — `motion`'s browser
bundle is copied into `lib/` by the postinstall script and listed in the
manifest before `content.js`, exactly as `html2canvas` already is. It is the
only animation dependency; a second one is a sign this decision should be
revisited rather than extended.

## Considered options

CSS-only motion (`@starting-style`, keyframes, transitions) — zero bytes and
CSP-proof, rejected because the winning direction is allowed to lean on springs
and one file — motion 13.2.0's UMD bundle, about 140 KB on disk, 40 KB over the wire — is the whole cost. A bundler plus free npm use — rejected as
a platform change riding on a visual overhaul; the curated component libraries
it would unlock are React-first and have nothing to attach to here.
