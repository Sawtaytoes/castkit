# Agenda and Ambient share one clock face

Status: Accepted
Date: 2026-10-11
Type: Display presentation
Supersedes: [Ambient time takes the agenda distance size](2026-10-11-ambient-time-takes-the-agenda-distance-size.md) for the Ambient and Clock time size only.
Superseded by: None

## Decision

Agenda, Ambient and Clock draw the time through one component, `ClockReading`: the digits, then a quarter-size a/p on their baseline. An agenda with no upcoming events draws the Ambient face itself — time, date and weather — not an agenda header with a "No upcoming events" line; this holds on the short landscape panel too, where it draws the short Ambient face. With events, the agenda keeps its 120px clock at 480×480 so its complete rows still fit; the short landscape agenda keeps its one-row header.

At 480×480 and larger the Ambient and Clock time is 34vmin — 163px on a 480×480 Presto — the largest size at which the widest reading, "12:59" plus its suffix, stays inside 90% of the narrower side (429px of 480, measured in Outfit). A panel inside a shared platform grid keeps 17vmin.

## Context

Earlier the same day the Ambient time was raised to the agenda's 120px. That left two faces drawing the same clock, date and weather with different markup, and 480×480 still showed a lot of empty glass around the time.

## Why

The agenda is the ambient screen with rows under it. One component means a size or format decision lands on every clock-family face at once, and a day with no events looks like the screen the owner already reads rather than an apology. The time size is set by the widest string, not by taste, so it cannot overflow at 12:59.

## Evidence

Owner, T3 Code worktree `t3code-b04321cc`, 2026-10-11 (chat UUID unavailable), quoting the reply that only the agenda had been enlarged:

> The agenda and time/date/weather views should be built on the same tech with the exception that the agenda might have to push out the time depending on the screen size (like the optical ripper screen being too short). And when no agenda, it's just the regular clock/date/weather screen anyway.

> Do we wanna make the time even bigger? We have a lot more screen even if it's 12:59 or something that takes up more screen real estate.

- Fit assertions: `packages/slatecast/src/views/AmbientClockFit.test.tsx`.
- Captures: `packages/slatecast/src/views/AmbientLargeClock.vrt.tsx` (Ambient at 480 and 720, empty agenda at 480); before and after in `docs/images/2026-10-11-one-clock-face/`.
