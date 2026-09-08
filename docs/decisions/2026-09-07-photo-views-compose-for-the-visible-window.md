# Photo views compose for the visible window, then bleed under the mat

- **Status:** Superseded
- **Date:** 2026-09-07
- **Type:** Product behavior
- **Supersedes:** [2026-07-02-safe-area-crop-via-mqtt](2026-07-02-safe-area-crop-via-mqtt.md) (in part — the knob stays exactly as it was; only what a photo view does with it changes)
- **Superseded by:** [2026-09-08-photo-views-fit-the-visible-window](2026-09-08-photo-views-fit-the-visible-window.md) — the owner rejected the bleed the next day; photo views now fit inside the visible window and the mat margin is white

## Decision

A photo view still **bleeds to the panel edge** — the pushed PNG is the full
panel, so no white sliver can appear beside a mat that sits a pixel off. What
changes is that every crop decision is now made for the box the mat leaves
**visible**:

- `computeFaceCropRect` / `computeFillCropRect` take an optional
  `visibleInset`. The cover-crop window is still the maximal one at the target's
  aspect (the crop never zooms), but the padded face union must land inside the
  window's *visible* part, and a face-less crop centres the visible part on the
  image rather than centring the whole window.
- When the faces span wider than the visible part, `computeFaceCropRect`
  letterboxes — as it always did when they outgrew the window.
- A letterboxed frame is contained inside the visible box and padded out to the
  panel with white, so the mat covers white rather than a cut edge.
- `computeDualPortraitColumns` measures its two halves on the visible window.
  The gutter sits at the centre of what shows, both photos read as equal halves,
  and each column still reaches its panel edge.

`pushController` is unchanged: photo views still pass **no** `safeAreaInset` to
`renderDeviceImage`, because the view element is a full-bleed image. The inset
reaches the photo adapter instead, which is where the composition happens.

With every inset at 0 this is a no-op — the previous 11 crop tests pass
untouched.

## Context

The Kitchen Counter display is the only unit in the house with a large mat:
top 36, right 63, bottom 28, left 59 on an 800 x 480 panel, so 678 x 416 shows.
Every other display is 0, or 9 to 11 px on the Living Room Mantle.

The 2026-07-02 decision said photos bleed and ignore the inset, and at that time
there was one photo view showing one photo. `Photo Frame (Duo)`
([2026-07-12](2026-07-12-dual-portrait-photo-layout.md)) then added a composite
with structure — two columns and a gutter — and laid it out on the panel centre.
Through the kitchen mat the two columns read as 337 px and 333 px, and each face
sat pushed outward toward the frame. The owner reported the kitchen display as
"not correct".

## Why

"Photos are fine bleeding under a mat" is still true, and still the reason the
render fills the panel. It was never a claim that the *subject* may sit under
the mat. A face-steering rule that aims at a rectangle 15% of which is covered
by wood is not steering at all, and a two-up layout centred on the wrong
rectangle is visibly lopsided.

Keeping the bleed and moving only the composition gets both: no white edge, and
nothing important hidden.

## Evidence

> "Either Duo or crop isn't working for images. The kitchen one isn't correct."

— maintainer, 2026-09-07. Confirmed against the live panel: the Kitchen Counter
display is on `Photo Frame (Duo)` with the inset above, and a Duo composite
rendered at 800 x 480 loses 59 px of the left photo and 63 px of the right photo
to the mat. Signed off before implementation, including the choice to apply this
to all three photo views rather than Duo alone.
