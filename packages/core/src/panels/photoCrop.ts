/**
 * `PhotoCrop` cuts part of a photo away and zooms what is left to fill the
 * frame — the opposite of `PanelMargin`, which cuts nothing and makes the
 * picture smaller so all of it survives. Per edge, in *native* panel pixels of
 * the box the photo is composed into (the panel minus the margin).
 *
 * Photo views only. Cropping a text view would mean scaling an
 * already-rendered raster up, which only makes the text blurry; a photo is
 * re-cut from the full-resolution source and stays sharp. See
 * docs/decisions/2026-09-08-margin-pushes-in-and-crop-cuts-away.md.
 *
 * Kept here, free of sharp, so the browser preview and the server compute the
 * same rectangle from the same code.
 */
export type PhotoCrop = {
  top: number
  right: number
  bottom: number
  left: number
}

export const NO_PHOTO_CROP: PhotoCrop = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
}

/** Never cut more than this much away, so a photo can't collapse to nothing. */
const MAX_CUT_FRACTION = 0.8

export type SourceRect = {
  left: number
  top: number
  width: number
  height: number
}

const clamp = ({
  value,
  minimum,
  maximum,
}: {
  value: number
  minimum: number
  maximum: number
}) => Math.min(Math.max(value, minimum), maximum)

/**
 * How much of each axis survives the crop, and where the surviving band sits.
 *
 * The kept region has to keep the frame's aspect ratio or the photo stretches,
 * so the two axes cannot be cut by different amounts. We cut BOTH axes by
 * whichever edge pair asked for more, then place the band using the ratio
 * between the two opposing edges. So "crop 40 off the bottom" zooms in by that
 * much and pushes the band upward — it also trims a little off each side,
 * exactly as cropping to a fixed aspect does in any photo editor.
 */
export const resolveCropBand = ({
  crop,
  targetWidth,
  targetHeight,
}: {
  crop: PhotoCrop
  targetWidth: number
  targetHeight: number
}) => {
  const cutLeft = clamp({
    value: crop.left / targetWidth,
    minimum: 0,
    maximum: 1,
  })
  const cutRight = clamp({
    value: crop.right / targetWidth,
    minimum: 0,
    maximum: 1,
  })
  const cutTop = clamp({
    value: crop.top / targetHeight,
    minimum: 0,
    maximum: 1,
  })
  const cutBottom = clamp({
    value: crop.bottom / targetHeight,
    minimum: 0,
    maximum: 1,
  })

  const cutAcross = cutLeft + cutRight
  const cutDown = cutTop + cutBottom
  const cut = clamp({
    value: Math.max(cutAcross, cutDown),
    minimum: 0,
    maximum: MAX_CUT_FRACTION,
  })

  // With nothing asked for on an axis, the trim it still has to take (to hold
  // the aspect ratio) comes off both of its edges evenly.
  return {
    keptFraction: 1 - cut,
    leftShare: cutAcross > 0 ? cutLeft / cutAcross : 0.5,
    topShare: cutDown > 0 ? cutTop / cutDown : 0.5,
  }
}

export const getHasPhotoCrop = (crop: PhotoCrop) =>
  crop.top > 0 ||
  crop.right > 0 ||
  crop.bottom > 0 ||
  crop.left > 0

/**
 * Shrink the source rectangle the fit logic already chose, so the caller can
 * `extract` it and resize to the same target as before. Working on the source
 * rectangle — rather than on the finished frame — is what keeps a crop sharp:
 * the pixels are re-cut from the original, never upscaled.
 */
export const applyPhotoCrop = ({
  crop,
  rect,
  targetWidth,
  targetHeight,
}: {
  crop: PhotoCrop
  rect: SourceRect
  targetWidth: number
  targetHeight: number
}): SourceRect => {
  const { keptFraction, leftShare, topShare } =
    resolveCropBand({ crop, targetWidth, targetHeight })

  if (keptFraction >= 1) {
    return rect
  }

  const width = Math.max(
    1,
    Math.round(rect.width * keptFraction),
  )
  const height = Math.max(
    1,
    Math.round(rect.height * keptFraction),
  )

  return {
    width,
    height,
    left: Math.round(
      rect.left + (rect.width - width) * leftShare,
    ),
    top: Math.round(
      rect.top + (rect.height - height) * topShare,
    ),
  }
}
