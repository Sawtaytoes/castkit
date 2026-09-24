# Printer Status gives each active printer a column

- **Status:** Accepted
- **Date:** 2026-09-23
- **Type:** View / layout
- **Supersedes:** —
- **Superseded by:** [The print state is a chip beside the controls](2026-09-24-the-print-state-is-a-chip-beside-the-controls.md), for the contents of the progress band only. The column rule, the count-driven arrangement, the unboxed plate picture and the job-name control all stand.

## Decision

Printer Status draws one column per active printer, and only for printers whose
print status is `prepare`, `running` or `pause`. The count decides the shape:

- **One printer** puts the picture on the left and the facts in a column on the
  right, and grows the type to fill the panel.
- **Two or three printers** stack the picture above the facts in each column.
- **Four or more is not designed.** The notes for that work are in
  [the view's design note](../printer-status-view.md).

The plate picture gets no box around it. The cover is square and carries its own
dark background, so a surrounding panel letterboxes the square inside a
differently colored rectangle. That reads as a cropped picture.

The job name is a control. It prints on one line with an ellipsis, opens to the
whole name on a tap, closes on a second tap, and shows the printer's own file
name on hover or keyboard focus.

## Context

Two candidates were served at the panel's true size against live data: rows
across the full width, and a column per printer. The owner chose columns. The
first column build then failed at one and two printers: a single card left the
facts spread across the full width, and the picture sat letterboxed inside a
lighter box, which the owner read as clipping.

The owner also rejected the first job-name treatment. The view had joined the
file name's parts with dashes, which left a dangling `— Matte Black` after the
part that mattered.

## Why

- **A column keeps the facts in a column.** The card is a stack of short labeled
  values. Spreading that stack across 1280 px breaks the eye's return sweep.
- **The picture is the anchor.** A card with a picture is card-shaped, so the
  grid rule applies rather than the one-column reading-surface rule.
- **The count is the only variable.** A panel does not change size. One printer
  and three printers are the same panel, so the arrangement keys on the count.

## Evidence

Owner, T3 Code chat `t3code-737280df`, 2026-09-23:

> B, but it only seems to look good with 3 printers.

> For the special 1-column mode, we could make this a side-by-side with the image
> on the left and the info on the right. That way, the info stays in a column.

> I hope it's just this example, but the images are clipping in the 2-column mode.

> You wrote " — Matte Black" after the filename, and that doesn't look very good.

> I'd also like the UI uniform. If you click the filename text, it could expand
> and collapse and even display a tooltip with the full text as well.
