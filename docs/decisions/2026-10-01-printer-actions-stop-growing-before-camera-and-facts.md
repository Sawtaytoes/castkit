# Printer actions stop growing before camera and facts

- **Status:** Accepted
- **Date:** 2026-10-01
- **Type:** Presentation / sizing
- **Supersedes:** —
- **Superseded by:** —

## Decision

Pause, Resume and Stop scale between 48 and 56 pixels high, with text capped
at 22 pixels. Their pair occupies at most 320 pixels across, aligned to the
end of the facts section. Apply the same limits to both browser printer
renderers, including the single-printer profile.

The camera remains the first sizing priority and readable information the
second, under the existing priority layout policy. Actions have the lowest
priority. Clear plate retains its separate settled-job reminder treatment.

## Context

The browser controls used viewport-based minimum height and font size with
no maximum. A large window inflated both controls and reduced the area the
camera could use. The existing layout comparison correctly prioritized the
camera, but first reserved the inflated measured facts and actions.

## Why

Bounding the actual controls preserves touch targets while returning space
to camera content. The platform's existing layout measurement then observes
the smaller action row without changing the shared Charcuterie policy.

## Evidence

Owner, T3 Code chat `08aa412b-7bd8-47c5-b452-4085fc663efc`:

> It's nice they scale, but we should have a max size

> In this view with the camera, the camera is the focus.

> Last are the pause/stop buttons

- Browser fixture captures: `docs/images/printer-actions-before-tall.png` and
  `docs/images/printer-actions-after-tall.png`.
- Existing touch-box checks include a large browser and the bounded action row.
