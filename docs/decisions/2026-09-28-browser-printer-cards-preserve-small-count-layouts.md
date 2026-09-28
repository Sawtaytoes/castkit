# Browser printer cards preserve the small-count layouts

- **Status:** Accepted
- **Date:** 2026-09-28
- **Type:** View / layout
- **Supersedes:** —
- **Superseded by:** —

## Decision

The browser printer view keeps its existing full-width media area above the
details for one, two, and three printers. Camera mode shows the camera in that
area. Print-preview mode shows the print image there. The camera and print
preview never replace one another when camera mode is active.

At four printers, camera cards use a 2×2 grid and the camera fills the available
card height. When camera mode is off, the print preview sits left of the facts.
The existing 4+ print-status layouts remain as recorded in the Printer Status
decision.

## Context

A shared preview-and-details grid changed the two- and three-printer browser
cards. The owner asked to keep those views unchanged and approved the 4+ layouts.
The camera display must also show camera feeds instead of silently substituting
a G-code preview.

## Why

- Existing one-, two-, and three-printer cards already use the screen width for
  their camera or print image.
- The four-camera view needs a 2×2 grid whose camera area uses the card height.
- A print preview beside the facts gives the image more visible area when the
  camera view is off.
- An unavailable camera must not make a G-code preview appear in camera mode.

## Evidence

Owner, T3 Code chat `t3code-6304ba05`, 2026-09-28:

> Why are we changing the 3-print and 2-print views?

> The 4-print view and up are fine. You can implement those.

Owner, T3 Code chat `t3code-6304ba05`, 2026-09-27:

> 2x2 view does not. The camera area isn't tall enough to fill the space.

> Also, in the non-camera version, the one with the images, it should put the
> image to the left side and the text on the right (kinda like the 1-print
> view). Should give more room to see what's printing.
