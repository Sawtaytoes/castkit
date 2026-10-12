# Task header aligns primary values in one row

Status: Accepted
Date: 2026-10-12
Type: Display presentation correction
Supersedes: [Top-aligned task header](2026-10-09-task-header-top-aligns-name-and-total.md), alignment only
Superseded by: None

## Decision

Center the Back chevron, child name and earned total within one primary header
row. Place the secondary today label in its own row beneath the total so it
cannot shift the primary row's alignment. Apply the same layout to task totals
and individual scan history; keep the existing Back icon and touch target.

## Context

The previous header aligned three differently sized boxes at their top edges.
The name, centered icon inside its touch target and larger numeric total then
appeared at different vertical positions. Centering against the two-line total
would also let the secondary label pull the name down.

## Why

The primary values share one visual centerline independently of secondary text.
The layout works across small device panels and larger composed views without
font-specific pixel offsets.

## Evidence

Owner, T3 Code worktree `t3code-ef049911`, October 12, 2026:

> "look at the vertical alignment."

The owner supplied a photograph of the task-detail header and identified the
child name, Back chevron and points total as the misaligned elements.

Fixture captures: [before](../images/task-header/center-before.png),
[aligned summary](../images/task-header/center-after.png), and
[aligned scan history](../images/task-header/center-scans-after.png).
