# Countdowns show continuous timed progress

- **Status:** Accepted
- **Date:** 2026-10-03
- **Type:** View behavior / correction
- **Supersedes:** [Scan feedback is temporary in active-only views](2026-10-03-scan-feedback-is-temporary-in-active-only-views.md), only for an accepted running countdown
- **Superseded by:** —

## Decision

An accepted running countdown shows the task, elapsed minutes and seconds, remaining minutes and seconds, and a timed progress bar. Instant displays update the numbers every second and smoothly advance the bar between updates. The producer's saved start and target determine progress; minute announcements are not refusals and never say “Not counted.” A slow display states the target duration and absolute end time instead.

A countdown remains visible in an active-only composition until its target, cancellation, or completion. Only the countdown associated with the channel's accepted start/progress scan holds this visibility, preserving reader filtering. Ordinary timed activities and daily totals still do not hold active-only scan feedback open. The server refreshes activity at the target even if the broker is quiet. Clock progress never awards points; the producer remains authoritative for completion.

## Context

The source reduced every unfamiliar outcome to a refusal. Countdown minute notifications use `session-progress` with zero points, so they appeared with a large “Not counted” heading. The retained timer already carries `startedMs`, `goalMinutes`, and `isCountdown`, but the adapter discarded the latter two fields.

## Why

The useful information during a countdown is time completed and time remaining. Keeping it current between announcements removes the need for repeated temporary results while keeping scoring entirely with the producer.

## Evidence

Owner, current T3 Code conversation, 2026-10-03 (thread identifier unavailable):

> I don't need a big "Not Counted".

> Timed progress indicator would be nice! Then we don't just have to show it every minute.

Fixture renders: [previous minute notification](../images/2026-10-03-countdown-before-480x320.png), [continuous progress at 480×320](../images/2026-10-03-countdown-480x320.png), [480×480](../images/2026-10-03-countdown-480x480.png).
