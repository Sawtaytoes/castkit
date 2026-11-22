# Printer Status's four-plus layouts land and name the printers they hide

- **Status:** Accepted
- **Date:** 2026-11-22
- **Type:** View / layout
- **Supersedes:** —
- **Superseded by:** —
- **Related:** [Printer Status adds layouts from four](2026-09-28-printer-status-adds-layouts-from-four.md), which this builds; [Camera remains primary; the plate preview is secondary](2026-10-07-camera-remains-primary-and-plate-preview-is-secondary.md), which said that it did not approve these layouts by itself; [A repeating list draws only the rows that finish](2026-09-14-an-agenda-view-draws-only-the-rows-that-finish-on-the-panel.md).

## Decision

Build the four-or-more Printer Status layouts on the current card. Four
printers use a 2×2 grid. Five or more use one compact row per printer. The
picture stays first in every arrangement, before the facts, as it is for one to
three printers.

Three defects in the first version are fixed, and the fixes are part of the
design:

1. **A row gives each part its own column.** The row reads left to right:
   picture, name and job, the Layer, Finishes and Filament blocks, the band, and
   then Pause and Stop. The first version stacked the band over the buttons in a
   row too short for both, so from seven rows the band sat on Pause and Stop.
2. **Filament keeps room for its count.** In the 2×2 grid, Filament keeps its
   full-width box. In a row, the count moves up beside the `Filament` label and
   reads `2 filaments ›`; the dialog the box opens still lists every slot. The
   first version put Filament in a third of the facts' width, and
   `2 filaments · Details ›` ran out of the first card's box.
3. **A printer that does not fit is named, never dropped in silence.** The view
   measures its card area and draws only the rows that finish on the glass, as
   before. When a printer does not fit, a 36 px strip under the last row says
   `+1 more printer` (or `+N more printers`) and names each hidden printer with
   its number and its percentage or state, tinted like its card. A hidden failed
   print still reads as a failure. The strip costs 42 px and not a whole row, so
   the 1280×720 panel still draws nine rows above it. The chips that fit are a
   glance, and a tap on the strip lists every hidden printer, because a narrow
   panel has room for only one or two chips.

The 2×2 grid and the rows have no room to open a job name in place. A tap on
the job name lists that printer's whole job name and whole fault in a dialog
instead. In a row, a fault takes the job name's line inside the same button.

The count picks the arrangement. The panel only decides whether it can hold it:
four printers use rows instead of the grid when the card area is under 624 px
tall or 600 px wide, and a narrow panel folds a row's columns away in a fixed
order. A test checks both sides of each cutoff. On the narrowest rows, Pause and Stop become Lucide icons with their
words kept for assistive tech, as the 2026-09-28 record asked. The state chip
and the percentage never fold away.

The stories and pictures for four printers and up name every printer
`Printer N`. The earlier stories' names are real printers' names.

## Context

On 2026-09-28 the owner approved the four-up grid and the five-or-more rows.
They never landed, because they were bundled in #104 with a rejected change to
the printer cameras. #361 held them as a draft while the owner decided whether
they were still wanted.

On 2026-11-22 the owner reviewed a preview of #361 with four, five, six, nine and
ten printers, approved the layouts, and asked for the defects in it to be fixed:
the band over the buttons from seven rows, the filament count past its box, and
a tenth printer missing with nothing on the glass to say so.

## Why

- **A row has no second line to spare.** A 64 px row holds one 48 px button
  height. Anything stacked on the buttons overlaps them, so the band gets a
  column of its own.
- **A wall panel cannot scroll.** Without the strip, a tenth printer was simply
  absent, and nobody at the bench could tell. The strip keeps the rule that a
  row is drawn whole or not at all, and it still says what is missing.
- **The strip is smaller than a row.** A full row would hide a ninth printer to
  report a tenth.
- **A count is not enough on its own.** An independent review found the strip
  saying `+7 more printers` on a 480 px panel while it showed two names. The
  tap makes every hidden name reachable.

## Evidence

Owner, T3 Code chat `t3code-1f7ffedb`, 2026-11-22, after looking at the #361
preview:

> yes, this is good. Get another root level agent to work on it

> we need to fix those bugs.
