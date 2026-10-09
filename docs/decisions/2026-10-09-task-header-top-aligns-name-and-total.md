# Task header top-aligns name and total

Status: Accepted
Date: 2026-10-09
Type: Display presentation
Supersedes: None
Superseded by: None

## Decision

Keep the daily-task Back button for now. Draw its chevron as an explicit 32px SVG in the existing 52px touch target, using the shared icon system. Top-align the child name and earned total, including the selected-task scan header. The secondary today label does not determine the name's alignment.

## Context

The generic platform button font overrode the chevron's intended size, making its text glyph tiny. Centering the child name against a two-line points block placed the name below the total's top edge.

## Why

An explicit icon stays readable regardless of button typography or installed fonts. Aligned top edges make the header coherent while keeping its total and secondary label distinct.

## Evidence

Owner, T3 Code chat `8b967f7d-a062-4f5a-9a56-bb863ff12bca`, 2026-10-09:

> We can keep it for now, but look how small that chevron is.

> I think they need to be top-aligned to look right.

Fixture renders: [before](../images/task-header/before.png), [aligned summary](../images/task-totals/summary.png), [aligned scan history](../images/task-totals/scans.png).
