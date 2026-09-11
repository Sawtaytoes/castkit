# Slatecast uses the Charcuterie sans, not `system-ui`

- **Status:** Accepted
- **Date:** 2026-09-10
- **Type:** Typography
- **Supersedes:** —
- **Superseded by:** —

## Decision

Slatecast imports `@charcuterie/tokens/fonts.css` and sets the stage in
`var(--font-sans)` (Outfit). The `system-ui` stack is the fallback only. Baloo 2 and
Victor Mono are declared by the same import but no rule names them, so no panel
fetches them.

## Context

Every other owned app loads the fleet's three faces through the tokens package. The
Slatecast stage was still `system-ui, -apple-system, "Segoe UI", sans-serif`, which
resolves to DejaVu Sans on the Raspberry Pi panels and to whatever the remote-display
container image ships on the WT32 renderer. The owner asked on 2026-09-10 whether the
screen views used the Charcuterie fonts; they did not. The 600 weight rule for
secondary lines stays: it was chosen because `system-ui` had no 500 on the Pi, and it
is still the weight that reads from across the room.

## Why

- **One typeface across the fleet**, and the same face the mockups were judged in.
- **A variable face.** Outfit carries 100–900, so the 600 weight is a real weight on
  every panel instead of a synthesised bold.
- **No budget cost.** The woff2 files are separate assets, fetched only when a rule
  names the face; the SPA's 60 KB gz JS/CSS budget is unchanged.

## Evidence

- Owner, 2026-09-10: "Btw, are we using Charcuterie fonts on these screen views?"
- T3 Code chat `0adde1d5-e233-4c59-bf0f-4fed81fba6d7`.
