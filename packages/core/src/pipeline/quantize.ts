import { applyPaletteSync, utils } from "image-q"
import type { DitherAlgorithm } from "../devices/device.ts"
import type {
  Palette,
  RgbColor,
} from "../panels/palette.ts"

/**
 * Palette quantization — the pure half of the panel pipeline: pixels in,
 * pixels out.
 *
 * This module must stay free of `sharp`, `Buffer` and every other Node
 * built-in, because two very different callers share it and must not drift:
 * the server (`ditherToPanel`, handing over sharp's raw RGBA) and the browser
 * preview (Storybook, handing over a canvas `ImageData`). Resize, rotation and
 * encoding are the caller's business; nothing here knows what an image file is.
 *
 * Error-diffusion kernels (floyd-steinberg, atkinson, stucki, sierra) are
 * delegated to `image-q`; `threshold` (nearest palette color) and `ordered`
 * (nearest color with an 8×8 Bayer bias) are implemented here because
 * `image-q` has no ordered kernel.
 */

/** image-q's error-diffusion kernels, keyed by our algorithm names. */
const DIFFUSION_QUANTIZERS = {
  "floyd-steinberg": "floyd-steinberg",
  atkinson: "atkinson",
  stucki: "stucki",
  sierra: "sierra",
} as const

type DiffusionAlgorithm = keyof typeof DIFFUSION_QUANTIZERS

/** Every algorithm except `"off"`, which is an encoding choice, not a quantization. */
export type QuantizeAlgorithm = Exclude<
  DitherAlgorithm,
  "off"
>

const getIsDiffusionAlgorithm = (
  algorithm: QuantizeAlgorithm,
): algorithm is DiffusionAlgorithm =>
  algorithm in DIFFUSION_QUANTIZERS

/**
 * Chroma (max channel − min channel) at or below which a pixel counts as
 * neutral (gray). Anti-aliased text edges sit well under this; genuine panel
 * colors sit well above it.
 */
const NEUTRAL_CHROMA_THRESHOLD = 26

/** Rec. 601 luminance of a palette color. */
const getLuminance = (color: RgbColor) =>
  color[0] * 0.299 + color[1] * 0.587 + color[2] * 0.114

/**
 * Normalized 8×8 Bayer threshold matrix (values in −0.5…+0.5). Added to each
 * channel before the nearest-color lookup so `ordered` dithering spreads
 * quantization error spatially instead of diffusing it.
 */
const BAYER_8X8 = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
].map((matrixRow) =>
  matrixRow.map((cellValue) => cellValue / 64 - 0.5),
)

/** Squared Euclidean distance between an RGB sample and a palette color. */
const getColorDistanceSquared = ({
  red,
  green,
  blue,
  color,
}: {
  red: number
  green: number
  blue: number
  color: RgbColor
}) => {
  const redDelta = red - color[0]
  const greenDelta = green - color[1]
  const blueDelta = blue - color[2]

  return (
    redDelta * redDelta +
    greenDelta * greenDelta +
    blueDelta * blueDelta
  )
}

/** Index of the palette entry nearest to the given RGB sample. */
const findNearestColorIndex = ({
  red,
  green,
  blue,
  palette,
}: {
  red: number
  green: number
  blue: number
  palette: Palette
}) =>
  palette.reduce(
    (nearest, color, colorIndex) => {
      const distance = getColorDistanceSquared({
        red,
        green,
        blue,
        color,
      })

      return distance < nearest.distance
        ? { colorIndex, distance }
        : nearest
    },
    { colorIndex: 0, distance: Number.POSITIVE_INFINITY },
  ).colorIndex

/**
 * Nearest-color quantization with an optional per-pixel bias. With no bias
 * this is plain `threshold`; with the Bayer bias it is `ordered` dithering.
 * Operates on a flat RGBA buffer and writes the chosen palette color back.
 */
const quantizeWithBias = ({
  rgbaPixels,
  width,
  height,
  palette,
  hasOrderedBias,
}: {
  rgbaPixels: Uint8ClampedArray
  width: number
  height: number
  palette: Palette
  hasOrderedBias: boolean
}) => {
  const outputPixels = new Uint8ClampedArray(
    rgbaPixels.length,
  )

  // A pixel-index range, mapped functionally (no imperative loop per house rules).
  Array.from({ length: width * height }).forEach(
    (_unused, pixelIndex) => {
      const byteOffset = pixelIndex * 4
      const columnIndex = pixelIndex % width
      const rowIndex = Math.floor(pixelIndex / width)

      const bias = hasOrderedBias
        ? BAYER_8X8[rowIndex % 8][columnIndex % 8] * 255
        : 0

      const clamp = (channelValue: number) =>
        Math.max(0, Math.min(255, channelValue + bias))

      const colorIndex = findNearestColorIndex({
        red: clamp(rgbaPixels[byteOffset]),
        green: clamp(rgbaPixels[byteOffset + 1]),
        blue: clamp(rgbaPixels[byteOffset + 2]),
        palette,
      })

      const color = palette[colorIndex]
      outputPixels[byteOffset] = color[0]
      outputPixels[byteOffset + 1] = color[1]
      outputPixels[byteOffset + 2] = color[2]
      outputPixels[byteOffset + 3] = 255
    },
  )

  return outputPixels
}

/** Error-diffusion dithering to a fixed palette via image-q. */
const quantizeWithDiffusion = ({
  rgbaPixels,
  width,
  height,
  palette,
  algorithm,
}: {
  rgbaPixels: Uint8ClampedArray
  width: number
  height: number
  palette: Palette
  algorithm: DiffusionAlgorithm
}) => {
  const inputPointContainer =
    utils.PointContainer.fromUint8Array(
      // `Buffer` is a `Uint8Array`, so the server's raw pixels pass through
      // here with no copy; a canvas `ImageData.data` does too.
      new Uint8Array(
        rgbaPixels.buffer,
        rgbaPixels.byteOffset,
        rgbaPixels.byteLength,
      ),
      width,
      height,
    )

  const fixedPalette = new utils.Palette()
  palette.forEach((color) => {
    fixedPalette.add(
      utils.Point.createByRGBA(
        color[0],
        color[1],
        color[2],
        255,
      ),
    )
  })

  const outputPointContainer = applyPaletteSync(
    inputPointContainer,
    fixedPalette,
    {
      colorDistanceFormula: "euclidean",
      imageQuantization: DIFFUSION_QUANTIZERS[algorithm],
    },
  )

  return new Uint8ClampedArray(
    outputPointContainer.toUint8Array(),
  )
}

/** Quantize a raw RGBA buffer to a palette with the chosen algorithm. */
const quantizeToPalette = ({
  rgbaPixels,
  width,
  height,
  palette,
  algorithm,
}: {
  rgbaPixels: Uint8ClampedArray
  width: number
  height: number
  palette: Palette
  algorithm: QuantizeAlgorithm
}) =>
  getIsDiffusionAlgorithm(algorithm)
    ? quantizeWithDiffusion({
        rgbaPixels,
        width,
        height,
        palette,
        algorithm,
      })
    : quantizeWithBias({
        rgbaPixels,
        width,
        height,
        palette,
        hasOrderedBias: algorithm === "ordered",
      })

/**
 * The palette's darkest and lightest entries by luminance — the black/white
 * sub-palette neutral pixels are quantized against. Derived rather than
 * hardcoded so any palette containing near-black and near-white works.
 */
const getMonochromeSubPalette = (
  palette: Palette,
): Palette => [
  palette.reduce((darkestColor, color) =>
    getLuminance(color) < getLuminance(darkestColor)
      ? color
      : darkestColor,
  ),
  palette.reduce((lightestColor, color) =>
    getLuminance(color) > getLuminance(lightestColor)
      ? color
      : lightestColor,
  ),
]

/**
 * Quantize with neutral protection: near-neutral (gray) pixels are dithered
 * against only the palette's black/white ends; everything else against the
 * full palette. Without this, error diffusion sprays the gray anti-aliased
 * edges of text across the color palette — red/green speckle lines along
 * letter edges on the physical panel. Keeping neutrals on the monochrome axis
 * eliminates that fringing without desaturating genuine color.
 */
const quantizeWithNeutralProtection = ({
  rgbaPixels,
  width,
  height,
  palette,
  algorithm,
}: {
  rgbaPixels: Uint8ClampedArray
  width: number
  height: number
  palette: Palette
  algorithm: QuantizeAlgorithm
}) => {
  const fullPalettePixels = quantizeToPalette({
    rgbaPixels,
    width,
    height,
    palette,
    algorithm,
  })

  const monochromePixels = quantizeToPalette({
    rgbaPixels,
    width,
    height,
    palette: getMonochromeSubPalette(palette),
    algorithm,
  })

  const outputPixels = new Uint8ClampedArray(
    rgbaPixels.length,
  )

  Array.from({ length: width * height }).forEach(
    (_unused, pixelIndex) => {
      const byteOffset = pixelIndex * 4
      const red = rgbaPixels[byteOffset]
      const green = rgbaPixels[byteOffset + 1]
      const blue = rgbaPixels[byteOffset + 2]

      const chroma =
        Math.max(red, green, blue) -
        Math.min(red, green, blue)
      const isNeutral = chroma <= NEUTRAL_CHROMA_THRESHOLD

      const sourcePixels = isNeutral
        ? monochromePixels
        : fullPalettePixels

      outputPixels.set(
        sourcePixels.subarray(byteOffset, byteOffset + 4),
        byteOffset,
      )
    },
  )

  return outputPixels
}

/**
 * Whether any ink in the palette carries hue. Neutral protection exists to
 * keep gray pixels off the colored inks; a palette of grays has none, and
 * gating on `palette.length > 2` instead collapsed the 16-level M5Paper to
 * black and white — every one of its entries is neutral, so every pixel was
 * "protected" onto the two ends.
 */
const getHasChromaticInk = (palette: Palette) =>
  palette.some(
    (color) =>
      Math.max(color[0], color[1], color[2]) -
        Math.min(color[0], color[1], color[2]) >
      NEUTRAL_CHROMA_THRESHOLD,
  )

/**
 * Quantize a raw RGBA pixel buffer to a fixed palette. The one entry point, so
 * the server and the browser preview cannot disagree about what dithering
 * means: a palette with colored inks gets neutral protection; a mono or
 * grayscale palette skips the double quantize it would gain nothing from.
 */
export const quantizeRgbaToPalette = ({
  rgbaPixels,
  width,
  height,
  palette,
  algorithm,
}: {
  rgbaPixels: Uint8ClampedArray
  width: number
  height: number
  palette: Palette
  algorithm: QuantizeAlgorithm
}) =>
  getHasChromaticInk(palette)
    ? quantizeWithNeutralProtection({
        rgbaPixels,
        width,
        height,
        palette,
        algorithm,
      })
    : quantizeToPalette({
        rgbaPixels,
        width,
        height,
        palette,
        algorithm,
      })
