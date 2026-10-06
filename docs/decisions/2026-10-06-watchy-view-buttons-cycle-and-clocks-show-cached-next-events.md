# Watchy view buttons cycle and clocks show cached next events

- **Status:** Accepted
- **Date:** 2026-10-06
- **Type:** Device behavior / owner correction
- **Supersedes:** None
- **Superseded by:** [Short clock presses stay offline](2026-10-06-watchy-short-clock-presses-stay-offline.md) for manual sync activation

## Decision

The local clock faces show the next event's absolute start time and title from
that day's retained agenda. Optional event end timestamps keep ongoing events
visible until they finish. All-day events are a fallback; stale days are marked
unsynced. The binary clock omits its duplicate digital-time footer. Its configured
hour value remains 12-hour; another button selects the digital clock.

A view button enters its page, advances through that page's data, then returns
to the configured default clock. Waking and already-awake presses use the same
scripts. The SSD1681 waveform wait yields to the main loop so quick presses can
advance state during a refresh. The driver protects its active frame, coalesces
queued draws to the latest selection, and completes the final refresh before
sleep. Routine navigation stays offline on battery; the manual sync button can
request a network connection. All cached agenda rendering remains local.

## Context

Blocking through ePaper's busy period lost quick press/release transitions.
Extra wake-suppression flags could also swallow a later press. Initial GPIO
states already suppress triggers in ESPHome; the wake mask alone handles the
wake press. Shared scripts remove inconsistent awake/wake navigation.

## Why

The small screen benefits from useful upcoming information beneath the time.
Predictable repeated presses reduce the need to switch buttons to close a view.
The absolute event time remains useful through a slow refresh. A local next-event
indicator introduces neither image transfers nor additional radio polling.

## Evidence

Owner: "Press -> view -> press -> next view or back to main screen."
The firmware includes native cycle actions that use those same physical-button
scripts. Agenda tests cover active events, end boundaries, future events, all-day
fallback, stale dates and legacy snapshots. Private installation records carry
physical identities and deployment evidence; none belongs in this public repo.
