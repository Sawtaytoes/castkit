# Chooser posters fill the available box

- **Status:** Accepted
- **Date:** 2026-10-30
- **Type:** Design
- **Supersedes:** [Queue chooser uses avatars and scrolling](2026-10-29-queue-chooser-uses-avatars-and-scrolling.md), for fixed square sizing
- **Superseded by:** None

## Decision

Use the shared measured layout selector to maximize contained poster area. Two to four choices fit the whole available box; larger selections retain scrolling. Prefer full poster rectangles when the measured box keeps targets at least 130 pixels wide. Otherwise, maximize square targets with cropped covers so small selections remain easy to tap. Center a concise empty state. Warm authorized queue posters in the source media cache before scans, without publishing extra channel grants.

## Context

The owner reported slow poster loading and undersized choices after scanning.

## Why

Provider work belongs outside the scan path. Measured geometry uses the space
available on the actual display rather than a fixed tile size. Cache failures
must leave matching and controls usable.

## Evidence

Cache reuse and authorization checks run against fixtures. Browser verification
covers four named windows and the 480 × 480 touch panel.
