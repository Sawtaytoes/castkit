# Countdowns show time left only

- **Status:** Accepted
- **Date:** 2026-10-04
- **Type:** View behavior / correction
- **Supersedes:** [Countdowns show continuous timed progress](2026-10-03-countdowns-show-continuous-timed-progress.md), only the elapsed-time metric
- **Superseded by:** —

## Decision

A live countdown shows the task, remaining minutes and seconds labeled “left”, and the advancing progress bar. Remove the elapsed “done” number, including from the accessible progress description. The saved start still determines the bar. Countdown visibility, producer scoring, and slow-display deadlines retain their established behavior.

## Context

The first countdown display showed both elapsed and remaining time. The owner narrowed the requested information after reviewing it.

## Why

Time left is the useful number during the attempt. The progress bar already conveys progress.

## Evidence

Owner, current T3 Code conversation, 2026-10-04 (thread identifier unavailable):

> Just the "left" part is fine.

Fixture renders: [480×320](../images/2026-10-04-countdown-left-480x320.png), [480×480](../images/2026-10-04-countdown-left-480x480.png).
