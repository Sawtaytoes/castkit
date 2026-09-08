import { describe, expect, test } from "vitest"
import {
  computeDualPortraitColumns,
  computeFaceCropRect,
  computeFillCropRect,
} from "./photoFrameImage.ts"

const PANEL = { targetWidth: 800, targetHeight: 480 }

/** The Kitchen Counter display's measured mat, in native panel pixels. */
const KITCHEN_MAT = {
  top: 36,
  right: 63,
  bottom: 28,
  left: 59,
}

describe("computeFaceCropRect", () => {
  test("returns null with no face boxes (caller letterboxes)", () => {
    expect(
      computeFaceCropRect({
        imageWidth: 1600,
        imageHeight: 1200,
        ...PANEL,
        faceBoxes: [],
      }),
    ).toBe(null)
  })

  test("uses the MAXIMAL cover-crop window, not a zoomed-to-face one", () => {
    const cropRect = computeFaceCropRect({
      imageWidth: 1600,
      imageHeight: 1200,
      ...PANEL,
      faceBoxes: [
        { x1: 0.45, y1: 0.45, x2: 0.55, y2: 0.55 },
      ],
    })

    expect(cropRect).not.toBe(null)
    if (cropRect) {
      // 1600×1200 is taller than 800×480, so the maximal window is the
      // full width — a small centered face must NOT shrink the crop.
      expect(cropRect.width).toBe(1600)
      expect(cropRect.height).toBe(960)
      expect(cropRect.top).toBe(120)
      // The face (720..880 x, 540..660 y) sits inside the crop.
      expect(cropRect.left).toBeLessThanOrEqual(720)
      expect(
        cropRect.left + cropRect.width,
      ).toBeGreaterThanOrEqual(880)
      expect(cropRect.top).toBeLessThanOrEqual(540)
      expect(
        cropRect.top + cropRect.height,
      ).toBeGreaterThanOrEqual(660)
    }
  })

  test("shifts the crop up for a portrait shot with faces at the top", () => {
    const cropRect = computeFaceCropRect({
      imageWidth: 1200,
      imageHeight: 1600,
      ...PANEL,
      faceBoxes: [
        { x1: 0.2, y1: 0.05, x2: 0.45, y2: 0.2 },
        { x1: 0.55, y1: 0.08, x2: 0.8, y2: 0.22 },
      ],
    })

    expect(cropRect).not.toBe(null)
    if (cropRect) {
      // Maximal window is full-width (1200×720). A centered crop would
      // start at y=440 and decapitate everyone; it must shift up so the
      // padded face union (top ≈ 44) is inside.
      expect(cropRect.width).toBe(1200)
      expect(cropRect.height).toBe(720)
      expect(cropRect.top).toBeLessThanOrEqual(44)
    }
  })

  test("keeps far-apart faces by widening to the window, not zooming", () => {
    const cropRect = computeFaceCropRect({
      imageWidth: 1000,
      imageHeight: 1000,
      ...PANEL,
      faceBoxes: [
        { x1: 0.02, y1: 0.4, x2: 0.2, y2: 0.6 },
        { x1: 0.8, y1: 0.4, x2: 0.98, y2: 0.6 },
      ],
    })

    // The maximal window (1000×600) can hold both faces, so this crops.
    expect(cropRect).not.toBe(null)
    if (cropRect) {
      expect(cropRect.left).toBe(0)
      expect(cropRect.width).toBe(1000)
      expect(cropRect.top).toBeLessThanOrEqual(400)
      expect(
        cropRect.top + cropRect.height,
      ).toBeGreaterThanOrEqual(600)
    }
  })

  test("returns null when faces span taller than the maximal window", () => {
    expect(
      computeFaceCropRect({
        imageWidth: 1000,
        imageHeight: 1000,
        ...PANEL,
        faceBoxes: [
          { x1: 0.4, y1: 0.02, x2: 0.6, y2: 0.2 },
          { x1: 0.4, y1: 0.8, x2: 0.6, y2: 0.98 },
        ],
      }),
    ).toBe(null)
  })

  test("fill: fills the panel (never null) when faces span too far", () => {
    // Same faces that make computeFaceCropRect letterbox (return null): here
    // fill must still return a crop that fills the panel, centred on the mass.
    const cropRect = computeFillCropRect({
      imageWidth: 1000,
      imageHeight: 1000,
      ...PANEL,
      faceBoxes: [
        { x1: 0.4, y1: 0.02, x2: 0.6, y2: 0.2 },
        { x1: 0.4, y1: 0.8, x2: 0.6, y2: 0.98 },
      ],
    })
    // Maximal window is 1000×600; the crop fills that, centred vertically on
    // the face mass (midpoint ≈ y 500 → top ≈ 200).
    expect(cropRect.width).toBe(1000)
    expect(cropRect.height).toBe(600)
    expect(cropRect.top).toBe(200)
  })

  test("fill: centre cover-crop when there are no faces", () => {
    const cropRect = computeFillCropRect({
      imageWidth: 1200,
      imageHeight: 1600,
      ...PANEL,
      faceBoxes: [],
    })
    // 1200×1600 portrait into 800×480 landscape → full-width 1200×720 band,
    // vertically centred (top = (1600-720)/2 = 440).
    expect(cropRect.width).toBe(1200)
    expect(cropRect.height).toBe(720)
    expect(cropRect.top).toBe(440)
  })

  test("fill: shifts up to keep faces at the top of a portrait", () => {
    const cropRect = computeFillCropRect({
      imageWidth: 1200,
      imageHeight: 1600,
      ...PANEL,
      faceBoxes: [
        { x1: 0.2, y1: 0.05, x2: 0.45, y2: 0.2 },
        { x1: 0.55, y1: 0.08, x2: 0.8, y2: 0.22 },
      ],
    })
    expect(cropRect.width).toBe(1200)
    expect(cropRect.height).toBe(720)
    // The faces fit the 720-tall window, so it shifts up to include them.
    expect(cropRect.top).toBeLessThanOrEqual(44)
  })

  test("dual-portrait columns + gutter sum to the full width (even)", () => {
    const columns = computeDualPortraitColumns({
      targetWidth: 800,
      gutterPixels: 8,
    })
    expect(columns.leftWidth).toBe(396)
    expect(columns.rightWidth).toBe(396)
    expect(columns.rightLeftOffset).toBe(404)
    expect(columns.leftWidth + 8 + columns.rightWidth).toBe(
      800,
    )
  })

  test("dual-portrait left column absorbs the odd remainder", () => {
    const columns = computeDualPortraitColumns({
      targetWidth: 1601,
      gutterPixels: 10,
    })
    // usable 1591 → left ceil(795.5)=796, right 795, right offset 806.
    expect(columns.leftWidth).toBe(796)
    expect(columns.rightWidth).toBe(795)
    expect(columns.rightLeftOffset).toBe(806)
    expect(
      columns.leftWidth + 10 + columns.rightWidth,
    ).toBe(1601)
  })

  test("mat: the gutter splits the VISIBLE window into equal halves", () => {
    const columns = computeDualPortraitColumns({
      targetWidth: 800,
      gutterPixels: 8,
      visibleInset: KITCHEN_MAT,
    })

    // Visible window 678 px wide → two 335 px halves and the 8 px gutter.
    expect(columns.leftWidth).toBe(394)
    expect(columns.rightWidth).toBe(398)
    expect(columns.rightLeftOffset).toBe(402)
    // Both columns still reach a panel edge, so no white peeks past the mat.
    expect(columns.leftWidth + 8 + columns.rightWidth).toBe(
      800,
    )
    // What the owner actually sees: two equal halves.
    const leftVisible = columns.leftWidth - KITCHEN_MAT.left
    const rightVisible =
      800 - KITCHEN_MAT.right - columns.rightLeftOffset
    expect(leftVisible).toBe(335)
    expect(rightVisible).toBe(335)
  })

  test("mat: fill centres the VISIBLE box, not the panel, with no faces", () => {
    const withoutMat = computeFillCropRect({
      imageWidth: 1200,
      imageHeight: 1600,
      ...PANEL,
      faceBoxes: [],
    })
    const withMat = computeFillCropRect({
      imageWidth: 1200,
      imageHeight: 1600,
      ...PANEL,
      faceBoxes: [],
      visibleInset: KITCHEN_MAT,
    })

    expect(withoutMat.top).toBe(440)
    // The mat hides more at the top (36 px) than the bottom (28 px), so the
    // window shifts up to keep the visible slice centred on the image.
    expect(withMat.top).toBe(434)
    expect(withMat.height).toBe(withoutMat.height)
  })

  test("mat: fill shifts so the face clears the mat, not the panel edge", () => {
    const faceBoxes = [
      { x1: 0.1, y1: 0.4, x2: 0.16, y2: 0.6 },
    ]
    const withoutMat = computeFillCropRect({
      imageWidth: 2000,
      imageHeight: 600,
      ...PANEL,
      faceBoxes,
    })
    const withMat = computeFillCropRect({
      imageWidth: 2000,
      imageHeight: 600,
      ...PANEL,
      faceBoxes,
      visibleInset: KITCHEN_MAT,
    })

    // Maximal window is 1000×600 either way — the mat never zooms the crop.
    expect(withoutMat.width).toBe(1000)
    expect(withMat.width).toBe(1000)
    // Without the mat the padded face (from x 182) sits flush at the window's
    // left edge — i.e. under 73.75 image px of mat. With it, the window shifts
    // left so the face clears the mat.
    expect(withoutMat.left).toBe(182)
    expect(withMat.left).toBe(108)
    const matInImagePixels =
      (KITCHEN_MAT.left * withMat.width) / PANEL.targetWidth
    expect(
      withMat.left + matInImagePixels,
    ).toBeLessThanOrEqual(182)
  })

  test("mat: letterboxes when the faces fit the window but not its visible part", () => {
    const faceBoxes = [
      { x1: 0.4, y1: 0.24, x2: 0.6, y2: 0.3 },
      { x1: 0.4, y1: 0.61, x2: 0.6, y2: 0.67 },
    ]
    const image = { imageWidth: 1000, imageHeight: 1000 }

    // Padded span is 559 px: inside the 600 px window…
    expect(
      computeFaceCropRect({
        ...image,
        ...PANEL,
        faceBoxes,
      }),
    ).not.toBe(null)
    // …but outside the 520 px the mat leaves showing, so it letterboxes
    // rather than hide someone under the frame.
    expect(
      computeFaceCropRect({
        ...image,
        ...PANEL,
        faceBoxes,
        visibleInset: KITCHEN_MAT,
      }),
    ).toBe(null)
  })

  test("clamps the crop inside the image for an edge face", () => {
    const cropRect = computeFaceCropRect({
      imageWidth: 1600,
      imageHeight: 1200,
      ...PANEL,
      faceBoxes: [{ x1: 0.0, y1: 0.0, x2: 0.1, y2: 0.1 }],
    })

    expect(cropRect).not.toBe(null)
    if (cropRect) {
      expect(cropRect.left).toBeGreaterThanOrEqual(0)
      expect(cropRect.top).toBeGreaterThanOrEqual(0)
      expect(
        cropRect.left + cropRect.width,
      ).toBeLessThanOrEqual(1600)
      expect(
        cropRect.top + cropRect.height,
      ).toBeLessThanOrEqual(1200)
    }
  })
})
