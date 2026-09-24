# The band carries the time left, and Remaining leaves the metric row

- **Status:** Accepted
- **Date:** 2026-09-24
- **Type:** View / layout
- **Supersedes:** [The print state is a chip beside the controls](2026-09-24-the-print-state-is-a-chip-beside-the-controls.md), for the band's left side only. The chip, its placement beside the controls, and its intent-driven color all stand.
- **Superseded by:** —

## Decision

The progress band carries the **percentage at its right and the time left at its
left** — `2h 08m left`.

**`Remaining` leaves the metric row.** The row is `Layer` and `Finishes`, plus
`Filament` when the printer reported one, so it is two blocks wide rather than
three.

A paused printer renders **nothing** at the band's left, not an em dash.

## Context

Emptying the band was the previous decision, taken the same day. It fixed the
defect it was aimed at — a 580 px band holding two short things at opposite ends
— by removing one of them.

Shown the result in the whole card rather than as a bare band, the owner went
back to wanting something on the left. He had only ever seen the alternative as
an isolated band, which flatters it: a bare band is judged against an empty
rectangle with no card around it.

Three arrangements were served at 1 : 1 in the full card, at two printers and at
one: the empty band as deployed, the state word returned to the band, and this
one. He picked this one.

## Why

- **The word was never the right thing to put there.** Returning it would say
  the state twice, because the chip already says it. The gap wanted a fact the
  card did not already show in that place.
- **The time left is what the panel is for.** It stands at the bench. A person
  walks up to know how long, and that number was in the smallest type on the
  card, in a box below.
- **Nothing is said twice, and that is load-bearing.** The metric row gives up
  `Remaining` in the same change. A band that repeated a box below it would be
  the padding this view exists to avoid.
- **A paused printer shows nothing rather than an em dash.** The metric row uses
  an em dash because a grid must hold its cell open. The band is not a grid, so
  an absent value can simply be absent, and the chip has already said `Paused`.
- **The percentage keeps the right edge.** It is the thing read from across the
  room, and it stays in the same place whether or not a time is beside it.

## Evidence

Owner, T3 Code chat `t3code-737280df`, 2026-09-24. After the empty band was
deployed:

> I'm honestly thinking C might be better now actually.

Then, from the three arrangements shown in the full card:

> G

⚠️ **The row is `justify-content: flex-end` with an auto margin on the time,
never `space-between`.** A paused card renders one child, and `space-between`
shoves the percentage to the left edge and into the colored fill. This was found
in the preview and is pinned by the paused test, which asserts that the band
holds no time element at all.

Verified in `Views/Printer Status` at the `Pi Touch 2 (1280x720 landscape,
touch)` profile, and on the deployed panel.
