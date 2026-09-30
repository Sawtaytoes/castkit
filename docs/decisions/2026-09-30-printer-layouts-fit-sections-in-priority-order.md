# Printer layouts fit sections in priority order

- **Status:** Accepted
- **Date:** 2026-09-30
- **Type:** Layout / interaction
- **Supersedes:** [The 900 px platform printer split](2026-09-28-a-wide-platform-printer-card-puts-the-picture-beside-the-facts.md)
- **Superseded by:** —

## Decision

Compare stacked and horizontal arrangements using both dimensions of each
printer card and the measured height of its actual facts. Required information
must fit before extra space is assigned. In a camera view, maximize the contained
camera image first. With a static preview, prioritize a readable facts column
(completion, time and layers), then enlarge the image with the remaining space.
The priorities are section configuration, not an orientation inferred from the
window's width alone. The shared selection policy lives in Charcuterie logic;
CastKit supplies its measurements and printer-specific section priorities.

Both live cameras and static print images open a viewport-size modal when
clicked. Clicking the image again, clicking outside it, or Escape closes the
modal and returns focus to its trigger. Keep the same player mounted so a live
camera does not reconnect just because it is enlarged. Reproduce the existing
Charcuterie Lightbox shape in the small Preact client without a React layer.
Pause/Resume use warning tokens and Stop uses danger tokens in both printer
renderers. Display access and the saved controls setting still govern actions.

## Context

A wide but tall browser window selected the fixed 40/60 horizontal layout and
left most of its height empty. Stacking could display a much larger camera.
The platform controls had generic gray styling since their introduction, while
the original device renderer used warning and danger colors.

## Why

A contained 16:9 camera cannot use the spare height in a narrow column. Compare
its actual visible area instead of the letterboxed container. Static covers
change less often than print stats, so they have a different section priority.
Measuring the rendered facts keeps buttons, filament details and wrapped job
names visible as the card changes size.

## Evidence

Owner, chat `a0d585d3-5c50-4dee-9843-5b046da597ac`, 2026-09-30:
*“we should have sections of these views configured with priorities for resizing,
and we resize and reorient based on the priority of information.”*

- `packages/slatecast/src/platform/PrintersView.test.tsx` covers tall versus short
  orientation, static facts, action colors, modal dismissal and preserved media.
- `docs/images/printer-priority-camera-tall.png` and `printer-priority-camera-short.png`
  show the same camera on both shapes; `printer-priority-static-short.png` shows
  the wider information column; `printer-priority-enlarged.png` shows the modal.
