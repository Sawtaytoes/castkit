# A panel too small for a view is a stated limit, not a layout to fix

- **Status:** Accepted
- **Date:** 2026-09-28
- **Type:** Views / panels
- **Supersedes:** —
- **Superseded by:** —

## Decision

Some panels cannot carry some views, and that is acceptable. CastKit does not
shrink a view until it technically fits a panel that cannot show its facts.
It states the limit instead, in [the panel limits page](../panel-limits.md), and
the limit is part of the view.

The limits settled here:

1. **Printer Status on a 480 px panel shows at most one printer.** That covers
   the round Porthole (480x480) and the Workbench (480x320). Two or three
   cards do not fit; the round mask cuts the outer cards and the text is cut
   short. The compact row layout for five or more printers
   ([in flight](../printer-status-view.md)) may be the arrangement a small panel
   shifts to, but no layout makes three full cards readable at 480 px.
2. **Photo Frame is not recommended on a round panel.** A rectangular photo
   leaves bands inside the circle. The fix is an option to zoom the photo until
   it fills the circle, and the admin panel recommends against the view on
   that panel rather than refusing it — a round panel can still have a use for
   it, such as a signed-in person's avatar.

A limit is written per view and per panel property (size, shape), never per
device id, like every other view rule here.

## Context

A survey of all 114 CastKit stories on 2026-09-28 found Printer Status unreadable
on the Porthole and Workbench panels, and Photo Frame letterboxed inside the
Porthole's circle. The question was whether to redesign both for those panels.

## Why

- **A small panel cannot show more facts by drawing them smaller.** Three
  printer cards at 480 px are three unreadable cards, not three cards.
- **A stated limit is findable; a cramped layout is not.** Someone choosing a
  view for a panel needs to learn the limit before the view reaches the glass.
- **Recommend, do not forbid, where a use exists.** A round Photo Frame is a
  poor slideshow and a reasonable avatar.

## Evidence

Owner, T3 Code chat `t3code-8e3a5cfc`, 2026-09-28, answering "Printer Status on
the round panel and the small workbench panel cannot fit three cards":

> That's fine. There's a new 5+ printer view that we might need to shift to on
> those, but still, those screens simply can't show this info. Maybe 1 printer
> per device, but no more. And that's fine. Some devices are limited. We just
> need to note those restrictions in CastKit.

On the Photo Frame bands on the round panel:

> Yep. It's limited. It's not really gonna work for that panel. You'd need to
> zoom it in to avoid that stuff, and we can make that an option and also
> recommend against using that view on it.
>
> It's possible you wanna use it for showing a logged-in user's avatar or
> something. Who knows.
