# Photo views fit inside the visible window, and nothing bleeds

- **Status:** Accepted
- **Date:** 2026-09-08
- **Type:** Product behavior
- **Supersedes:** [2026-09-07-photo-views-compose-for-the-visible-window](2026-09-07-photo-views-compose-for-the-visible-window.md) (one day old, and wrong about the bleed), and with it the "photo views bleed" clause of [2026-07-02-safe-area-crop-via-mqtt](2026-07-02-safe-area-crop-via-mqtt.md)
- **Superseded by:** [2026-09-08-margin-pushes-in-and-crop-cuts-away](2026-09-08-margin-pushes-in-and-crop-cuts-away.md), for the NAME only — the inset named here is now the panel *margin*. The behavior described below stands.

## Decision

**Every view is laid out inside the safe area, photo views included.** There is
no bleed view any more:

- The photo adapter composes the frame at the **content size** (panel minus the
  mat), not the panel size. On the Kitchen Counter display that is 678 x 416,
  not 800 x 480.
- `pushController` passes the crop inset to `renderService` for every view.
  `resolveSafeArea` + `renderDeviceImage` already build the element at the
  content size and place it on a white panel-sized canvas, which is exactly the
  behavior text views have always had. Photo views now take the same path.
- The margin under the mat renders **white**.
- `getIsBleedView` is **deleted**. The one thing it still decided — which views
  may ship a lossy full-color frame — is now `getIsLossyEncodableView`, keyed
  on the photo-view family directly.
- The `visibleInset` crop math added on 2026-09-07 is **removed**. It existed
  only to aim a panel-sized crop at a smaller window. When the crop target *is*
  the window, the original crop math is already correct, so `photoFrameImage.ts`
  returns to its pre-2026-09-07 shape.

`deviceConfigStore.getSafeAreaInset(deviceId)` resolves all four edges in one
place, because two render paths now need the same shape.

## Context

On 2026-09-07 the owner reported the Kitchen Counter display as wrong. The fix
that day kept the bleed and only re-aimed the crop, on the reasoning that a
photo filling the panel cannot show a white sliver if the mat sits slightly off.

The owner rejected that the next day, on being shown a picture of a photo
running under the mat with a fourth face hidden beneath the frame:

> "This is wrong. It should make sure the photos also fit. I don't wanna cut
> them off just because some of the ePaper display is under the matting."

## Why

The bleed traded picture for insurance against a white line, and the trade is
backwards. The mat is measured once and the numbers are tunable live from Home
Assistant, so a white edge is a setting to correct. A photo cropped by wood is
picture the owner never gets back.

Deleting the bleed also removed code rather than adding it: the safe-area path
already did this correctly for text, and photo views simply stopped opting out.

## Evidence

> "This is wrong. It should make sure the photos also fit. I don't wanna cut
> them off just because some of the ePaper display is under the matting."

— maintainer, 2026-09-08. He then chose "fit the visible window, white margin"
over a variant that kept a bleed under the mat purely as overflow.
