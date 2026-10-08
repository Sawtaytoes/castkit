# Agenda distance clock and daily task drilldown

Status: Accepted
Date: 2026-10-08
Type: Display presentation and interaction
Supersedes: None
Superseded by: None

## Decision

At 480×480 and larger, the agenda clock uses 120px type at 480×480 and scales with the smaller viewport dimension. Its compact a/p suffix stays separate. Measure the remaining space and draw only complete agenda rows. The short landscape layout retains its fixed clock and five-row budget.

On interactive Kids Points views, tapping a child opens an animated, read-only list of today's completed scans. The fixed header retains the child, earned total and Back control while the list scrolls. Slow repaint grades and reduced-motion preference suppress the entry animation. Retained snapshots replace an open list, including after a void. Older publishers show an explicit unavailable state; empty and stale days have distinct states.

The producer supplies stable ledger entry IDs, timestamps, local day and timezone. It excludes voided originals and reversal rows, while retaining repeated tasks and zero-point timed practice. The list never changes balances or task status. Frame-guarded contacts inside marked scrolling regions stay with the list, including through same-origin composed pages; edge navigation retains its own capture.

## Context

The agenda time was too small to read from a distance. The points board showed totals but offered no way to inspect the scans that produced them.

## Why

A larger clock uses available space for the primary distance-reading task. Daily history makes earned points understandable without exposing correction entries as completed tasks. Native pointer capture keeps scrolling distinct from view navigation.

## Evidence

Owner, T3 Code worktree `t3code-ca380031`, 2026-10-08 (chat UUID unavailable):

> I'd like the time to be a lot larger on the agenda view at 480x480 and higher.

> Also, the kids points screen should allow me to click on a kid (with animation) and see the tasks they scanned for today including scrolling to see more if they don't all fit. Avoid rendering voids.

Selected preview: “120px clock (Recommended)” and “Use this animated task list”.

- Approved HTML: [agenda and task preview](../previews/2026-10-08-agenda-kids-today.html).
- Reproducible fixture captures: `packages/slatecast/src/platform/AgendaKidsToday.vrt.tsx`.
- Source before: default branch commit `4012f6cdc9c277d9c447a0b87ab3d3e2a55223d2`.
- Browser assertions cover clock geometry, complete rows, opening/Back, corrections, date rollover and scrolling. Remote-worker Chromium coverage includes root and same-origin iframe scroll capture.
