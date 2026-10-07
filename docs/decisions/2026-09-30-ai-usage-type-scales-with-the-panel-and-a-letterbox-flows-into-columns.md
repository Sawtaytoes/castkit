# AI Usage type scales with the panel and a letterbox flows into columns

- **Status:** Accepted
- **Date:** 2026-09-30
- **Type:** View behavior
- **Supersedes:** —
- **Superseded by:** —

## Decision

The AI Usage view draws its type at a **scale taken from the panel's content
height**: 1 up to 280 px, then height over 280, capped at 2. Every length in
the view's stylesheet is a base number multiplied by that one variable, which
the view sets after measuring the panel.

A panel wider than it is tall **flows its sections into columns**: one per 1.1
of width over height, at most three, held to what the width can carry at the
current type size. Sections never split across columns. One that does not
wholly fit moves to the next column, so a trimmed section only ever appears in
the last column with any room.

The row budget and the stylesheet share the same three base heights. That is a
contract, not a convention.

## Context

The first two versions drew every length at a fixed pixel size. On the 250 x
122 pHAT that was right. On the 1360 x 480 Waveshare 10.85" the same 15 px
label is unreadable from a desk chair, and on a 1200 px panel across a room it
is a line. The owner, shown four candidate layouts on four panels:

> I think they're all good in their own way depending on the screen size. We
> should really raise up the font size though, so you can read it easier at a
> distance.

Raising the type on its own makes the letterbox worse, not better. The
shipped one-column layout already ran out of height after three providers on
1360 x 480 with two thirds of the glass empty; at 1.5x it holds two. The
columns are the cost of the type, not a separate choice.

## Why

A panel is read at the distance it is installed, and that distance rises with
the panel. The pHAT sits at arm's length; the 10.85" sits across a desk; the
13.3" across a room. One fixed type size cannot serve all three, and the
panel's own height is the fact that tracks the distance.

The column count follows the aspect and is then capped by the width because
the two disagree on the pHAT: it is as wide for its height as the letterbox
and cannot carry two columns of 15 px labels. Width wins, because a column
too narrow for a label is not a column.

The scale is a variable the view sets and not a `cqi` `clamp()` the
stylesheet resolves on its own, because the budget is arithmetic in the view.
A number CSS computes is a number the view cannot read back. One measured
height, two readers, one scale.

## Evidence

Owner, 2026-09-30, in the CastKit AI Usage thread, quoted above.

On the 1360 x 480 monochrome render with the Storybook fixture: before, one
column at scale 1, three providers and "2 more limits"; after, three columns
at 1.54x, all five providers, nothing hidden. Both images are in
`docs/images/2026-09-30-ai-usage-type-scale-*.png`.

Tests: `packages/slatecast/src/platform/aiUsageLayout.test.ts` covers the
scale, the column count including the pHAT case, and section placement;
`AiUsageView.test.tsx` renders a 1360 x 480 panel and finds three columns,
five providers and a scale above 1.5.
