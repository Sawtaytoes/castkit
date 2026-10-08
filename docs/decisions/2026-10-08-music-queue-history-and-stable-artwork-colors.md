# Music queues include history and retain artwork colors

Status: Accepted
Date: 2026-10-08
Type: Owner preference and defect correction
Supersedes: None
Superseded by: None

## Decision

Audio queues show previous, current and upcoming tracks. Measure the actual list and row geometry and draw as many complete rows as fit. Reserve a little history above the current track; near the end, fill unused space with earlier tracks. Preserve the current/next transport controls and their swipe protection. Print queue behavior is unchanged.

Keep the sampled artwork hue for the same track across playing, stopped, proxy-URL changes, temporary artwork failures and leaving/returning to the view. New artwork can supply a new hue; a different track without artwork uses the theme. Keep the previously accepted neutral time labels and volume icons.

## Context

The display producer supplied only current and next items. A long browser queue began at the oldest item and could leave a partial row at the panel edge. Artwork URL changes discarded a successful accent while the replacement image loaded or failed.

## Why

The current track provides the useful anchor for a glance. Layout belongs to the view rather than a producer's fixed row cap. Transport resource windows can be bounded while still retaining enough history and future items for the view. A URL or playback-state change does not mean the track's artwork color disappeared.

## Evidence

Owner, current T3 Code conversation, 2026-10-08 (chat UUID unavailable):

> Not just the current and next, but some previous and as many entries as we can fit on the screen.

> The color of controls on the music player view seem to be changing on and off though.

Browser tests cover history, complete-row capacity, resizing, end-of-queue fill, current/next commands, URL failure and view returns. Queue visual fixtures cover 480×480, 480×320 and 1280×720.
