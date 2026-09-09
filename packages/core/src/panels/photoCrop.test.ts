import { describe, expect, test } from "vitest"

import {
  applyPhotoCrop,
  getHasPhotoCrop,
  NO_PHOTO_CROP,
  resolveCropBand,
} from "./photoCrop.ts"

// The kitchen panel's visible box: 800x480 minus the mat.
const TARGET = { targetWidth: 678, targetHeight: 416 }
const RECT = {
  left: 100,
  top: 200,
  width: 3000,
  height: 1840,
}

describe("resolveCropBand", () => {
  test("no crop keeps the whole frame", () => {
    expect(
      resolveCropBand({ crop: NO_PHOTO_CROP, ...TARGET }),
    ).toEqual({
      keptFraction: 1,
      leftShare: 0.5,
      topShare: 0.5,
    })
  })

  test("the bigger of the two axes decides the zoom", () => {
    // 10% asked for across, 25% asked for down -> both axes lose 25%, or the
    // photo would have to stretch to fill the frame again.
    const band = resolveCropBand({
      crop: {
        top: 104,
        bottom: 0,
        left: 33.9,
        right: 33.9,
      },
      ...TARGET,
    })
    expect(band.keptFraction).toBeCloseTo(0.75, 5)
  })

  test("a one-sided crop pushes the kept band away from that edge", () => {
    const band = resolveCropBand({
      crop: { ...NO_PHOTO_CROP, bottom: 41.6 },
      ...TARGET,
    })
    expect(band.keptFraction).toBeCloseTo(0.9, 5)
    // Nothing was cut off the top, so the band sits flush with it.
    expect(band.topShare).toBe(0)
    // Nothing was asked for across, so that axis's forced trim splits evenly.
    expect(band.leftShare).toBe(0.5)
  })

  test("an absurd crop cannot collapse the photo", () => {
    const band = resolveCropBand({
      crop: { top: 400, bottom: 400, left: 0, right: 0 },
      ...TARGET,
    })
    expect(band.keptFraction).toBeCloseTo(0.2, 5)
  })
})

describe("applyPhotoCrop", () => {
  test("no crop returns the very same rectangle", () => {
    expect(
      applyPhotoCrop({
        crop: NO_PHOTO_CROP,
        rect: RECT,
        ...TARGET,
      }),
    ).toBe(RECT)
  })

  test("the kept rectangle holds the source aspect, so nothing stretches", () => {
    const cropped = applyPhotoCrop({
      crop: { ...NO_PHOTO_CROP, bottom: 41.6 },
      rect: RECT,
      ...TARGET,
    })
    expect(cropped.width / cropped.height).toBeCloseTo(
      RECT.width / RECT.height,
      3,
    )
  })

  test("cropping the bottom keeps the top edge and drops the bottom", () => {
    const cropped = applyPhotoCrop({
      crop: { ...NO_PHOTO_CROP, bottom: 41.6 },
      rect: RECT,
      ...TARGET,
    })
    expect(cropped.top).toBe(RECT.top)
    expect(cropped.height).toBe(1656)
    // The forced horizontal trim came off both sides evenly.
    expect(cropped.left).toBe(250)
    expect(cropped.width).toBe(2700)
  })

  test("the kept rectangle never leaves the source rectangle", () => {
    const cropped = applyPhotoCrop({
      crop: {
        top: 200,
        right: 200,
        bottom: 200,
        left: 200,
      },
      rect: RECT,
      ...TARGET,
    })
    expect(cropped.left).toBeGreaterThanOrEqual(RECT.left)
    expect(cropped.top).toBeGreaterThanOrEqual(RECT.top)
    expect(
      cropped.left + cropped.width,
    ).toBeLessThanOrEqual(RECT.left + RECT.width)
    expect(
      cropped.top + cropped.height,
    ).toBeLessThanOrEqual(RECT.top + RECT.height)
  })
})

describe("getHasPhotoCrop", () => {
  test("an untouched crop reads as no crop", () => {
    expect(getHasPhotoCrop(NO_PHOTO_CROP)).toBe(false)
  })

  test("one edge is enough", () => {
    expect(
      getHasPhotoCrop({ ...NO_PHOTO_CROP, left: 1 }),
    ).toBe(true)
  })
})
