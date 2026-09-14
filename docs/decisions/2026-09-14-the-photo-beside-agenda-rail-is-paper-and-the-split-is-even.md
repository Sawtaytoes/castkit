# The photo-beside-agenda rail is paper, and the split is even

- **Status:** Accepted
- **Date:** 2026-09-14
- **Type:** Product behavior
- **Supersedes:** —
- **Superseded by:** —
- **Refines:** [2026-09-14-a-photo-beside-the-agenda-is-a-real-split-never-a-band-over-the-photo.md](2026-09-14-a-photo-beside-the-agenda-is-a-real-split-never-a-band-over-the-photo.md) — closes the first of the two questions that record left open

## Decision

The photo-beside-agenda layout's rail is **paper**, with `content.primary` text
and the **accent ink on the event times**. The ink rail with reversed text is
rejected.

That is the specific case of a rule that now binds every ePaper view:
[2026-09-14-a-reflective-panels-chrome-is-dark-on-paper-and-the-accent-ink-carries-the-emphasis.md](2026-09-14-a-reflective-panels-chrome-is-dark-on-paper-and-the-accent-ink-carries-the-emphasis.md).
Read that one first; this record only fixes the values for this layout.

**The split is even — half photo, half rail — measured on the visible window**
the mat leaves, with the photo bleeding to the panel edge on its own side. The
62 / 38 split that was drawn first is rejected for a landscape panel this size.

On an 800 x 480 panel behind a 36 / 63 / 28 / 59 mat, that resolves to:

| | Value |
| --- | --- |
| Visible window | 678 x 416 |
| Photo column | 398 px wide, full panel height, bleeding left |
| Rail | 402 px, of which 320 px is content |
| Rail padding | 19 px inboard, the mat's own inset outboard |
| Row shape | time beside summary, time in its own column |

## Context

Two frames were built for the real Kitchen Counter panel and published to it in
turn — same photo, same calendar, same split, background the only variable — and
the owner read both on the glass. He chose paper.

The ratio was settled earlier in the same exchange and on the same panel. A
six-event day was rendered at both splits:

| Split (photo / rail) | Rail content | Events that fit | Row shape |
| --- | --- | --- | --- |
| 62 / 38 | 239 px | 2 of 6 | stacked, time above summary |
| 50 / 50 | 320 px | 6 of 6 | beside |

Below roughly 11 times a row's font size the time cannot sit beside the summary,
so the row stacks and costs three lines instead of one. Against the 24 px
Spectra 6 readable floor, a 239 px rail is on the wrong side of that. Both
frames the owner approved were 50 / 50.

⚠️ **The owner approved the ratio by accepting the frames, not by ruling on it.**
He was told the ratio had changed and why, and did not contest it. If a later
panel or a longer calendar makes an even split wrong, that is a new measurement
rather than a reversal of a considered decision.

## Why

Paper is the general rule; see the linked record for the reasoning about
reflectance and about the accent.

The even split is a consequence of real event titles rather than of taste. The
Storybook agenda fixtures run 12 to 16 characters; the measured day ran to 41. A
rail sized on fixture text fits, and the same rail on a real household calendar
shows a third of the day.

## Evidence

> "Paper is very readable!"

> "Let's go with paper, not ink and document these decisions"

— owner, 2026-09-14, after reading both frames on the Kitchen Counter panel

Row counts measured by the preview builder, which drops the least-imminent
events rather than overflowing the glass. When the view is built, its row budget
comes from `countRowsThatFit` in `viewStyles.ts` rather than that ad-hoc trim
([2026-09-14-an-agenda-view-draws-only-the-rows-that-finish-on-the-panel.md](2026-09-14-an-agenda-view-draws-only-the-rows-that-finish-on-the-panel.md)).

**Not yet built.** This records the settled appearance. No view name is claimed
and nothing is added to the vocabulary by this record.
