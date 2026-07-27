# A clockless "Agenda" view, so slow colour panels can show a calendar

- **Status:** Accepted
- **Date:** 2026-07-27
- **Type:** Product behavior
- **Supersedes:** —
- **Superseded by:** —

## Decision

A ninth view, **`Agenda`**, joins `VIEW_NAMES`. It renders the day's upcoming
events with **no time of day**, and is deliberately **absent from
`CLOCK_BEARING_VIEW_NAMES`** — so the per-minute `clockTicker` never touches it.
It repaints only when Home Assistant pushes new agenda data, or when the view is
selected.

`Clock (Agenda)` is unchanged and stays clock-bearing.

Event selection (drop timed events that have already started, keep all-day
events for their whole day, slice to the panel's budget) is now a **single
shared helper** used by both agenda views.

## Context

`Clock (Agenda)` shows a clock, so it must be re-pushed every minute to stay
honest. On the 800×480 E6 Impression a **full refresh takes ~28 seconds**, so a
per-minute repaint is a panel that is essentially always flashing — the exact
finding that produced the home-displays decision barring clock views from the
kitchen panel entirely.

That left a gap: the kitchen could have photos or now-playing, but **no way to
show an appointment**, because the only agenda view carried a clock.

## Why

- **The clock, not the agenda, was the problem.** Agenda data changes a handful
  of times a day; a clock changes every minute. Separating them makes the render
  valid until the data actually changes, which is what a slow panel needs.
- **A new view beats making `time` optional on `ClockAgendaView`.** That
  component's whole layout is anchored on the fitted time — `fittedTime` drives
  the proportions, and the compact pHAT branch pins to top *because* the time is
  the anchor. Threading an absent time through it would complicate a component
  that four panels already depend on, to serve a case with different priorities.
- **Events deserve the panel when they are the content.** In `Clock (Agenda)`
  the events are a footnote under a big clock. Here they are the point, so the
  date takes the header role and the rows are sized to read across a room.
- **Shared event selection prevents divergence.** Two views answering "what
  counts as upcoming?" differently would be a subtle, long-lived bug; the filter
  lives in one place.
- **`emptyText` rather than a blank panel.** A device parked on this view on a
  free day should say so ("Nothing else today"), not look broken.

## Consequences

- Adding to `VIEW_NAMES` widens the `View` select on **every** device, including
  browser-mode Slatecast panels. The name is generic enough to be meaningful
  there, and browser devices render from the same registry.
- The OpenAPI `SetViewRequest` enum grows, which is a backwards-compatible
  addition.

## Evidence

> "I wanna disable the kitchen screen showing the currently-playing media. Just
> have it stay on pictures unless there's a todo item. It should change 1-hour
> before to show the calendar for 5-10 minutes right? If it's 5 min, make it 10."

> (chose "Add a non-clock Agenda view" over reusing `Clock (Agenda)` and
> accepting ~10 back-to-back 28-second refreshes)

— user, this chat (2026-07-26).
