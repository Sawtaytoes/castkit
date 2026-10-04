# Tally Marks cards use the available panel

- **Status:** Accepted
- **Date:** 2026-10-04
- **Type:** Presentation
- **Supersedes:** [Kids Points native view](2026-09-29-kids-points-is-a-native-view-on-a-kids-points-v1-channel.md) (the side-by-side-only board threshold)
- **Superseded by:** —

## Decision

Use Charcuterie's shared priority layout selector to choose a card grid from the view's measured width, height, and child count. Score readable area rather than empty rectangle area. Every card must meet its minimum dimensions; retain the complete-row fallback and overflow count when full cards do not fit. Compact rows also share the available height, treating 64 pixels as their minimum instead of their fixed height.

A tall portrait panel stacks cards across the full height. Earned points are larger than the goal, with both beside the child's name. Keep task details and existing scan feedback, animation, and countdown behavior. A board that fits all children continues showing all children during a scan.

## Context

The narrow layout used fixed 64-pixel rows even on tall panels. Three children occupied only the first 216 pixels of an 802-pixel content box and their task details were hidden. The rest of the framed panel was empty.

## Why

The available height should improve readability and preserve useful details. Sharing the existing selector keeps the policy consistent with other CastKit views without adding a second sizing policy to the library.

## Evidence

Owner, current T3 Code conversation on 2026-10-04 (thread identifier unavailable): “They only fill up the top of the screen. Can we use up the whole space with our auto-sizing algorithm?” The owner also selected the compact preview's earned-points hierarchy: “This looks better though because it shows how many points larger than the total.”

Browser coverage includes the tall portrait case, retained task details, the larger earned value, and the last card reaching the bottom of the content box. Existing short-panel row and scan coverage remains.
