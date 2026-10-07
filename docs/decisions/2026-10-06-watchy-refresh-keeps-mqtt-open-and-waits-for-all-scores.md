# Watchy refresh keeps MQTT open and waits for all scores

- **Status:** Accepted
- **Date:** 2026-10-06
- **Type:** Bug fix / synchronization
- **Supersedes:** [Explicit timer refresh](2026-10-06-watchy-explicit-refresh-reopens-the-active-timer.md), forced MQTT reconnect only
- **Superseded by:** None

## Decision

Explicit synchronization keeps an existing MQTT connection open. An optional
installation `state_refresh_topic` receives a non-retained JSON `{requestId}`
challenge after connection. Its producer must republish current state through
the normal configured subscriptions without scoring or changing records.
The existing explicit-refresh timer-selection behavior remains.

Wildcard score feeds can configure `scores_expected_count` (up to six). Each
transfer collects distinct valid child identities separately from the cached
rows. Early sleep requires all expected identities and every cached identity
in the current transfer; repeated first-child rows cannot complete it. A complete
canonical `kids` snapshot is atomic, including an explicitly empty list. Invalid
rows never establish receipt. The bounded battery deadline and radio cadence stay.

Update Saved Scores immediately after accepted state, so diagnostic readback
reflects the current cache rather than the prior wake's pre-network value.

## Context

The owner reported stale totals on both watches. One updated after a manual
refresh; the other connected and immediately disconnected during its forced
refresh before eventually catching up. The first-child receipt boolean also
allowed early sleep while other cached children had not refreshed.

## Why

A working connection should deliver updates instead of being interrupted by the
refresh action. Receiving one child does not prove the whole score page is current.
A small bounded receipt set provides that proof without changing ledger rules or
requiring persistent writes. A producer request also avoids waiting for the next
periodic heartbeat when the watch is already connected.

## Evidence

Owner: "the points didn't update on either. They did earlier, but we just checked"
after the manual-refresh check. This T3 Code conversation,
2026-10-06. Native regression tests cover old cached rows, duplicates, a delayed
second row, transfer resets and complete atomic snapshots. Runtime installation
observations and device identities are recorded in the private workspace.
