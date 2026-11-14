# Camera remains primary; the plate preview is secondary

- **Status:** Accepted
- **Date:** 2026-10-07 (landed 2026-11-14)
- **Type:** Layout / review
- **Supersedes:** —
- **Superseded by:** —
- **Related:** [Camera and progress precede the secondary plate preview](2026-10-07-camera-and-progress-precede-the-secondary-plate-preview.md), which records where the plate preview goes and how sections yield space.

## Decision

Keep the camera-first printer card. In the reviewed dashboard shape, the camera sits
above the printer details and gets the available media area. It is the focus of the card.
An empty media area must never take its place.

This record does not change how a card chooses its orientation. The measured choice
between stacked and side-by-side arrangements in
[Printer layouts fit sections in priority order](2026-09-30-printer-layouts-fit-sections-in-priority-order.md)
still applies. That rule already puts the camera first.

A plate preview is a secondary image of the actual print. It never replaces the camera.

Pull request #104 is closed. Its layout put a separate print-preview column beside the
details and squeezed them, and the owner rejected it. This record does not approve
merging or deploying any part of that branch, including its layouts for four or more
printers.

## Context

On 2026-10-07 the owner reviewed #104's visual report. It showed a missing camera, a
camera badge, and a separate print-preview column, using an unrelated landscape fixture
in place of a real plate image. The owner rejected the layout, confirmed that the
camera-first layout on `master` was correct, and asked to see the plate preview with real
media before deciding on it.

A private preview with real camera and plate media followed in the same chat. The owner
approved a small secondary plate preview, and #216 shipped it. The related record above
holds that approval.

This record was first written on the #104 branch on 2026-10-07 and did not reach
`master` then.

## Why

The live camera is the main way to check a print from across the room. A plate preview
tells you what is printing, but it must not take space from the camera.

## Evidence

Owner, T3 Code chat `t3code-58cf7887`, 2026-10-07, replying to #104's before and after
screenshots:

> No. Close this. it's bad. The camera should be above like so: [screenshot] . The way
> it's working now is correct. Camera is priority. It should be the focus on the page,
> not a huge blank space.

> Or are you saying you added an image of the print base? Yes, I wanted that too. I'd
> forgotten about it. Can I see a real example of what that'd look like, not fake images?
