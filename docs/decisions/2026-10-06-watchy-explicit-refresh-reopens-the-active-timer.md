# Watchy explicit refresh reopens the active timer

- **Status:** Accepted
- **Date:** 2026-10-06
- **Type:** Bug fix / device behavior
- **Supersedes:** [Back sync](2026-10-06-watchy-idle-scans-slow-down-and-back-syncs.md), active timer selection after explicit refresh only
- **Superseded by:** None

## Decision

Back, held Menu and the native `sync_now` action request fresh retained state and
open the running task timer even when that session was already cached. Back first
returns to the default clock while connecting. Scheduled snapshots still preserve
manual page selection unless a new session starts. An idle snapshot stays on the
clock. Manual refresh reconnects MQTT and resets receipt flags, including when
already connected, to avoid waiting for the producer's next periodic publication.

## Context

Refresh returned to the clock and cleared timer selection. The next retained
snapshot only opened a timer when its start timestamp differed from the cache,
so a successful sync could leave an already known running session hidden.

## Why

Refreshing to see a task should expose that task. Ordinary local navigation must
remain usable during a session without each scheduled update taking over the page.
Polling intervals, retry backoff and point accounting remain unchanged.

## Evidence

Owner reported: "I thought it was supposed to update on hitting refresh or within 2m,
but that's not happening." The follow-up clarified: "Clock instead of Piano."
This T3 Code conversation, 2026-10-06. Regression tests cover initial sessions,
unchanged scheduled snapshots, unchanged manual snapshots, replacement sessions
and stopped sessions. Private deployment and device observations live in the
installation workspace.
