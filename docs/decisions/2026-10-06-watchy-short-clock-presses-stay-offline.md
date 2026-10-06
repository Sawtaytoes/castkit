# Watchy short clock presses stay offline

- **Status:** Accepted
- **Date:** 2026-10-06
- **Type:** Device behavior / performance correction
- **Supersedes:** The manual-sync press behavior in [view-button cycles](2026-10-06-watchy-view-buttons-cycle-and-clocks-show-cached-next-events.md)
- **Superseded by:** None

## Decision

A short bottom-left press cycles the local clock without starting Wi-Fi on battery,
both when waking and while awake. Holding that button for two seconds requests
an immediate network synchronization. Scheduled checks and USB operation retain
their existing connection policy. A held button prevents sleep; the manual request
stops a pending local sleep and uses the normal bounded network wake.

## Context

The owner confirmed agenda and Points navigation became faster, but binary/digital
switching stayed slow. Bottom-left still started the radio and MQTT after every
press. Network setup can block processing of subsequent GPIO changes.

## Why

Clock selection should respond like other locally cached pages. Separating an
explicit hold from a short press also avoids unnecessary battery radio use.

## Evidence

Owner identified the slow action as "Bottom-left: binary/digital switching".
The awake GPIO action and deep-sleep wake path both preserve offline navigation;
the held-button action starts the existing synchronization and sleep deadline.
