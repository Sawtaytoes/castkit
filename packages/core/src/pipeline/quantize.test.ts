import { describe, expect, test } from "vitest"
import {
  E6_DEFAULT_PALETTE,
  MONO_PALETTE,
  type Palette,
} from "../panels/palette.ts"
import { quantizeRgbaToPalette } from "./quantize.ts"

/** A flat field of one RGB colour, as the RGBA pixels the quantizer takes. */
const buildSolidPixels = ({
  width,
  height,
  colour,
}: {
  width: number
  height: number
  colour: [number, number, number]
}) => {
  const pixels = new Uint8ClampedArray(width * height * 4)
  Array.from({ length: width * height }).forEach(
    (_unused, pixelIndex) => {
      const byteOffset = pixelIndex * 4
      pixels[byteOffset] = colour[0]
      pixels[byteOffset + 1] = colour[1]
      pixels[byteOffset + 2] = colour[2]
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
const collectColours = (pixels: Uint8ClampedArray) =>
  Array.from({ length: pixels.length / 4 })
    .map((_unused, pixelIndex) =>
      [
        pixels[pixelIndex * 4],
        pixels[pixelIndex * 4 + 1],
        pixels[pixelIndex * 4 + 2],
      ].join(","),
    )
    .filter(
      (colour, index, colours) =>
        colours.indexOf(colour) === index,
    )

const getIsPaletteMember = ({
  colour,
  palette,
}: {
  colour: string
  palette: Palette
}) =>
  palette.some(
    (paletteColour) => paletteColour.join(",") === colour,
  )

describe("quantizeRgbaToPalette", () => {
  test("threshold snaps a light grey to white and a dark grey to black", () => {
    const width = 4
    const height = 4

    const lightResult = quantizeRgbaToPalette({
      rgbaPixels: buildSolidPixels({
        width,
        height,
        colour: [200, 200, 200],
      }),
      width,
      height,
      palette: MONO_PALETTE,
      algorithm: "threshold",
    })
    const darkResult = quantizeRgbaToPalette({
      rgbaPixels: buildSolidPixels({
        width,
        height,
        colour: [40, 40, 40],
      }),
      width,
      height,
      palette: MONO_PALETTE,
      algorithm: "threshold",
    })

    expect(collectColours(lightResult)).toEqual([
      "255,255,255",
    ])
    expect(collectColours(darkResult)).toEqual(["0,0,0"])
  })

  test("ordered varies neighbouring pixels on a flat field where threshold does not", () => {
    const width = 8
    const height = 8
    const midGrey = buildSolidPixels({
      width,
      height,
      colour: [128, 128, 128],
    })

    const thresholdResult = quantizeRgbaToPalette({
      rgbaPixels: midGrey,
      width,
      height,
      palette: MONO_PALETTE,
      algorithm: "threshold",
    })
    const orderedResult = quantizeRgbaToPalette({
      rgbaPixels: midGrey,
      width,
      height,
      palette: MONO_PALETTE,
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
    // 8×8 matrix differ, so the same input colour lands on different inks.
    expect(readAt(orderedResult, 0)).not.toEqual(
      readAt(orderedResult, 1),
    )
    expect(collectColours(orderedResult).sort()).toEqual([
      "0,0,0",
      "255,255,255",
    ])
  })

  test("every error-diffusion algorithm emits only palette colours", () => {
    const width = 8
    const height = 8
    const pixels = buildSolidPixels({
      width,
      height,
      colour: [120, 90, 160],
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
        palette: E6_DEFAULT_PALETTE,
        algorithm,
      })

      collectColours(result).forEach((colour) => {
        expect(
          getIsPaletteMember({
            colour,
            palette: E6_DEFAULT_PALETTE,
          }),
        ).toBe(true)
      })
    })
  })

  test("neutral protection keeps grey off the colour inks, but not saturated red", () => {
    const width = 8
    const height = 8

    // Chroma 0 — an anti-aliased text edge. Must resolve to the palette's
    // darkest/lightest ends only, or letter edges speckle red/green on glass.
    const neutralResult = quantizeRgbaToPalette({
      rgbaPixels: buildSolidPixels({
        width,
        height,
        colour: [128, 128, 128],
      }),
      width,
      height,
      palette: E6_DEFAULT_PALETTE,
      algorithm: "floyd-steinberg",
    })

    expect(collectColours(neutralResult).sort()).toEqual([
      "0,0,0",
      "208,210,210",
    ])

    // Chroma 170 — a genuine panel colour, which must still reach the red ink.
    const saturatedResult = quantizeRgbaToPalette({
      rgbaPixels: buildSolidPixels({
        width,
        height,
        colour: [200, 30, 30],
      }),
      width,
      height,
      palette: E6_DEFAULT_PALETTE,
      algorithm: "floyd-steinberg",
    })

    expect(collectColours(saturatedResult)).toContain(
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
        colour: [128, 128, 128],
      }),
      width,
      height,
      palette: MONO_PALETTE,
      algorithm: "atkinson",
    })

    collectColours(result).forEach((colour) => {
      expect(
        getIsPaletteMember({
          colour,
          palette: MONO_PALETTE,
        }),
      ).toBe(true)
    })
  })
})
