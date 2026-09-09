# A margin pushes content in; a crop cuts content away. They are two controls

- **Status:** Accepted
- **Date:** 2026-09-08
- **Type:** Naming + product behavior
- **Supersedes:** the *name* used by [2026-07-02-safe-area-crop-via-mqtt](2026-07-02-safe-area-crop-via-mqtt.md) and [2026-09-08-photo-views-fit-the-visible-window](2026-09-08-photo-views-fit-the-visible-window.md). Their behaviour stands unchanged — only the word "crop" was wrong for it.
- **Superseded by:** —

## Decision

The knob that used to be called `Display: Crop {edge}` is renamed to
`Display: Margin {edge}`, and a genuine crop control is added beside it.

**`Display: Margin {edge}`** — how far the physical mat overlaps the panel, per
edge, in native px. Every view is laid out inside what is left, and the covered
margin renders white. **It cuts nothing.** The picture is made smaller so all of
it stays visible. MQTT slug `margin_<edge>`.

**`Photo Frame: Crop {edge}`** — how much of the picture to throw away, per
edge, in native px of the box the photo is composed into. What is left is zoomed
to fill the frame. **This is the one that cuts.** MQTT slug
`photo_crop_<edge>`. Default 0, which changes nothing.

They compose in one order: the margin decides the box, then the crop decides how
much of the photo fills it.

### The crop applies to photo views only

A photo is re-cut from the full-resolution Immich source, so a crop stays sharp.
A text view is already a rendered raster at panel size; cropping it would mean
scaling that raster up, and the only visible result is blurry text. So the crop
lives with the other `Photo Frame:` knobs, not the `Display:` ones.

### The crop keeps the aspect ratio, so nothing stretches

The kept region has to match the frame's aspect or the photo distorts on the way
back up to full size. So both axes are cut by whichever edge pair asked for
more, and the two opposing edge values decide **where** the kept band sits.
"Crop 40 off the bottom" zooms in by that much and pushes the band upward; it
also trims a little off each side, exactly as cropping to a fixed aspect does in
any photo editor. `resolveCropBand` in
`packages/core/src/panels/photoCrop.ts` is that rule, with tests.

A crop can never remove more than 80% of the picture.

### The new crop does NOT reuse the `crop_*` topic slug

Retained MQTT is this server's persistence layer, so `castkit/<device>/crop_top`
held **margins** — 36 px on the Kitchen Counter display. Reusing that slug for
the new control would have read every mat as a zoom on the first boot after
deploy. The new control gets `photo_crop_<edge>`, which cannot collide, and the
old slug is retired rather than repurposed.

`scripts/migrate-crop-to-margin.ts` moves the values, in two idempotent phases
run around the deploy:

1. `copy` — before the deploy. Writes each `crop_<edge>` to `margin_<edge>` and
   leaves the old topic alone, so the running build keeps working. Never
   overwrites a `margin_<edge>` that already holds a value.
2. `cleanup` — after the deploy is verified. Clears the retained `crop_<edge>`
   values and their discovery configs, which is what removes the orphaned
   entities from Home Assistant.

## Context

The safe-area control shipped on 2026-07-02 and was called a crop for two
months. On 2026-09-08, one change after
[photo views were made to fit the visible window](2026-09-08-photo-views-fit-the-visible-window.md),
the owner named the problem with the word.

## Why

The name described the wrong operation, and it had already misled the code. The
2026-07-02 record reasoned that "photo views bleed past the crop" — a sentence
that only sounds right if a crop is a thing that cuts. Once the control is
called a margin, "photos ignore the margin" reads as obviously wrong, which is
what it was.

Both operations are wanted. Naming them apart is what makes it possible to have
both.

## Evidence

The owner, on this rename:

> We should rename that. Crop would be to cut off parts of the image to zoom
> it. Margin or Padding would be to push it in. We can have both controls, we
> just need to specify, and then transfer over settings.

"Margin" over "Padding" was his choice from the two he offered. Photo-views-only
for the crop, and shipping both controls together, were confirmed in the same
exchange.
