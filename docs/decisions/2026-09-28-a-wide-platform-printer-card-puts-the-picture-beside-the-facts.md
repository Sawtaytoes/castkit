# A wide platform printer card puts the picture beside the facts

- **Status:** Accepted
- **Date:** 2026-09-28
- **Type:** layout
- **Supersedes:** —
- **Superseded by:** [Priority-based section fit](2026-09-30-printer-layouts-fit-sections-in-priority-order.md)

## Decision

On the platform printers face, a card **900 px or wider** lays out as two
columns: the camera frame or plate cover on the left at 40% of the card, the
name, job, band, metrics and filament row on the right, centered on the
picture's height. Under 900 px the card stays stacked, picture over facts.

The breakpoint is the **card's** width, never the window's. Two cards on a
1280 px view are about 630 px each and stay stacked; one card on that view, or
two on a 2560 px monitor, go side by side. The card is a CSS container and a
fixed two-column grid; its children query it and move, because a container
query cannot read the element it is declared on.

## Context

The owner opened the "3D Printers and Cameras" view on a 2560 px monitor with
one printer active. The card was a postage-stamp camera frame centered over a
band, a metric row and a filament row that each ran the panel's full width, with
empty panel above and below. His words: "When it's super wide like this, the
video should be on the left side. We should figure out a good breakpoint for
it."

## Why

- Side by side, the eye reads the picture and the facts as one row instead of
  travelling down through empty panel to reach the name.
- 900 px is where the split pays: 40% leaves the picture about 360 px, close to
  the plate on the workbench panel, and the facts keep 540 px, enough for the
  band, the two metrics and the filament row at their stacked sizes without
  wrapping. Under that, a two-column card squeezes both halves.
- A window breakpoint would be wrong in both directions: a wide window with
  three cards has narrow cards, and a half-width window with one card has a
  wide one.

## Evidence

- Owner, 2026-09-28, with the screenshot of the single-printer view at 2560 px
  (chat `a86efc56-0324-449a-bdf7-b936102abb20`).
- Story `Views/Composed Dashboard › PrintersWide` at 2560 px shows the split;
  the same story at 1280 px stacks. Before and after in
  `docs/images/platform-printers-wide-{before,after}.png`.
