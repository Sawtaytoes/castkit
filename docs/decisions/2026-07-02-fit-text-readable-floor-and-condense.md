# Fitted text has a readable floor and condenses before it shrinks

- **Status:** Accepted
- **Date:** 2026-07-02
- **Type:** Product behavior
- **Supersedes:** —
- **Superseded by:** —

## Decision

`fitText` (in `packages/views/src/viewStyles.ts`, replacing the old
`fitFontSize`) fits a line to its box with explicit **minimums and maximums on
every lever**, in this order:

1. **Fits at base size** → base font, normal spacing.
2. **Slightly too wide** → keep the base font size and *condense* the
   letter-spacing just enough to fit, capped at `MAXIMUM_CONDENSE_EM` (6%).
3. **Too wide even fully condensed** → shrink the font (holding max condense),
   but **never below `READABLE_FONT_FLOOR_PX`** (`mono` 15px, `e6` 24px). At
   the floor the line stops shrinking; the caller either wraps to a second line
   (the lonely-title case) or ellipsis-truncates.

Text never shrinks to an illegible size again. Applied in the Dashboard and
Clock/Weather views.

## Context

The previous `fitFontSize` shrank a long line down to 62% of a height-relative
base with an ellipsis as the only backstop. On the small panel a long title
shrank to ~12px — unreadable across a room.

## Why

Maintainer: text got too small to read; wants a second line or a hard stop on
overflow, plus a smarter squish with bounds on all the knobs. Condensing keeps
glyphs big (more legible than a smaller font) and is tried before shrinking; a
readable px floor guarantees legibility; wrap/ellipsis handles the remainder.

## Evidence

> "we made it so fonts get smaller when there's more text. It got so small I
> couldn't read it. At some point, use a second line or simply stop letting it
> overflow. Also, we can intelligently squish the text too. There's a point at
> which you can do it more, so we need minimums and maximums for all these
> things."

— maintainer, 2026-07-02 (verified via preview renders — long title wraps to
two lines and stays legible)
