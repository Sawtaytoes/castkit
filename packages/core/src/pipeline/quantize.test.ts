import { describe, expect, test } from "vitest"
import {
  GRAYSCALE16_PALETTE,
  MONOCHROME_PALETTE,
  type Palette,
  SPECTRA6_DEFAULT_PALETTE,
} from "../panels/palette.ts"
import { quantizeRgbaToPalette } from "./quantize.ts"

/** A flat field of one RGB color, as the RGBA pixels the quantizer takes. */
const buildSolidPixels = ({
  width,
  height,
  color,
}: {
  width: number
  height: number
  color: [number, number, number]
}) => {
  const pixels = new Uint8ClampedArray(width * height * 4)
  Array.from({ length: width * height }).forEach(
    (_unused, pixelIndex) => {
      const byteOffset = pixelIndex * 4
      pixels[byteOffset] = color[0]
      pixels[byteOffset + 1] = color[1]
      pixels[byteOffset + 2] = color[2]
      pixels[byteOffset + 3] = 255
    },
  )
  return pixels
}

/** The RGB triple at one pixel coordinate. */
const readPixel = ({
  pixels,
  width,
  columnIndex,
  rowIndex,
}: {
  pixels: Uint8ClampedArray
  width: number
  columnIndex: number
  rowIndex: number
}) => {
  const byteOffset = (rowIndex * width + columnIndex) * 4
  return [
    pixels[byteOffset],
    pixels[byteOffset + 1],
    pixels[byteOffset + 2],
  ]
}

/** Every distinct RGB triple present in a quantized result. */
const collectColors = (pixels: Uint8ClampedArray) =>
  Array.from({ length: pixels.length / 4 })
    .map((_unused, pixelIndex) =>
      [
        pixels[pixelIndex * 4],
        pixels[pixelIndex * 4 + 1],
        pixels[pixelIndex * 4 + 2],
      ].join(","),
    )
    .filter(
      (color, index, colors) =>
        colors.indexOf(color) === index,
    )

const getIsPaletteMember = ({
  color,
  palette,
}: {
  color: string
  palette: Palette
}) =>
  palette.some(
    (paletteColor) => paletteColor.join(",") === color,
  )

describe("quantizeRgbaToPalette", () => {
  test("threshold snaps a light gray to white and a dark gray to black", () => {
    const width = 4
    const height = 4

    const lightResult = quantizeRgbaToPalette({
      rgbaPixels: buildSolidPixels({
        width,
        height,
        color: [200, 200, 200],
      }),
      width,
      height,
      palette: MONOCHROME_PALETTE,
      algorithm: "threshold",
    })
    const darkResult = quantizeRgbaToPalette({
      rgbaPixels: buildSolidPixels({
        width,
        height,
        color: [40, 40, 40],
      }),
      width,
      height,
      palette: MONOCHROME_PALETTE,
      algorithm: "threshold",
    })

    expect(collectColors(lightResult)).toEqual([
      "255,255,255",
    ])
    expect(collectColors(darkResult)).toEqual(["0,0,0"])
  })

  test("ordered varies neighboring pixels on a flat field where threshold does not", () => {
    const width = 8
    const height = 8
    const midGray = buildSolidPixels({
      width,
      height,
      color: [128, 128, 128],
    })

    const thresholdResult = quantizeRgbaToPalette({
      rgbaPixels: midGray,
      width,
      height,
      palette: MONOCHROME_PALETTE,
      algorithm: "threshold",
    })
    const orderedResult = quantizeRgbaToPalette({
      rgbaPixels: midGray,
      width,
      height,
      palette: MONOCHROME_PALETTE,
      algorithm: "ordered",
    })

    const readAt = (
      pixels: Uint8ClampedArray,
      columnIndex: number,
    ) =>
      readPixel({
        pixels,
        width,
        columnIndex,
        rowIndex: 0,
      })

    // Threshold has no spatial term: every pixel of a flat field is identical.
    expect(readAt(thresholdResult, 0)).toEqual(
      readAt(thresholdResult, 1),
    )
    // The Bayer bias is what makes `ordered` ordered — adjacent cells of the
    // 8×8 matrix differ, so the same input color lands on different inks.
    expect(readAt(orderedResult, 0)).not.toEqual(
      readAt(orderedResult, 1),
    )
    expect(collectColors(orderedResult).sort()).toEqual([
      "0,0,0",
      "255,255,255",
    ])
  })

  test("every error-diffusion algorithm emits only palette colors", () => {
    const width = 8
    const height = 8
    const pixels = buildSolidPixels({
      width,
      height,
      color: [120, 90, 160],
    })

    const algorithms = [
      "floyd-steinberg",
      "atkinson",
      "stucki",
      "sierra",
    ] as const

    algorithms.forEach((algorithm) => {
      const result = quantizeRgbaToPalette({
        rgbaPixels: pixels,
        width,
        height,
        palette: SPECTRA6_DEFAULT_PALETTE,
        algorithm,
      })

      collectColors(result).forEach((color) => {
        expect(
          getIsPaletteMember({
            color,
            palette: SPECTRA6_DEFAULT_PALETTE,
          }),
        ).toBe(true)
      })
    })
  })

  test("neutral protection keeps gray off the color inks, but not saturated red", () => {
    const width = 8
    const height = 8

    // Chroma 0 — an anti-aliased text edge. Must resolve to the palette's
    // darkest/lightest ends only, or letter edges speckle red/green on glass.
    const neutralResult = quantizeRgbaToPalette({
      rgbaPixels: buildSolidPixels({
        width,
        height,
        color: [128, 128, 128],
      }),
      width,
      height,
      palette: SPECTRA6_DEFAULT_PALETTE,
      algorithm: "floyd-steinberg",
    })

    expect(collectColors(neutralResult).sort()).toEqual([
      "0,0,0",
      "208,210,210",
    ])

    // Chroma 170 — a genuine panel color, which must still reach the red ink.
    const saturatedResult = quantizeRgbaToPalette({
      rgbaPixels: buildSolidPixels({
        width,
        height,
        color: [200, 30, 30],
      }),
      width,
      height,
      palette: SPECTRA6_DEFAULT_PALETTE,
      algorithm: "floyd-steinberg",
    })

    expect(collectColors(saturatedResult)).toContain(
      "206,36,38",
    )
  })

  test("a mono palette skips neutral protection and still only emits its two inks", () => {
    const width = 8
    const height = 8

    const result = quantizeRgbaToPalette({
      rgbaPixels: buildSolidPixels({
        width,
        height,
        color: [128, 128, 128],
      }),
      width,
      height,
      palette: MONOCHROME_PALETTE,
      algorithm: "atkinson",
    })

    collectColors(result).forEach((color) => {
      expect(
        getIsPaletteMember({
          color,
          palette: MONOCHROME_PALETTE,
        }),
      ).toBe(true)
    })
  })
})

describe("GRAYSCALE16_PALETTE", () => {
  test("has sixteen neutral levels 17 apart, black first and white last", () => {
    expect(GRAYSCALE16_PALETTE).toHaveLength(16)
    GRAYSCALE16_PALETTE.forEach((color, levelIndex) => {
      expect(color).toEqual([
        levelIndex * 17,
        levelIndex * 17,
        levelIndex * 17,
      ])
    })
    expect(GRAYSCALE16_PALETTE[0]).toEqual([0, 0, 0])
    expect(GRAYSCALE16_PALETTE[15]).toEqual([255, 255, 255])
  })

  test("every level survives the firmware's top-nibble read as its own step", () => {
    // The it8951e patch keeps `value >> 4`; a level that rounded onto a
    // neighbour would collapse two server-side grays into one panel step.
    GRAYSCALE16_PALETTE.forEach((color, levelIndex) => {
      expect(color[0] >> 4).toBe(levelIndex)
    })
  })

  test("threshold lands a mid gray on one flat level instead of a two-tone dither", () => {
    const width = 8
    const height = 8

    const result = quantizeRgbaToPalette({
      rgbaPixels: buildSolidPixels({
        width,
        height,
        color: [128, 128, 128],
      }),
      width,
      height,
      palette: GRAYSCALE16_PALETTE,
      algorithm: "threshold",
    })

    // 128 sits between levels 7 (119) and 8 (136); the nearest is 136.
    expect(collectColors(result)).toEqual(["136,136,136"])
  })

  test("floyd-steinberg on a mid gray stays within one step of the source", () => {
    const width = 8
    const height = 8

    const result = quantizeRgbaToPalette({
      rgbaPixels: buildSolidPixels({
        width,
        height,
        color: [128, 128, 128],
      }),
      width,
      height,
      palette: GRAYSCALE16_PALETTE,
      algorithm: "floyd-steinberg",
    })

    // Error diffusion may alternate the two neighbouring levels; it must
    // never reach for black or white the way the mono palette forces it to.
    collectColors(result).forEach((color) => {
      expect(["119,119,119", "136,136,136"]).toContain(
        color,
      )
    })
  })
})
