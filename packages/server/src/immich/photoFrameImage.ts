import sharp from "sharp"
import type { FaceBox } from "./immichClient.ts"

/**
 * Turns an Immich preview JPEG into an exactly panel-sized image. The crop is
 * always the LARGEST target-aspect window the image allows (a normal
 * cover-crop), shifted just far enough that every configured face stays in
 * frame — faces are never the thing the crop zooms into, they only steer
 * where the unavoidable aspect-ratio trim happens. When the faces span more
 * than even the maximal window can hold, the whole image is letterboxed on
 * white instead so nobody is cut out.
 */

export type CropRect = {
  left: number
  top: number
  width: number
  height: number
}

/** Padding added around the face union so heads aren't flush with the edge. */
const FACE_PADDING_FRACTION = 0.15

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
 * The maximal target-aspect cover-crop window, centered on the image but
 * shifted the minimum distance needed to contain every (padded) face box —
 * or null when the padded face union is bigger than the window itself
 * (caller letterboxes so no face is lost).
 */
export const computeFaceCropRect = ({
  imageWidth,
  imageHeight,
  targetWidth,
  targetHeight,
  faceBoxes,
}: {
  imageWidth: number
  imageHeight: number
  targetWidth: number
  targetHeight: number
  faceBoxes: readonly FaceBox[]
}): CropRect | null => {
  if (faceBoxes.length === 0) {
    return null
  }

  // The biggest window of the panel's aspect that fits inside the image —
  // identical to what a plain cover-crop would use.
  const targetAspect = targetWidth / targetHeight
  const imageAspect = imageWidth / imageHeight
  const cropWidth =
    imageAspect > targetAspect
      ? imageHeight * targetAspect
      : imageWidth
  const cropHeight = cropWidth / targetAspect

  // The padded face union, clamped inside the image.
  const rawLeft =
    Math.min(...faceBoxes.map((box) => box.x1)) * imageWidth
  const rawTop =
    Math.min(...faceBoxes.map((box) => box.y1)) *
    imageHeight
  const rawRight =
    Math.max(...faceBoxes.map((box) => box.x2)) * imageWidth
  const rawBottom =
    Math.max(...faceBoxes.map((box) => box.y2)) *
    imageHeight
  const paddingX =
    (rawRight - rawLeft) * FACE_PADDING_FRACTION
  const paddingY =
    (rawBottom - rawTop) * FACE_PADDING_FRACTION
  const unionLeft = Math.max(0, rawLeft - paddingX)
  const unionTop = Math.max(0, rawTop - paddingY)
  const unionRight = Math.min(
    imageWidth,
    rawRight + paddingX,
  )
  const unionBottom = Math.min(
    imageHeight,
    rawBottom + paddingY,
  )

  // Faces wider/taller than the maximal window: no shift can save them.
  if (
    unionRight - unionLeft > cropWidth + 1 ||
    unionBottom - unionTop > cropHeight + 1
  ) {
    return null
  }

  // Start where a plain cover-crop would (image center), then shift the
  // minimum distance that brings the face union fully inside the window.
  const centeredLeft = (imageWidth - cropWidth) / 2
  const centeredTop = (imageHeight - cropHeight) / 2
  const left = clamp({
    value: clamp({
      value: centeredLeft,
      minimum: unionRight - cropWidth,
      maximum: unionLeft,
    }),
    minimum: 0,
    maximum: imageWidth - cropWidth,
  })
  const top = clamp({
    value: clamp({
      value: centeredTop,
      minimum: unionBottom - cropHeight,
      maximum: unionTop,
    }),
    minimum: 0,
    maximum: imageHeight - cropHeight,
  })

  return {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.round(cropWidth),
    height: Math.round(cropHeight),
  }
}

/**
 * Produce an exactly `targetWidth×targetHeight` PNG: the face-steered maximal
 * cover-crop when the faces fit, else the whole image letterboxed on white.
 * Returns the PNG plus which mode was used (for logging).
 */
export const preparePhotoFrameImage = async ({
  jpegBytes,
  targetWidth,
  targetHeight,
  faceBoxes,
}: {
  jpegBytes: Buffer
  targetWidth: number
  targetHeight: number
  faceBoxes: readonly FaceBox[]
}): Promise<{ png: Buffer; mode: string }> => {
  const image = sharp(jpegBytes)
  const metadata = await image.metadata()
  const imageWidth = metadata.width ?? 0
  const imageHeight = metadata.height ?? 0

  const cropRect = computeFaceCropRect({
    imageWidth,
    imageHeight,
    targetWidth,
    targetHeight,
    faceBoxes,
  })

  if (cropRect) {
    const png = await image
      .extract(cropRect)
      .resize(targetWidth, targetHeight)
      .png()
      .toBuffer()
    return { png, mode: "face-steered cover-crop" }
  }

  const png = await image
    .resize(targetWidth, targetHeight, {
      fit: "contain",
      background: {
        r: 255,
        g: 255,
        b: 255,
        alpha: 1,
      },
    })
    .png()
    .toBuffer()
  return {
    png,
    mode:
      faceBoxes.length > 0
        ? "letterbox (faces span too far)"
        : "letterbox (no face data)",
  }
}
