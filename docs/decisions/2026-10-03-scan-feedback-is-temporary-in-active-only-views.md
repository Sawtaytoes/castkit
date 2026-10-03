# Scan feedback is temporary in active-only views

- **Status:** Accepted
- **Date:** 2026-10-03
- **Type:** View behavior
- **Supersedes:** —
- **Superseded by:** —

## Decision

A Kids Points panel in an active-only composition appears only while its most recent scan is within the panel's configured feedback window. Retained totals and ongoing timed tasks do not keep that panel visible. A regular points board continues showing totals between scans.

Rendering and activity use the same scan duration and clock-skew allowance. The server pushes a fresh activity snapshot at expiry, even when no further broker messages arrive. Repeated state or scan messages retain the original scan timestamp; a newer scan starts its own window. Slow panels retain the existing repaint minimum, and super-slow panels do not show temporary scan feedback.

## Context

The owner wants scan feedback in a Working composition alongside the activities already being monitored, with the points panel disappearing afterward. Previously the points contract had no idle-state answer, so an active-only composition would keep it visible indefinitely.

## Why

Scan feedback is temporary activity; the saved daily totals are persistent data. Treating those independently lets a monitor report scans without replacing its other panels or keeping an idle points board on screen.

## Evidence

Owner, current T3 Code conversation on 2026-10-03 (thread identifier unavailable), selected: “Show Tally Marks temporarily inside Working.” The owner requested removal after the scan so they can keep track of what is happening.
