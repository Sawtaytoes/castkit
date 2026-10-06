# Watchy idle scans slow down and Back syncs

- **Status:** Accepted
- **Date:** 2026-10-06
- **Type:** Device behavior / owner preference
- **Supersedes:** [Short clock presses](2026-10-06-watchy-short-clock-presses-stay-offline.md), Back behavior only
- **Superseded by:** None

## Decision

A timer watch can check for new scans every two minutes while idle, then use
one-minute synchronization while its cached timer is running. Both intervals
are configurable in its installation substitutions. Local clock drawing still
runs every minute. Preserve five-minute then fifteen-minute offline backoff for
short-cadence watches and fifteen minutes for calendar-only installations.

Top-left Back returns to the default clock and requests an immediate network
sync, on a deep-sleep wake or while awake. It bypasses retry backoff. Short
bottom-left clock switching and agenda/Points navigation remain local on battery;
a two-second bottom-left hold also requests sync. USB operation is unchanged.

## Context

The owner reviewed the physical watches and selected the layout and battery policy
through the interactive preview and interval choices.

## Why

Frequent radio setup has a meaningful cost on a small battery. The owner accepted
a two-minute maximum idle scan wait because Back can request a check. Keep
one-minute active checks for session stops; the timer continues counting locally
between them. Voltage bars are thresholds, not calibrated charge fractions.

## Evidence

Owner chose "Two minutes idle, one minute active".
Owner expects a Back press to request new timer data, including on the other watch.
Native power tests cover odd/even minutes, active-timer override, retry boundaries
and explicit manual sync. Private records distinguish duty cycle from endurance.
