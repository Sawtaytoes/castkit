# An agenda view draws only the rows that finish on the panel

- **Status:** Accepted
- **Date:** 2026-09-14
- **Type:** Product behavior
- **Supersedes:** —
- **Superseded by:** —

## Decision

**An agenda view never starts a row it cannot finish.** `ClockAgendaView` and
`AgendaView` add up what their own header costs, divide the height that is left
by one row's height, and draw exactly that many events. The rest are dropped.

Three parts make that work:

1. **The view decides the count, not the server.** `renderViewElement` hands
   over up to `MAX_AGENDA_EVENTS` (8) and no longer slices per panel size. That
   number is a payload bound. Only the view knows its own font sizes and gaps,
   so only the view can say where the glass runs out of room.
2. **The gaps tighten when events are on the panel.** `ClockAgendaView` scales
   every vertical gap by `AGENDA_GAP_SCALE` (0.5) while it is carrying an
   agenda. With no events it keeps the full spacing, because on a free day it
   renders as `ClockWeatherView` and must still look like it.
3. **The dropped rows are the least imminent ones**, and they come back on a
   later repaint as the events above them start and leave the list. Nothing is
   lost; it arrives later.

A row's cost is its leading gap plus `fontSize × lineHeight`, rounded up.
`countRowsThatFit` in `viewStyles.ts` does the division, and both views hold
back a sliver of the panel (2% of the height) so the last row never ends on the
final pixel row.

**"Nothing else today" still means a genuinely free day.** A panel too short to
finish one row has events — it just cannot draw them — so it stays silent
rather than claiming the day is clear.

## Context

The 960x540 M5Paper was handed four events and had room for two. The column is
centered, so the overflow did not fall off the bottom — it went off **both**
edges at once, cutting the top off "12:58 AM" and the bottom off the third
event. The clock is the anchor of this view, and it was the first thing the
panel threw away.

The numbers behind that: at full spacing the time, date, weather row and
"TODAY" heading cost 427 of the 540 available pixels, which leaves room for
two 50px rows. The server was sending four.

The 250x122 pHAT had the same fault in a milder form. It pins its column to the
top *because* a centered one overflowed both edges, so its fourth row was cut in
half by the bottom edge instead. The clockless `AgendaView` cut its fourth row
on that panel too.

## Why

- **A panel has no scrollbar and no second chance.** On the web a too-long list
  scrolls. On glass it is simply sawn off, and an ePaper panel holds that
  frame for as long as the next repaint takes.
- **Whitespace is what should give, not content.** The airy rhythm this view
  inherits reads well with three blocks on the glass. With an agenda under them
  the gaps are the cheapest thing to spend, and halving them buys a whole extra
  event row on the M5Paper.
- **The view is the only honest place for the arithmetic.** A server-side count
  per panel size is a guess that drifts the moment a font size or a gap
  changes — which is exactly how a cap of four ended up on a panel that held
  two.
- **Showing fewer, whole rows beats showing more, broken ones.** The events a
  reader needs are the imminent ones, and those are at the top.

## Evidence

> "CastKit agenda view on the M5Paper is coming off the screen. If we can't fit
> more agenda items, then we should just display the ones we have. If there are
> more, we can display them later when that time comes up. That way, we're not
> pushing stuff off the screen, and the most-important upcoming agenta items
> remain."

> "In this case, we could shrink the padding to fit a few more things on the
> screen. There's a lot of padding already that's normally fine, but not for the
> agenda view."

— owner, 2026-09-14, with a photograph of the M5Paper showing the clipped clock
and the cut third event.

Verified with `yarn tsx scripts/preview-views.ts` at all three panel sizes
before and after. The M5Paper goes from two whole rows plus a cut third to three
whole rows; the pHAT from three plus a cut fourth to three; the clockless
`AgendaView` keeps its five rows on the Impression and loses its cut fourth on
the pHAT. `packages/views/src/agendaRowFit.test.ts` pins those counts.
