# A tab draws a dot only for a view that can be idle

- **Status:** Accepted
- **Date:** 2026-09-28
- **Type:** UI / composition model
- **Supersedes:** in part — [An active-only view shows only what is going on](2026-09-28-an-active-only-view-shows-only-what-is-going-on.md) (the "always active" reading of contracts with no idle state, for the tab dot only)
- **Superseded by:** —

## Decision

A contract with no idle state (photos, agenda, clock, weather, entities, a
plugin's own contract) answers **no activity at all** rather than "active".
Two consequences:

1. **An active-only view still draws such a panel.** `panelActivity` leaves the
   panel out, and the client draws a panel it has no answer for. Nothing
   changes on the glass.
2. **A tab draws a dot only when a panel that CAN be idle is active.** A view
   whose panels are all photos and agenda has `isActive: undefined`, so its tab
   has no dot. A view with a rip deck beside entity sections dots only while a
   rip runs.

## Context

The first live Working screen (castkit #121) put a dot on `Photos`, `Agenda
and Photos` and the household `Rip-Deck` tab at all times, while nothing was
going on in any of them, because every contract without an idle state read as
"active". A dot that is always on says nothing.

## Why

"The photos are still there" is not something going on. The dot exists so a
glance at the tab row answers "is anything happening"; a permanent dot is
noise that hides the real ones.

## Evidence

Live `/screen/working` snapshot, 2026-09-28: `availableViews` reported
`rip-deck`, `photos` and `agenda-photos` active with no rip, no print and no
music. `viewActivity.test.ts`: a view of a photo frame and a clock has no
activity answer.
