# Ambient time takes the agenda distance size

Status: Accepted
Date: 2026-10-11
Type: Display presentation
Supersedes: None
Superseded by: None

## Decision

At 480×480 and larger, the Ambient and Clock views draw the time at 25vmin — 120px on a 480×480 Presto, 180px on the 720×720 square — the same distance-reading size the agenda clock took on 2026-10-08. The short landscape panel keeps its px sizes. An Ambient panel that shares a multi-panel platform grid keeps 17vmin, because vmin there measures the whole window rather than the panel.

## Context

The [agenda distance clock](2026-10-08-agenda-distance-clock-and-daily-task-drilldown.md) enlarged only the Agenda view. The four 480×480 Presto displays rest on Ambient, whose time stayed at 17vmin (81.6px) — smaller than the agenda's clock on the same glass.

## Why

Ambient exists to be read from across the room, and it has more free height than the agenda. A clock-family view whose time is a third smaller than the agenda's on the same panel reads as a regression.

## Evidence

Owner, T3 Code worktree `t3code-b04321cc`, 2026-10-11 (chat UUID unavailable):

> CastKit time display used it be much larger for the time. It's so small. Did we only fix the agenda view? The 480x480 Presto screens are so small with the time as it is

- Live Living Room Display page at 480×480 measured `.ambient-time` at 81.6px before this change.
- Captures: `packages/slatecast/src/views/AmbientLargeClock.vrt.tsx`; before and after in `docs/images/2026-10-11-ambient-large-clock/`.
- Fit assertions: `packages/slatecast/src/views/AmbientClockFit.test.tsx`.
