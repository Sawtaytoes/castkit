# A "none" dither option hands the panel a full-colour image

- **Status:** Accepted
- **Date:** 2026-07-02
- **Type:** Product behavior
- **Supersedes:** —
- **Superseded by:** —

## Decision

`none` is a selectable dither algorithm (first in `DITHER_ALGORITHMS`, so it
heads the "Display: Dither" select). With `none`, `ditherToPanel` **skips our
palette quantization entirely** and returns the downscaled, tone-adjusted image
as a full-colour RGB PNG, letting the panel's own controller do the dithering.
Brightness and saturation still apply (they run in the downscale chain, before
the skip).

## Context

On the E6 Impression the maintainer felt our error-diffusion dither made photos
look worse than sending a plainer image and letting the panel's onboard chip
handle it.

## Why

Maintainer wants to A/B our dithering against the panel's native handling, while
keeping the brightness/saturation controls. `none` is the escape hatch — no
quantization, unambiguous RGB out (still rotated to the mount orientation), tone
knobs intact.

## Evidence

> "did something get messed up with the colors? I swear the images looked better
> before we added this dithering. is it possible to add a 'None' option to
> dithering, so we could let the panel itself handle that? I think the onboard
> chip can do it. We could still control the brightness and saturation in this
> way."

— maintainer, 2026-07-02 (verified via preview: `none` emits smooth
anti-aliased full-colour, not palette-dithered)
