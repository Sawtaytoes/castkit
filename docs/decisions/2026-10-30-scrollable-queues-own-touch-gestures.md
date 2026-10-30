# Scrollable queues own touch gestures

- **Status:** Accepted
- **Date:** 2026-10-30
- **Type:** Interaction
- **Supersedes:** [Vertical view swipes](2026-09-11-a-vertical-swipe-asks-the-house-for-a-view.md), for contacts inside scroll regions
- **Superseded by:** None

## Decision

A contact inside a data-castkit-scroll region belongs to that region and never
starts a stage-level view swipe. Dedicated screen edges keep their navigation.
Touch audio queues render the full list, support vertical scrolling, and initially
position the current track with a little history above it. A drag does not activate
a track. Touchless queues retain their complete-row window around the current item.

## Context

A user reported that trying to scroll the music queue returned to the clock and
agenda instead. The queue had hidden its overflow and sliced away other tracks,
while the stage also interpreted vertical movement as navigation.

## Why

A scrollable list must own its gesture before the stage interprets it as a request
for another view. Preserving explicit edge navigation keeps a way out. Rendering
all touch rows makes earlier and later tracks reachable; passive displays still
need the bounded complete-row presentation. The current-track position changes
only when the current item or available row count changes, not on progress ticks.

## Evidence

The real-server media-controls test scrolls a 46-item touch queue using Chromium
native touch events, verifies scroll position advances without commands or a view
change, and then verifies that the bottom edge still navigates. Component tests
cover passive row fitting and touch track controls. A real-server native-worker
hit-test check verifies that a disabled playing row resolves to the scroll list
in both the acknowledged targets and the live hit test. Fixture visual evidence is in
docs/images/queue-scroll/.
