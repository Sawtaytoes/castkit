# Queue chooser uses avatars and scrolling

- **Status:** Accepted
- **Date:** 2026-10-29
- **Type:** Product and interaction
- **Supersedes:** [Large paged choices](2026-10-29-queue-chooser-uses-large-paged-choices.md)
- **Superseded by:** None

## Decision

Use a compact avatar-only header with Reset and Close, and a vertically scrolling
grid of square poster tiles. Remove the visible heading and routine scan instructions. Six complete
square choices fit a 480 by 480 panel. Each queue uses its stable ID to select a
Charcuterie categorical color and its matching foreground. The palette is finite;
colors aid recognition without replacing queue labels. Keep native scrolling,
expiry, first-tap actions, person removal, and error feedback intact.

## Context

The owner rejected two choices per page as too few and asked to use the space
better, suggested scrolling, requested avatars only at the top, and asked for
different queue colors in both the chooser and QueuePilot. The owner then rejected horizontal choices, asked for upcoming-show artwork, and stated that squares provide a better tapping surface.

## Why

Queue choices are no longer paged. Scroll gestures renew activity; automatic
rendering and capture scrolling do not. The list is bounded within the panel and
uses the existing native scrolling transport. A partially visible next row signals
that more choices are available. Names remain in accessible removal labels. The whole square is the touch target, not just its text or icon. Source artwork is an informational lineup sample; shuffled playback draws again, so no exact next item is promised.

## Evidence

Four-window component and real-server tests exercise six complete square choices on the
480 by 480 panel, scroll to the final queue, and validate native band geometry.
Before and after fixture images are in docs/images/queue-picker-density/.
