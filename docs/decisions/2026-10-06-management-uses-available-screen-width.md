# Management uses available screen width

- **Status:** Accepted
- **Date:** 2026-10-06
- **Type:** Management layout
- **Supersedes:** —
- **Superseded by:** —

## Decision

Authenticated management pages use Charcuterie Shell's full content width.
Card collections use Charcuterie AdaptiveGrid to add columns when their
content would otherwise scroll, within the available width. The plugin
library supports up to six columns with a readable minimum card width.
Sign-in retains its bounded form width.

## Context

The plugin library was limited to two columns inside an xl-width shell,
leaving substantial empty space on wide monitors while cards continued
below the fold. Sources and channels were also excluded from the shell's
full-width management routes.

## Why

The shared shell and adaptive grid already provide the responsive behavior.
Use those capabilities consistently rather than adding fixed breakpoint
grids or independent page width caps.

## Evidence

Owner, CastKit management layout thread, 2026-10-06 (chat ID unavailable):

> Please use more of the screen. I say this a lot. We need to use the Charcuterie features that utilize my screen width.
