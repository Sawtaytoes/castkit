# A photo beside the agenda is a real split, never a band over the photo

- **Status:** Accepted
- **Date:** 2026-09-14
- **Type:** Product behavior
- **Supersedes:** —
- **Superseded by:** —

## Decision

A view that shows a photo next to the time and the agenda is a **hard
two-column split**. The photo occupies its own column and stops at the split.

**A full-bleed photo with the text on a band over it is rejected.** It was drawn
as one of five candidates in
[docs/previews/2026-09-13-photo-beside-agenda.html](../previews/2026-09-13-photo-beside-agenda.html)
and the owner turned it down on sight. Do not re-propose it, and do not
re-introduce it as a "setting" on a split view.

Two things remain **open** and are not settled by this record:

1. **The rail's background.** Paper (`surface.base`) or ink (`content.primary`)
   with reversed text. Both are on trial on the real Kitchen Counter panel.
2. **The split ratio.** See the measurement below — it is a finding, not yet a
   decision.

When the split view is built, its row budget comes from `countRowsThatFit` in
`viewStyles.ts`, the same helper `ClockAgendaView` and `AgendaView` use
([2026-09-14-an-agenda-view-draws-only-the-rows-that-finish-on-the-panel.md](2026-09-14-an-agenda-view-draws-only-the-rows-that-finish-on-the-panel.md)).
The counts below were measured with an equivalent trim in the preview builder
and agree with that rule: a rail is just a narrower column, so the same
"never start a row you cannot finish" applies, and the narrower the rail the
sooner it binds.

## Context

The owner asked what a side-by-side would look like: an image on one side, the
time and agenda on the other. Five layouts were drawn at real panel sizes. He
picked the plain split and the band, then looked again and dropped the band.

The split was then built for a real 800 x 480 panel with a mat of
36 / 63 / 28 / 59, so 678 x 416 visible, using a live calendar and a photo
fetched through the same Immich path `Photo Frame (Duo)` uses, and published to
that panel's retained image topic. That is where the ratio finding came from.

**The measurement, on a six-event day:**

| Split (photo / rail) | Rail content width | Events that fit | Row shape |
| --- | --- | --- | --- |
| 62 / 38 | 239 px | **2 of 6** | stacked, time above summary |
| 50 / 50 | 320 px | **6 of 6** | beside, time in its own column |

The Spectra 6 readable floor is 24 px
(`viewStyles.READABLE_FONT_FLOOR_PX.e6`). Below about 11 times the row's font
size, the time cannot sit beside the summary, so the row stacks and each event
costs three lines instead of one. A 239 px rail is on the wrong side of that
line. At 50 / 50 the rows go beside and every event fits, at the cost of
truncating the longer summaries.

## Why

The band looked better in isolation and is worse to live with. Text over a
photograph has no contrast guarantee: the photo changes every rotation, so a
band that reads well against one picture reads badly against the next. A split
gives the text a background the view controls.

The ratio finding matters because real event titles are long. The titles in the
measured day ran to 31 and 41 characters, where the fixtures in the Storybook
stories are 12 to 16. A layout tuned on short placeholder text would have
shipped the 62 / 38 split and shown two events out of six.

## Evidence

> "I like option 1 and 3. I'd have to see them on the actual screen to be sure.
> Can we try that in the kitchen where the agenda shows?"

— owner, 2026-09-14

> "I don't like the full-bleed overlay by the way. I'm wanting a side-by-side,
> but I'm not sure if I want white or black backgroudn"

— owner, 2026-09-14, rejecting the band and naming the one open question

Counts measured by the preview builder, which drops the least-imminent events
rather than overflowing the glass, and confirmed on the panel itself: the
Kitchen receiver logged `[draw] 542699B pushed in 28.9s`, matching the
published frame byte for byte.
