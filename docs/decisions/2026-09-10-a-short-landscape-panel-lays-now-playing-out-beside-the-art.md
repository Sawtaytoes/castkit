# A short landscape panel lays Now Playing out beside the art

- **Status:** Accepted
- **Date:** 2026-09-10
- **Type:** View layout
- **Supersedes:** —
- **Superseded by:** —

## Decision

On a panel that is wider than it is tall by a clear margin and short — the media
query is `(min-aspect-ratio: 5/4) and (max-height: 400px)`, which today is only the
480×320 WT32 workbench panel — the Now Playing view is a grid, not the centred
column: the art fills the height at the left (232 px), the title, artist, album and
seek bar sit beside it, and the volume row runs across the bottom. The transport
row is not rendered on that panel: the art is the transport (a tap is play/pause, a
drag past a third of its width is next/previous, per
[the artwork is a control](2026-09-10-the-artwork-is-a-control-not-a-picture.md)).
Type on that panel is fixed pixels — title 27, artist 21, album 16, seek times 16,
swipe pill 16 — not `vmin`. The square and round panels keep the `vmin` column.

## Context

Slatecast sizes everything in `vmin`. On the 720×720 square that gives a 36 px
title; on the 480×320 WT32 the same rules gave 16 px, an 11.5 px artist line and 8 px
seek times, on glass where 1 px is 0.156 mm. The owner could not read the panel from
the workbench and barely up close, and the panel's low-contrast glass makes small
grey type worse. A 4x render was considered and rejected: the panel still has
480×320 pixels, and the renderer already screenshots at scale 1 with grayscale
antialiasing (measured: text edges sit on the grey ramp, residual 0.56 levels).

Three candidates were served at true size on 2026-09-10: A (art left, text beside,
volume across the bottom, transport on the art), B (art at full height, one 160 px
column), C (the current column scaled). The owner chose A. Candidates:
[comparison](../previews/2026-09-10-now-playing-short-panel.html),
[A](../previews/2026-09-10-now-playing-short-panel-a.png),
[B](../previews/2026-09-10-now-playing-short-panel-b.png),
[C](../previews/2026-09-10-now-playing-short-panel-c.png); result:
[480×320](../images/2026-09-11-short-panel-now-playing-after-2d-printer-workbench-480x320.png),
[720×720 unchanged in layout](../images/2026-09-11-short-panel-now-playing-after-3d-printers-workbench-720x720.png).

## Why

- **Larger type needs the space the transport row took.** Three buttons under a
  picture were the difference between a 16 px and a 27 px title on a 320 px tall
  panel, and the art already carries those commands.
- **Beside, not below.** The 2" ePaper now-playing card already puts the art beside
  the text; the owner asked for the same shape here, and it uses the panel's width
  instead of stacking in its height.
- **Keyed on the panel's numbers, not its name.** A query on aspect ratio and height
  cannot match the square or the porthole by accident, and a future short panel
  gets the layout for free.

## Evidence

- Owner, 2026-09-10: "Maybe at 480x320, instead of putting the controls below the
  album art, they're next to it like on the 2\" Inky pHAT screen. Use as much screen
  as possible." Then: "Option A for music."
- Measured sizes: `agentic/docs/runbooks/rip-deck-wt32-display.md`.
- T3 Code chat `0adde1d5-e233-4c59-bf0f-4fed81fba6d7`.
