import type { SafeAreaInset } from "@castkit/core/panels/safeArea"
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
 *
 * `visibleInset` is the mat: the photo still fills the whole target (it bleeds
 * under the mat so no white sliver shows at the edge), but every crop decision
 * is made for the box the mat leaves VISIBLE, so a face never lands underneath
 * it. See docs/decisions/2026-09-07-photo-views-compose-for-the-visible-window.md.
 */

/** The edges of the target a physical mat covers, in target pixels. */
export type VisibleInset = SafeAreaInset

const NO_VISIBLE_INSET: VisibleInset = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
}

const WHITE = { r: 255, g: 255, b: 255 }

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

/** The largest panel-aspect cover-crop window that fits inside the image. */
const computeCoverWindow = ({
  imageWidth,
  imageHeight,
  targetWidth,
  targetHeight,
}: {
  imageWidth: number
  imageHeight: number
  targetWidth: number
  targetHeight: number
}) => {
  const targetAspect = targetWidth / targetHeight
  const imageAspect = imageWidth / imageHeight
  const cropWidth =
    imageAspect > targetAspect
      ? imageHeight * targetAspect
      : imageWidth
  return { cropWidth, cropHeight: cropWidth / targetAspect }
}

/**
 * One edge of the mat inset expressed in IMAGE pixels. The crop window is
 * resized onto the whole target, so an inset of N target px hides
 * `N × cropSize / targetSize` image px at that edge of the window.
 */
const scaleInsetToImage = ({
  insetPixels,
  cropSize,
  targetSize,
}: {
  insetPixels: number
  cropSize: number
  targetSize: number
}) => (insetPixels * cropSize) / targetSize

/**
 * Where the crop window starts so that its VISIBLE part — the slice the mat
 * does not cover — is centered on the image. With no inset this is the plain
 * centered cover-crop.
 */
const computeCentredOffset = ({
  imageSize,
  cropSize,
  insetStart,
  insetEnd,
}: {
  imageSize: number
  cropSize: number
  insetStart: number
  insetEnd: number
}) =>
  imageSize / 2 -
  (insetStart + (cropSize - insetStart - insetEnd) / 2)

/** The padded bounding box of every face, clamped inside the image (px). */
const computePaddedFaceUnion = ({
  imageWidth,
  imageHeight,
  faceBoxes,
}: {
  imageWidth: number
  imageHeight: number
  faceBoxes: readonly FaceBox[]
}) => {
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
  return {
    unionLeft: Math.max(0, rawLeft - paddingX),
    unionTop: Math.max(0, rawTop - paddingY),
    unionRight: Math.min(imageWidth, rawRight + paddingX),
    unionBottom: Math.min(
      imageHeight,
      rawBottom + paddingY,
    ),
  }
}

/**
 * One axis of a crop: shift the maximal cover-crop the minimum distance that
 * brings the whole face span inside the VISIBLE part of the window, or — when
 * the span is wider than that — centre the visible part on the span's midpoint
 * (keeping the middle faces and cropping the outliers). Always inside the
 * image, so the window itself never letterboxes. `insetStart` / `insetEnd` are
 * the mat edges in image pixels; both 0 means the whole window is visible.
 */
const computeCropOffset = ({
  imageSize,
  cropSize,
  spanStart,
  spanEnd,
  insetStart,
  insetEnd,
}: {
  imageSize: number
  cropSize: number
  spanStart: number
  spanEnd: number
  insetStart: number
  insetEnd: number
}) => {
  const visibleSize = cropSize - insetStart - insetEnd
  const centred = computeCentredOffset({
    imageSize,
    cropSize,
    insetStart,
    insetEnd,
  })
  const isSpanWithinWindow =
    spanEnd - spanStart <= visibleSize
  const value = isSpanWithinWindow
    ? clamp({
        value: centred,
        minimum: spanEnd + insetEnd - cropSize,
        maximum: spanStart - insetStart,
      })
    : (spanStart + spanEnd) / 2 -
      (insetStart + visibleSize / 2)
  return clamp({
    value,
    minimum: 0,
    maximum: imageSize - cropSize,
  })
}

/**
 * The mat inset scaled from target pixels into the crop window's image pixels,
 * one value per edge.
 */
const scaleVisibleInset = ({
  visibleInset,
  cropWidth,
  cropHeight,
  targetWidth,
  targetHeight,
}: {
  visibleInset: VisibleInset
  cropWidth: number
  cropHeight: number
  targetWidth: number
  targetHeight: number
}) => ({
  insetLeft: scaleInsetToImage({
    insetPixels: visibleInset.left,
    cropSize: cropWidth,
    targetSize: targetWidth,
  }),
  insetRight: scaleInsetToImage({
    insetPixels: visibleInset.right,
    cropSize: cropWidth,
    targetSize: targetWidth,
  }),
  insetTop: scaleInsetToImage({
    insetPixels: visibleInset.top,
    cropSize: cropHeight,
    targetSize: targetHeight,
  }),
  insetBottom: scaleInsetToImage({
    insetPixels: visibleInset.bottom,
    cropSize: cropHeight,
    targetSize: targetHeight,
  }),
})

/**
 * The maximal target-aspect cover-crop window, centered on the image but
 * shifted the minimum distance needed to contain every (padded) face box —
 * or null when the padded face union is bigger than the window's VISIBLE part
 * (caller letterboxes so no face is lost).
 */
export const computeFaceCropRect = ({
  imageWidth,
  imageHeight,
  targetWidth,
  targetHeight,
  faceBoxes,
  visibleInset = NO_VISIBLE_INSET,
}: {
  imageWidth: number
  imageHeight: number
  targetWidth: number
  targetHeight: number
  faceBoxes: readonly FaceBox[]
  visibleInset?: VisibleInset
}): CropRect | null => {
  if (faceBoxes.length === 0) {
    return null
  }

  const { cropWidth, cropHeight } = computeCoverWindow({
    imageWidth,
    imageHeight,
    targetWidth,
    targetHeight,
  })
  const { insetLeft, insetRight, insetTop, insetBottom } =
    scaleVisibleInset({
      visibleInset,
      cropWidth,
      cropHeight,
      targetWidth,
      targetHeight,
    })
  const { unionLeft, unionTop, unionRight, unionBottom } =
    computePaddedFaceUnion({
      imageWidth,
      imageHeight,
      faceBoxes,
    })

  // Faces wider/taller than the visible part of the maximal window: no shift
  // can save them.
  if (
    unionRight - unionLeft >
      cropWidth - insetLeft - insetRight + 1 ||
    unionBottom - unionTop >
      cropHeight - insetTop - insetBottom + 1
  ) {
    return null
  }

  return {
    left: Math.round(
      computeCropOffset({
        imageSize: imageWidth,
        cropSize: cropWidth,
        spanStart: unionLeft,
        spanEnd: unionRight,
        insetStart: insetLeft,
        insetEnd: insetRight,
      }),
    ),
    top: Math.round(
      computeCropOffset({
        imageSize: imageHeight,
        cropSize: cropHeight,
        spanStart: unionTop,
        spanEnd: unionBottom,
        insetStart: insetTop,
        insetEnd: insetBottom,
      }),
    ),
    width: Math.round(cropWidth),
    height: Math.round(cropHeight),
  }
}

/**
 * The face-steered maximal cover-crop that ALWAYS fills the panel — it never
 * letterboxes. When the faces fit the window it behaves exactly like
 * `computeFaceCropRect`; when they span too far to all fit, it centres on the
 * face mass (keeping the primary/central faces, cropping the outermost) instead
 * of giving up to white bars. Powers the "Photo Frame (Fill)" view and each
 * column of a dual-portrait composite.
 */
export const computeFillCropRect = ({
  imageWidth,
  imageHeight,
  targetWidth,
  targetHeight,
  faceBoxes,
  visibleInset = NO_VISIBLE_INSET,
}: {
  imageWidth: number
  imageHeight: number
  targetWidth: number
  targetHeight: number
  faceBoxes: readonly FaceBox[]
  visibleInset?: VisibleInset
}): CropRect => {
  const { cropWidth, cropHeight } = computeCoverWindow({
    imageWidth,
    imageHeight,
    targetWidth,
    targetHeight,
  })
  const { insetLeft, insetRight, insetTop, insetBottom } =
    scaleVisibleInset({
      visibleInset,
      cropWidth,
      cropHeight,
      targetWidth,
      targetHeight,
    })

  if (faceBoxes.length === 0) {
    return {
      left: Math.round(
        clamp({
          value: computeCentredOffset({
            imageSize: imageWidth,
            cropSize: cropWidth,
            insetStart: insetLeft,
            insetEnd: insetRight,
          }),
          minimum: 0,
          maximum: imageWidth - cropWidth,
        }),
      ),
      top: Math.round(
        clamp({
          value: computeCentredOffset({
            imageSize: imageHeight,
            cropSize: cropHeight,
            insetStart: insetTop,
            insetEnd: insetBottom,
          }),
          minimum: 0,
          maximum: imageHeight - cropHeight,
        }),
      ),
      width: Math.round(cropWidth),
      height: Math.round(cropHeight),
    }
  }

  const { unionLeft, unionTop, unionRight, unionBottom } =
    computePaddedFaceUnion({
      imageWidth,
      imageHeight,
      faceBoxes,
    })

  return {
    left: Math.round(
      computeCropOffset({
        imageSize: imageWidth,
        cropSize: cropWidth,
        spanStart: unionLeft,
        spanEnd: unionRight,
        insetStart: insetLeft,
        insetEnd: insetRight,
      }),
    ),
    top: Math.round(
      computeCropOffset({
        imageSize: imageHeight,
        cropSize: cropHeight,
        spanStart: unionTop,
        spanEnd: unionBottom,
        insetStart: insetTop,
        insetEnd: insetBottom,
      }),
    ),
    width: Math.round(cropWidth),
    height: Math.round(cropHeight),
  }
}

/** True when the image is taller than it is wide (portrait orientation). */
export const isPortraitImage = async ({
  jpegBytes,
}: {
  jpegBytes: Buffer
}): Promise<boolean> => {
  const metadata = await sharp(jpegBytes).metadata()
  const imageWidth = metadata.width ?? 0
  const imageHeight = metadata.height ?? 0
  return imageHeight > imageWidth
}

/**
 * How a photo is fit to its target window:
 * - `letterbox` — face-steered cover-crop when every face fits the maximal
 *   window, else white letterbox bars so no one is cut ("Photo Frame").
 * - `fill` — always fills the window, centring on the face mass when the faces
 *   can't all fit ("Photo Frame (Fill)" and dual-portrait columns).
 */
export type PhotoFitMode = "letterbox" | "fill"

/**
 * Render one JPEG into an exactly `targetWidth×targetHeight` PNG. `fitMode`
 * chooses letterbox vs fill (see `PhotoFitMode`). The shared core behind the
 * single-photo frame and each half of a dual-portrait composite.
 */
const renderToTarget = async ({
  jpegBytes,
  targetWidth,
  targetHeight,
  faceBoxes,
  fitMode,
  visibleInset = NO_VISIBLE_INSET,
}: {
  jpegBytes: Buffer
  targetWidth: number
  targetHeight: number
  faceBoxes: readonly FaceBox[]
  fitMode: PhotoFitMode
  visibleInset?: VisibleInset
}): Promise<{ png: Buffer; mode: string }> => {
  const image = sharp(jpegBytes)
  const metadata = await image.metadata()
  const imageWidth = metadata.width ?? 0
  const imageHeight = metadata.height ?? 0

  const cropRect =
    fitMode === "fill"
      ? computeFillCropRect({
          imageWidth,
          imageHeight,
          targetWidth,
          targetHeight,
          faceBoxes,
          visibleInset,
        })
      : computeFaceCropRect({
          imageWidth,
          imageHeight,
          targetWidth,
          targetHeight,
          faceBoxes,
          visibleInset,
        })

  if (cropRect) {
    const png = await image
      .extract(cropRect)
      .resize(targetWidth, targetHeight)
      .png()
      .toBuffer()
    return {
      png,
      mode:
        fitMode === "fill"
          ? "face-steered fill-crop"
          : "face-steered cover-crop",
    }
  }

  // Letterbox. The bars go inside the VISIBLE box, then plain white pads out
  // to the target — the mat covers white rather than a cut edge, and the whole
  // photo still reads inside the window.
  const visibleWidth =
    targetWidth - visibleInset.left - visibleInset.right
  const visibleHeight =
    targetHeight - visibleInset.top - visibleInset.bottom
  const containedPng = await image
    .resize(visibleWidth, visibleHeight, {
      fit: "contain",
      background: { ...WHITE, alpha: 1 },
    })
    .png()
    .toBuffer()
  const png =
    visibleWidth === targetWidth &&
    visibleHeight === targetHeight
      ? containedPng
      : await sharp({
          create: {
            width: targetWidth,
            height: targetHeight,
            channels: 3,
            background: WHITE,
          },
        })
          .composite([
            {
              input: containedPng,
              left: visibleInset.left,
              top: visibleInset.top,
            },
          ])
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

/**
 * Produce an exactly `targetWidth×targetHeight` PNG from one photo, fit per
 * `fitMode` (letterbox or fill). Returns the PNG plus which mode was used (for
 * logging).
 */
export const preparePhotoFrameImage = ({
  jpegBytes,
  targetWidth,
  targetHeight,
  faceBoxes,
  fitMode,
  visibleInset,
}: {
  jpegBytes: Buffer
  targetWidth: number
  targetHeight: number
  faceBoxes: readonly FaceBox[]
  fitMode: PhotoFitMode
  visibleInset?: VisibleInset
}) =>
  renderToTarget({
    jpegBytes,
    targetWidth,
    targetHeight,
    faceBoxes,
    fitMode,
    ...(visibleInset ? { visibleInset } : {}),
  })

/**
 * Split `targetWidth` into two photo columns separated by a white gutter. The
 * two halves are measured on the VISIBLE window, so the gutter sits at the
 * centre of what the mat leaves showing and both photos read as equal halves;
 * each column then reaches the panel edge so nothing white peeks out past the
 * mat. The left visible half absorbs any odd remainder, and the columns plus
 * the gutter always sum to exactly `targetWidth`. With no inset the gutter is
 * at the panel centre, exactly as before.
 */
export const computeDualPortraitColumns = ({
  targetWidth,
  gutterPixels,
  visibleInset = NO_VISIBLE_INSET,
}: {
  targetWidth: number
  gutterPixels: number
  visibleInset?: VisibleInset
}) => {
  const visibleWidth =
    targetWidth - visibleInset.left - visibleInset.right
  const visibleColumnWidth = Math.ceil(
    (visibleWidth - gutterPixels) / 2,
  )
  const leftWidth = visibleInset.left + visibleColumnWidth
  const rightLeftOffset = leftWidth + gutterPixels
  return {
    leftWidth,
    rightWidth: targetWidth - rightLeftOffset,
    rightLeftOffset,
  }
}

/**
 * Compose two portrait photos side by side into one exactly
 * `targetWidth×targetHeight` PNG. Each photo is face-steered independently into
 * its own half-panel column and always fills it (fit "fill" — a column never
 * letterboxes), and the two columns are composited onto a white canvas with a
 * thin gutter between them. For landscape image-mode panels (see
 * docs/decisions/2026-07-12-dual-portrait-photo-layout.md).
 */
export const composeDualPortrait = async ({
  leftJpegBytes,
  leftFaceBoxes,
  rightJpegBytes,
  rightFaceBoxes,
  targetWidth,
  targetHeight,
  gutterPixels,
  visibleInset = NO_VISIBLE_INSET,
}: {
  leftJpegBytes: Buffer
  leftFaceBoxes: readonly FaceBox[]
  rightJpegBytes: Buffer
  rightFaceBoxes: readonly FaceBox[]
  targetWidth: number
  targetHeight: number
  gutterPixels: number
  visibleInset?: VisibleInset
}): Promise<{ png: Buffer; mode: string }> => {
  const { leftWidth, rightWidth, rightLeftOffset } =
    computeDualPortraitColumns({
      targetWidth,
      gutterPixels,
      visibleInset,
    })

  // Each column carries only the mat edges that touch it: the left column
  // bleeds under the mat on the left, the right column on the right, and both
  // share the top and bottom. The gutter side of a column is fully visible.
  const [leftColumn, rightColumn] = await Promise.all([
    renderToTarget({
      jpegBytes: leftJpegBytes,
      targetWidth: leftWidth,
      targetHeight,
      faceBoxes: leftFaceBoxes,
      fitMode: "fill",
      visibleInset: {
        top: visibleInset.top,
        right: 0,
        bottom: visibleInset.bottom,
        left: visibleInset.left,
      },
    }),
    renderToTarget({
      jpegBytes: rightJpegBytes,
      targetWidth: rightWidth,
      targetHeight,
      faceBoxes: rightFaceBoxes,
      fitMode: "fill",
      visibleInset: {
        top: visibleInset.top,
        right: visibleInset.right,
        bottom: visibleInset.bottom,
        left: 0,
      },
    }),
  ])

  const png = await sharp({
    create: {
      width: targetWidth,
      height: targetHeight,
      channels: 3,
      background: WHITE,
    },
  })
    .composite([
      { input: leftColumn.png, left: 0, top: 0 },
      {
        input: rightColumn.png,
        left: rightLeftOffset,
        top: 0,
      },
    ])
    .png()
    .toBuffer()

  return {
    png,
    mode: `dual-portrait (${leftColumn.mode} | ${rightColumn.mode})`,
  }
}
