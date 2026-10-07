# Watchy Points navigation requests fresh data

- **Status:** Accepted
- **Date:** 2026-10-06
- **Type:** Owner correction / score freshness
- **Supersedes:** Offline Points navigation in the Watchy package
- **Superseded by:** —

## Decision

Opening the local Points page requests Wi-Fi and fresh points state immediately, on both a sleeping button wake and an already-awake press. Draw the cached page first, update it as valid state arrives, and return to bounded battery sleep after the transfer. Keep Points selected while agenda and timer caches also update.

Agenda and clock navigation retain their existing local behavior. Back and held Menu retain explicit timer-reopening synchronization. Native show-scores and cycle-scores actions use the same refresh behavior as the button.

## Context

A watch displayed an older score while another watch had the current value. Points navigation had been treated as an offline cache view, so opening it did not request fresh state.

## Why

A person asking to see Points wants the latest available score. A short connection at that moment avoids waiting for the scheduled refresh without keeping the radio awake.

## Evidence

Owner, current T3 Code conversation, 2026-10-06 (chat ID unavailable):

> but only when you display the points screen, because at that point, you want the latest.
