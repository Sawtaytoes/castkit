# Watchy removes ended calendar events locally

- **Status:** Accepted
- **Date:** 2026-10-06
- **Type:** UI behavior
- **Supersedes:** None
- **Superseded by:** None

## Decision

Remove finished events from the Watchy agenda pages and clock next-event summary.
End times are exclusive: an event ending at 18:00 is no longer visible at 18:00.
Compact the cached agenda before drawing and navigation, including offline minute
wakes. Clamp pagination after removal. Calendar records remain unchanged.

All-day events remain until their supplied end, or through the cached local day
when no duration is supplied. Timed entries without an end expire at their start,
matching the existing parser fallback. Invalid local time does not prune the cache.

## Context

The clock summary skipped ended timed events, but the paged agenda still drew
all cached events until the producer replaced the snapshot.

## Why

An offline watch already has event end times and a local clock. Event expiry must
not wait for the next network sync. The existing minute repaint cadence is retained.

## Evidence

Owner: "For calendar events, remove them after the time is up. When the event is
over, they should disappear from the UI." This T3 Code conversation, 2026-10-06.
Native tests cover exact end boundaries, ongoing and future events, all-day rows,
missing end times, stale days and RTC-restored pagination data.
