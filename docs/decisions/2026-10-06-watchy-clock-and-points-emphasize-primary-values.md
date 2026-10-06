# Watchy clock and Points emphasize primary values

- **Status:** Accepted
- **Date:** 2026-10-06
- **Type:** Device behavior / owner preference
- **Supersedes:** [Cached next-event clocks](2026-10-06-watchy-view-buttons-cycle-and-clocks-show-cached-next-events.md), presentation only
- **Superseded by:** [Compact binary grid](2026-10-06-watchy-binary-grid-is-compact.md) for binary horizontal spacing only

## Decision

Use one left margin for the digital time, smaller date and next-event title.
A thin divider separates timekeeping from the next event; its absolute time is
right-aligned opposite a compact Next/Now label. Wrap the event over two lines.
The battery bars and separate charging bolt are compact in the upper right.
The binary face uses the same event section, with no duplicate digital footer.

Points uses black text on white: large initials and scores, with the remaining
name smaller alongside the initial. Keep producer order, omit routine header/date/
battery/offline clutter, and mark genuinely stale dated snapshots. Retain the
same local caches, asynchronous repaint and repeated-button navigation.

## Context

The owner reviewed the physical watches and selected the layout and battery policy
through the interactive preview and interval choices.

## Why

The owner chose the left-margin layout after reviewing true-size one-bit samples.
The older clock's large battery/date/event label competed with the main time;
Points benefited from the bold initials/numbers of the remote view. The local
firmware now provides that hierarchy without an image download.

## Evidence

Owner: "The first letter is the most important along with the points."
Owner chose "A: one left margin" from the rendered layout review.
Private preview and installation records contain personal example values;
public illustrations use neutral data.
