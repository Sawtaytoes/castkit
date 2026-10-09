# Task totals before scan history

Status: Accepted
Date: 2026-10-08
Type: Display presentation and interaction
Supersedes: [Daily task list presentation](2026-10-08-agenda-distance-clock-and-daily-task-drilldown.md) only; agenda and scan delivery behavior remain applicable.
Superseded by: None

## Decision

Opening a child shows one row per task name with recorded minutes, net earned points and scan count. Selecting a task opens only its scans, newest first, including timestamps and recorded session lengths. Back returns to the task summary, then to the children. The same controls work on interactive browser and image deliveries.

Use the producer's current local-day snapshot, retaining repeated and zero-point entries in the drilldown. Totals update from corrected retained snapshots. Running activity shares its task's summary row but stays explicitly in progress; elapsed unfinished time is not added to recorded completed minutes. Keep taps distinct from list drags and publish stable frame interaction targets for each task and navigation level.

## Context

A repeated timed task filled the child detail with individual scans, forcing extensive scrolling to find its final total on an image-streaming display.

## Why

One task row exposes the final count immediately. The drilldown preserves the full evidence when needed without making every visit scroll through it.

## Evidence

Owner, T3 Code chat `8b967f7d-a062-4f5a-9a56-bb863ff12bca`, 2026-10-08:

> I really just need the final piano count

> maybe if I click the piano one, I can see all the scans and times just for that.

> That way, i have less scrolling to do on the image-streaming devices.

Browser tests cover grouping, zero-point practice, timestamps, corrections, running sessions, Back, drag suppression and overflow across all four windows. Fixture captures include the task summary and filtered scan history at 480×480.

Fixture renders: [before](../images/task-totals/before.png), [task totals](../images/task-totals/summary.png), [selected scans](../images/task-totals/scans.png).
