# A busy overview keeps each child's name, color, and goal

- **Status:** Accepted
- **Date:** 2026-10-13
- **Type:** View behavior / owner preference
- **Supersedes:** None. Narrows the strip introduced with `isPersistentSummary` (#246).
- **Superseded by:** None

## Decision

When a composed overview has busy work (a printer or a rip) and Kids Points
shrinks to its persistent summary strip, each child keeps:

1. the **full name**, not an initial;
2. an **identity stripe** in the child's color at the start of its cell, and a
   goal bar filled in the same color;
3. the total **next to its own name**, followed by `/ goal` when the cell is at
   least 180 px wide.

The cells are separated by the stripes, so a total never reads as belonging to
the next child. A cell under 130 px stacks the name over the total. Only a cell
under 56 px drops to the initial alone.

The initial-only, color-free form is the watch form. It is for extreme cases: a
watch face, or a cell too small for a name. A panel with room for more must not
fall back to it.

## Context

The strip from #246 drew one initial and one total per child, spaced out with
`justify-content: space-between`, and dropped the identity color except as an
underline on a running child. On the 1024 x 600 desk monitor every number sat
beside the next child's letter, so `X 100 D 0 M 0` read as three wrong pairs.
The strip had ample width for names, colors, and goal bars.

## Why

The room reads the strip at a glance. Color is the fastest identity cue, and
the household's colors match the printed cards. A name beside its own total
removes the pairing ambiguity. The color stays a stripe and a bar fill, never
text, per the existing Kids Points rule.

## Evidence

Owner, T3 Code worktree `t3code-e719132a`, 2026-10-13, with a photo of the desk
monitor showing the initials-only strip:

> did we really not have room for more? Also, this was hard to tell who was who
> because the colors were missing and the other kids' number was next to the
> letter. We should fix that in this view. The "watch" view needs to be for
> extreme situations
