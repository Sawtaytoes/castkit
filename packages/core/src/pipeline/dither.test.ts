import sharp from "sharp"
import { describe, expect, test } from "vitest"
import type { DitherAlgorithm } from "../devices/device.ts"
import {
  MONOCHROME_PALETTE,
  type Palette,
  SPECTRA6_DEFAULT_PALETTE,
} from "../panels/palette.ts"
import { ditherToPanel } from "./dither.ts"

/** A solid-color source PNG at the given size. */
const buildSolidPng = ({
  width,
  height,
  color,
}: {
  width: number
  height: number
  color: [number, number, number]
}): Promise<Buffer> =>
  sharp({
    create: {
      width,
      height,
      channels: 3,
      background: {
        r: color[0],
        g: color[1],
        b: color[2],
      },
    },
  })
    .png()
    .toBuffer()

/** Every distinct RGB triple present in a raw RGB(A) buffer. */
const collectColors = ({
  rgbaBuffer,
  channels,
}: {
  rgbaBuffer: Buffer
  channels: number
}): Set<string> =>
  new Set(
    Array.from({
      length: rgbaBuffer.length / channels,
    }).map((_unused, pixelIndex) => {
      const byteOffset = pixelIndex * channels
      return `${rgbaBuffer[byteOffset]},${rgbaBuffer[byteOffset + 1]},${rgbaBuffer[byteOffset + 2]}`
    }),
  )

const paletteKeys = (palette: Palette): Set<string> =>
  new Set(
    palette.map(
      (color) => `${color[0]},${color[1]},${color[2]}`,
    ),
  )

/**
 * A horizontal black→white gray ramp PNG: every pixel has equal RGB channels,
 * increasing left to right. The classic trigger for color speckle when
 * error-diffused across a color palette.
 */
const buildGrayRampPng = ({
  width,
  height,
}: {
  width: number
  height: number
}): Promise<Buffer> => {
  const rgbBuffer = Buffer.alloc(width * height * 3)

  Array.from({ length: width * height }).forEach(
    (_unused, pixelIndex) => {
      const columnIndex = pixelIndex % width
      const grayValue = Math.round(
        (columnIndex / (width - 1)) * 255,
      )
      const byteOffset = pixelIndex * 3

      rgbBuffer[byteOffset] = grayValue
      rgbBuffer[byteOffset + 1] = grayValue
      rgbBuffer[byteOffset + 2] = grayValue
    },
  )

  return sharp(rgbBuffer, {
    raw: { width, height, channels: 3 },
  })
    .png()
    .toBuffer()
}

/**
 * An anti-aliased-text-like fixture: a black rectangle on a white field with a
 * 1-px mid-gray border — the gray edge pixels a Lanczos downscale of text
 * produces.
 */
const buildOutlinedRectanglePng = ({
  width,
  height,
}: {
  width: number
  height: number
}): Promise<Buffer> => {
  const rgbBuffer = Buffer.alloc(width * height * 3, 255)

  const rectangleLeft = Math.floor(width / 4)
  const rectangleRight = Math.floor((width * 3) / 4)
  const rectangleTop = Math.floor(height / 4)
  const rectangleBottom = Math.floor((height * 3) / 4)

  Array.from({ length: width * height }).forEach(
    (_unused, pixelIndex) => {
      const columnIndex = pixelIndex % width
      const rowIndex = Math.floor(pixelIndex / width)

      const isInsideOutline =
        columnIndex >= rectangleLeft &&
        columnIndex <= rectangleRight &&
        rowIndex >= rectangleTop &&
        rowIndex <= rectangleBottom

      const isInsideFill =
        columnIndex > rectangleLeft &&
        columnIndex < rectangleRight &&
        rowIndex > rectangleTop &&
        rowIndex < rectangleBottom

      const grayValue = isInsideFill
        ? 0
        : isInsideOutline
          ? 128
          : 255
      const byteOffset = pixelIndex * 3

      rgbBuffer[byteOffset] = grayValue
      rgbBuffer[byteOffset + 1] = grayValue
      rgbBuffer[byteOffset + 2] = grayValue
    },
  )

  return sharp(rgbBuffer, {
    raw: { width, height, channels: 3 },
  })
    .png()
    .toBuffer()
}

/** How many pixels in a raw RGB(A) buffer exactly match a palette color. */
const countMatchingPixels = ({
  rgbaBuffer,
  channels,
  color,
}: {
  rgbaBuffer: Buffer
  channels: number
  color: readonly [number, number, number]
}) =>
  Array.from({
    length: rgbaBuffer.length / channels,
  }).filter((_unused, pixelIndex) => {
    const byteOffset = pixelIndex * channels

    return (
      rgbaBuffer[byteOffset] === color[0] &&
      rgbaBuffer[byteOffset + 1] === color[1] &&
      rgbaBuffer[byteOffset + 2] === color[2]
    )
  }).length

/**
 * The E Ink Spectra 6 default palette's black and white entries (its darkest/lightest by
 * luminance): pure black and the 0.5-blend white. Neutral-protected output
 * must contain nothing else.
 */
const SPECTRA6_BLACK_AND_WHITE_KEYS = new Set([
  "0,0,0",
  "208,210,210",
])

const ALGORITHMS: DitherAlgorithm[] = [
  "threshold",
  "ordered",
  "floyd-steinberg",
  "atkinson",
  "stucki",
  "sierra",
]

describe("ditherToPanel", () => {
  test("outputs the requested panel dimensions", async () => {
    const source = await buildSolidPng({
      width: 40,
      height: 20,
      color: [120, 180, 60],
    })

    const output = await ditherToPanel({
      imageBuffer: source,
      width: 20,
      height: 10,
      palette: MONOCHROME_PALETTE,
      algorithm: "floyd-steinberg",
    })

    const metadata = await sharp(output).metadata()
    expect(metadata.width).toBe(20)
    expect(metadata.height).toBe(10)
  })

  // A portrait-mounted panel renders portrait then rotates onto the panel's
  // native landscape buffer — the output must land at height × width, on the
  // full-color "off" path and the dithered path alike.
  test.each([
    "off",
    "floyd-steinberg",
  ] as const satisfies ReadonlyArray<DitherAlgorithm>)('rotation 90 emits panel-native landscape dimensions (algorithm "%s")', async (algorithm) => {
    const source = await buildSolidPng({
      width: 30,
      height: 40,
      color: [120, 180, 60],
    })

    const output = await ditherToPanel({
      imageBuffer: source,
      width: 30,
      height: 40,
      palette: SPECTRA6_DEFAULT_PALETTE,
      algorithm,
      rotation: 90,
    })

    const metadata = await sharp(output).metadata()
    expect(metadata.width).toBe(40)
    expect(metadata.height).toBe(30)
  })

  test("every algorithm emits only palette colors (mono + E Ink Spectra 6)", async () => {
    const source = await buildSolidPng({
      width: 60,
      height: 40,
      color: [130, 90, 200],
    })

    await Promise.all(
      (
        [
          { palette: MONOCHROME_PALETTE },
          { palette: SPECTRA6_DEFAULT_PALETTE },
        ] as const
      ).flatMap(({ palette }) =>
        ALGORITHMS.map(async (algorithm) => {
          const output = await ditherToPanel({
            imageBuffer: source,
            width: 30,
            height: 20,
            palette,
            algorithm,
          })

          const { data, info } = await sharp(output)
            .raw()
            .toBuffer({ resolveWithObject: true })

          const colors = collectColors({
            rgbaBuffer: data,
            channels: info.channels,
          })
          const allowed = paletteKeys(palette)

          colors.forEach((color) => {
            expect(allowed.has(color)).toBe(true)
          })
        }),
      ),
    )
  })

  test("a gray ramp dithered to E Ink Spectra 6 stays black/white — no color speckle", async () => {
    const source = await buildGrayRampPng({
      width: 160,
      height: 40,
    })

    const output = await ditherToPanel({
      imageBuffer: source,
      width: 80,
      height: 20,
      palette: SPECTRA6_DEFAULT_PALETTE,
      algorithm: "floyd-steinberg",
    })

    const { data, info } = await sharp(output)
      .raw()
      .toBuffer({ resolveWithObject: true })

    const colors = collectColors({
      rgbaBuffer: data,
      channels: info.channels,
    })

    colors.forEach((color) => {
      expect(SPECTRA6_BLACK_AND_WHITE_KEYS.has(color)).toBe(
        true,
      )
    })
  })

  test("neutral protection does not desaturate a saturated solid red", async () => {
    const source = await buildSolidPng({
      width: 60,
      height: 40,
      color: [255, 0, 0],
    })

    const output = await ditherToPanel({
      imageBuffer: source,
      width: 30,
      height: 20,
      palette: SPECTRA6_DEFAULT_PALETTE,
      algorithm: "floyd-steinberg",
    })

    const { data, info } = await sharp(output)
      .raw()
      .toBuffer({ resolveWithObject: true })

    const colors = collectColors({
      rgbaBuffer: data,
      channels: info.channels,
    })

    const paletteRed = SPECTRA6_DEFAULT_PALETTE[3]
    const paletteRedKey = `${paletteRed[0]},${paletteRed[1]},${paletteRed[2]}`

    expect(colors).toEqual(new Set([paletteRedKey]))
  })

  test("anti-aliased-text-like gray edges dither to only black/white on E Ink Spectra 6", async () => {
    const source = await buildOutlinedRectanglePng({
      width: 120,
      height: 80,
    })

    const output = await ditherToPanel({
      imageBuffer: source,
      width: 60,
      height: 40,
      palette: SPECTRA6_DEFAULT_PALETTE,
      algorithm: "floyd-steinberg",
    })

    const { data, info } = await sharp(output)
      .raw()
      .toBuffer({ resolveWithObject: true })

    const colors = collectColors({
      rgbaBuffer: data,
      channels: info.channels,
    })

    colors.forEach((color) => {
      expect(SPECTRA6_BLACK_AND_WHITE_KEYS.has(color)).toBe(
        true,
      )
    })
  })

  test("brightness 1.5 lightens a mid-gray image on the mono palette", async () => {
    const source = await buildSolidPng({
      width: 40,
      height: 20,
      color: [128, 128, 128],
    })

    const renderWithAdjustments = async (adjustments?: {
      brightness?: number
    }) => {
      const output = await ditherToPanel({
        imageBuffer: source,
        width: 20,
        height: 10,
        palette: MONOCHROME_PALETTE,
        algorithm: "floyd-steinberg",
        adjustments,
      })

      const { data, info } = await sharp(output)
        .raw()
        .toBuffer({ resolveWithObject: true })

      return countMatchingPixels({
        rgbaBuffer: data,
        channels: info.channels,
        color: [255, 255, 255],
      })
    }

    const neutralWhiteCount = await renderWithAdjustments()
    const brightenedWhiteCount =
      await renderWithAdjustments({ brightness: 1.5 })

    expect(brightenedWhiteCount).toBeGreaterThan(
      neutralWhiteCount,
    )
  })

  describe('full-color "off" encoding', () => {
    /**
     * A photographic-ish source: a smooth multi-hue gradient that a lossless
     * RGB PNG can't compress but a lossy codec can — so the size assertions
     * below are meaningful, not artefacts of a flat solid color.
     */
    const buildGradientPng = ({
      width,
      height,
    }: {
      width: number
      height: number
    }): Promise<Buffer> => {
      const raw = Buffer.alloc(width * height * 3)
      Array.from({ length: width * height }).forEach(
        (_unused, pixelIndex) => {
          const columnIndex = pixelIndex % width
          const rowIndex = Math.floor(pixelIndex / width)
          const offset = pixelIndex * 3
          raw[offset] = Math.floor(
            (columnIndex * 255) / width,
          )
          raw[offset + 1] = Math.floor(
            (rowIndex * 255) / height,
          )
          raw[offset + 2] = Math.floor(
            (Math.sin(columnIndex / 7) + 1) * 127,
          )
        },
      )
      return sharp(raw, {
        raw: { width, height, channels: 3 },
      })
        .png()
        .toBuffer()
    }

    test("off defaults to a full-color PNG at panel size", async () => {
      const source = await buildGradientPng({
        width: 160,
        height: 96,
      })

      const output = await ditherToPanel({
        imageBuffer: source,
        width: 80,
        height: 48,
        palette: SPECTRA6_DEFAULT_PALETTE,
        algorithm: "off",
      })

      const metadata = await sharp(output).metadata()
      expect(metadata.format).toBe("png")
      expect(metadata.width).toBe(80)
      expect(metadata.height).toBe(48)
    })

    test.each([
      "webp",
      "jpeg",
    ] as const)("off encodes as %s, decodes at panel size, and is smaller than the PNG", async (format) => {
      const source = await buildGradientPng({
        width: 320,
        height: 192,
      })
      const common = {
        imageBuffer: source,
        width: 160,
        height: 96,
        palette: SPECTRA6_DEFAULT_PALETTE,
        algorithm: "off",
      } as const

      const pngOutput = await ditherToPanel(common)
      const lossyOutput = await ditherToPanel({
        ...common,
        fullColorEncoding: { format, quality: 80 },
      })

      const metadata = await sharp(lossyOutput).metadata()
      expect(metadata.format).toBe(format)
      expect(metadata.width).toBe(160)
      expect(metadata.height).toBe(96)
      expect(lossyOutput.length).toBeLessThan(
        pngOutput.length,
      )
    })

    test("dithered (non-off) output ignores fullColorEncoding and stays PNG", async () => {
      const source = await buildGradientPng({
        width: 160,
        height: 96,
      })

      const output = await ditherToPanel({
        imageBuffer: source,
        width: 80,
        height: 48,
        palette: SPECTRA6_DEFAULT_PALETTE,
        algorithm: "floyd-steinberg",
        fullColorEncoding: { format: "webp", quality: 80 },
      })

      const metadata = await sharp(output).metadata()
      expect(metadata.format).toBe("png")
    })
  })
})
