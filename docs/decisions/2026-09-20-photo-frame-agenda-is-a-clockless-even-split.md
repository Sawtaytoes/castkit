# Photo Frame (Agenda) is a clockless, even split

- **Status:** Accepted
- **Date:** 2026-09-20
- **Type:** Product behavior
- **Supersedes:** —
- **Superseded by:** —
- **Refines:** [2026-09-14-a-photo-beside-the-agenda-is-a-real-split-never-a-band-over-the-photo.md](2026-09-14-a-photo-beside-the-agenda-is-a-real-split-never-a-band-over-the-photo.md) and [2026-09-14-the-photo-beside-agenda-rail-is-paper-and-the-split-is-even.md](2026-09-14-the-photo-beside-agenda-rail-is-paper-and-the-split-is-even.md)

## Decision

The approved photo-beside-agenda design enters CastKit's shared view vocabulary
as **`Photo Frame (Agenda)`**.

It is a hard, even split inside the panel's visible window:

- one face-aware, fill-cropped photo occupies the left half;
- a paper rail occupies the right half;
- dark text provides the body chrome;
- accent ink marks the event times and structural rule;
- the agenda draws only the event rows that finish on the panel;
- the complete rendered frame stays lossless, because its text and exact
  palette colors must not receive a lossy photo encoding.

The view has **no wall clock**. Event times remain because they are agenda data,
not a current-time claim. This keeps the view valid on a super-slow panel and
keeps it out of CastKit's minute repaint loop.

The photo adapter composes the source image at half of the visible width rather
than composing a landscape frame and cropping that result a second time. The
whole view still follows the fleet margin rule: nothing runs under a physical
mat.

## Context

The owner approved the split, paper rail and even ratio on the real Kitchen
Counter display on 2026-09-14. Those records deliberately claimed no view name
and said the view had not been built.

On 2026-09-20, the owner asked to use the half-picture, half-agenda layout for
the Kitchen display's calendar window instead of the full-width Agenda view.
The Kitchen panel is an 800 x 480 Spectra 6 display with a measured repaint near
28 seconds. Its existing no-clock rule still applies, so the shared split keeps
the agenda's date and event times but omits the wall clock from the earlier
layout study.

## Why

The name makes both payloads explicit without creating a Kitchen-only view.
Classifying it as both a photo view and an agenda view lets the existing photo
rotation and agenda-data refresh paths own it without a special device branch.

The clockless form follows the freshness rule. A wall clock's minute is not ten
times the panel's repaint time, but an agenda item and a photo remain true for
hours.

Composing the photo for its final half-width target preserves the adapter's
face-aware crop. Shrinking an already-composed full-panel image and applying
`object-fit: cover` again can remove the face the first crop protected.

## Evidence

> "Can we change Kitchen ePaper Display to use the half-picture half-agenda view when there are calendar items and not just the full agenda view?"

— owner, 2026-09-20

The row-fit test uses the Kitchen panel's measured 678 x 416 visible window and
confirms that all six fixture events finish inside the paper rail.
