import { applyPaletteSync, utils } from "image-q"
import sharp from "sharp"
import type { DitherAlgorithm } from "../devices/device.ts"
import type {
  Palette,
  RgbColour,
} from "../panels/palette.ts"

/**
 * The per-panel image pipeline: take a full-colour render, downscale it to the
 * panel's native resolution with a high-quality (Lanczos) filter to bake in
 * anti-aliasing, then quantize/dither to the panel's fixed palette.
 *
 * Error-diffusion kernels (floyd-steinberg, atkinson, stucki, sierra) are
 * delegated to `image-q`; `threshold` (nearest palette colour) and `ordered`
 * (nearest colour with an 8×8 Bayer bias) are implemented here because `image-q`
 * has no ordered kernel. Which one wins is panel-specific — that is the whole
 * point of the Decision-2 bake-off — so the algorithm is a parameter.
 */

/** image-q's error-diffusion kernels, keyed by our algorithm names. */
const DIFFUSION_QUANTIZERS = {
  "floyd-steinberg": "floyd-steinberg",
  atkinson: "atkinson",
  stucki: "stucki",
  sierra: "sierra",
} as const

type DiffusionAlgorithm = keyof typeof DIFFUSION_QUANTIZERS

const getIsDiffusionAlgorithm = (
  algorithm: DitherAlgorithm,
): algorithm is DiffusionAlgorithm =>
  algorithm in DIFFUSION_QUANTIZERS

/**
 * Optional pre-dither tonal tweaks, applied with sharp's `modulate` in the
 * same chain as the Lanczos downscale (before raw extraction). `1` is neutral
 * for both. The physical Impression panel reads dark, so the server exposes
 * these as Home Assistant knobs.
 */
export type DitherAdjustments = {
  brightness?: number
  saturation?: number
}

/**
 * Chroma (max channel − min channel) at or below which a pixel counts as
 * neutral (gray). Anti-aliased text edges sit well under this; genuine panel
 * colours sit well above it.
 */
const NEUTRAL_CHROMA_THRESHOLD = 26

/** Rec. 601 luminance of a palette colour. */
const getLuminance = (colour: RgbColour) =>
  colour[0] * 0.299 + colour[1] * 0.587 + colour[2] * 0.114

/**
 * Normalised 8×8 Bayer threshold matrix (values in −0.5…+0.5). Added to each
 * channel before the nearest-colour lookup so `ordered` dithering spreads
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

/** Squared Euclidean distance between an RGB sample and a palette colour. */
const getColourDistanceSquared = ({
  red,
  green,
  blue,
  colour,
}: {
  red: number
  green: number
  blue: number
  colour: RgbColour
}) => {
  const redDelta = red - colour[0]
  const greenDelta = green - colour[1]
  const blueDelta = blue - colour[2]

  return (
    redDelta * redDelta +
    greenDelta * greenDelta +
    blueDelta * blueDelta
  )
}

/** Index of the palette entry nearest to the given RGB sample. */
const findNearestColourIndex = ({
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
    (nearest, colour, colourIndex) => {
      const distance = getColourDistanceSquared({
        red,
        green,
        blue,
        colour,
      })

      return distance < nearest.distance
        ? { colourIndex, distance }
        : nearest
    },
    { colourIndex: 0, distance: Number.POSITIVE_INFINITY },
  ).colourIndex

/**
 * Nearest-colour quantization with an optional per-pixel bias. With no bias
 * this is plain `threshold`; with the Bayer bias it is `ordered` dithering.
 * Operates on a flat RGBA buffer and writes the chosen palette colour back.
 */
const quantizeWithBias = ({
  rgbaBuffer,
  width,
  height,
  palette,
  hasOrderedBias,
}: {
  rgbaBuffer: Buffer
  width: number
  height: number
  palette: Palette
  hasOrderedBias: boolean
}) => {
  const outputBuffer = Buffer.alloc(rgbaBuffer.length)

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

      const colourIndex = findNearestColourIndex({
        red: clamp(rgbaBuffer[byteOffset]),
        green: clamp(rgbaBuffer[byteOffset + 1]),
        blue: clamp(rgbaBuffer[byteOffset + 2]),
        palette,
      })

      const colour = palette[colourIndex]
      outputBuffer[byteOffset] = colour[0]
      outputBuffer[byteOffset + 1] = colour[1]
      outputBuffer[byteOffset + 2] = colour[2]
      outputBuffer[byteOffset + 3] = 255
    },
  )

  return outputBuffer
}

/** Error-diffusion dithering to a fixed palette via image-q. */
const quantizeWithDiffusion = ({
  rgbaBuffer,
  width,
  height,
  palette,
  algorithm,
}: {
  rgbaBuffer: Buffer
  width: number
  height: number
  palette: Palette
  algorithm: DiffusionAlgorithm
}) => {
  const inputPointContainer =
    utils.PointContainer.fromUint8Array(
      rgbaBuffer,
      width,
      height,
    )

  const fixedPalette = new utils.Palette()
  palette.forEach((colour) => {
    fixedPalette.add(
      utils.Point.createByRGBA(
        colour[0],
        colour[1],
        colour[2],
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

  return Buffer.from(outputPointContainer.toUint8Array())
}

/** Quantize a raw RGBA buffer to a palette with the chosen algorithm. */
const quantizeToPalette = ({
  rgbaBuffer,
  width,
  height,
  palette,
  algorithm,
}: {
  rgbaBuffer: Buffer
  width: number
  height: number
  palette: Palette
  algorithm: DitherAlgorithm
}) =>
  getIsDiffusionAlgorithm(algorithm)
    ? quantizeWithDiffusion({
        rgbaBuffer,
        width,
        height,
        palette,
        algorithm,
      })
    : quantizeWithBias({
        rgbaBuffer,
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
  palette.reduce((darkestColour, colour) =>
    getLuminance(colour) < getLuminance(darkestColour)
      ? colour
      : darkestColour,
  ),
  palette.reduce((lightestColour, colour) =>
    getLuminance(colour) > getLuminance(lightestColour)
      ? colour
      : lightestColour,
  ),
]

/**
 * Quantize with neutral protection: near-neutral (gray) pixels are dithered
 * against only the palette's black/white ends; everything else against the
 * full palette. Without this, error diffusion sprays the gray anti-aliased
 * edges of text across the colour palette — red/green speckle lines along
 * letter edges on the physical panel. Keeping neutrals on the monochrome axis
 * eliminates that fringing without desaturating genuine colour.
 */
const quantizeWithNeutralProtection = ({
  rgbaBuffer,
  width,
  height,
  palette,
  algorithm,
}: {
  rgbaBuffer: Buffer
  width: number
  height: number
  palette: Palette
  algorithm: DitherAlgorithm
}) => {
  const fullPaletteBuffer = quantizeToPalette({
    rgbaBuffer,
    width,
    height,
    palette,
    algorithm,
  })

  const monochromeBuffer = quantizeToPalette({
    rgbaBuffer,
    width,
    height,
    palette: getMonochromeSubPalette(palette),
    algorithm,
  })

  const outputBuffer = Buffer.alloc(rgbaBuffer.length)

  Array.from({ length: width * height }).forEach(
    (_unused, pixelIndex) => {
      const byteOffset = pixelIndex * 4
      const red = rgbaBuffer[byteOffset]
      const green = rgbaBuffer[byteOffset + 1]
      const blue = rgbaBuffer[byteOffset + 2]

      const chroma =
        Math.max(red, green, blue) -
        Math.min(red, green, blue)
      const isNeutral = chroma <= NEUTRAL_CHROMA_THRESHOLD

      const sourceBuffer = isNeutral
        ? monochromeBuffer
        : fullPaletteBuffer

      sourceBuffer.copy(
        outputBuffer,
        byteOffset,
        byteOffset,
        byteOffset + 4,
      )
    },
  )

  return outputBuffer
}

/**
 * Downscale a full-colour render to a panel's native resolution and dither it
 * to the panel palette. `imageBuffer` may be rendered larger than native
 * (supersampled) — the Lanczos downscale here is what bakes in the anti-alias.
 * Returns a PNG at `width × height`, rotated into the panel's mount orientation.
 */
export const ditherToPanel = async ({
  imageBuffer,
  width,
  height,
  palette,
  algorithm,
  rotation = 0,
  adjustments,
}: {
  imageBuffer: Buffer
  width: number
  height: number
  palette: Palette
  algorithm: DitherAlgorithm
  rotation?: number
  adjustments?: DitherAdjustments
}): Promise<Buffer> => {
  const brightness = adjustments?.brightness ?? 1
  const saturation = adjustments?.saturation ?? 1
  const hasAdjustments =
    brightness !== 1 || saturation !== 1

  const downscalePipeline = sharp(imageBuffer).resize(
    width,
    height,
    {
      kernel: "lanczos3",
      fit: "fill",
    },
  )

  const adjustedPipeline = hasAdjustments
    ? downscalePipeline.modulate({ brightness, saturation })
    : downscalePipeline

  // "none": skip our palette quantization and hand the panel a full-colour
  // (downscaled, tone-adjusted) image so its own controller dithers. Still an
  // unambiguous RGB PNG, rotated into the mount orientation.
  if (algorithm === "none") {
    return adjustedPipeline
      .rotate(rotation)
      .removeAlpha()
      .png()
      .toBuffer()
  }

  const { data: rgbaBuffer } = await adjustedPipeline
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  // Colour panels get neutral protection so gray anti-aliased edges never
  // pick up colour speckle; the 2-colour mono path skips the double quantize.
  const hasColourPalette = palette.length > 2

  const ditheredBuffer = hasColourPalette
    ? quantizeWithNeutralProtection({
        rgbaBuffer,
        width,
        height,
        palette,
        algorithm,
      })
    : quantizeToPalette({
        rgbaBuffer,
        width,
        height,
        palette,
        algorithm,
      })

  return (
    sharp(ditheredBuffer, {
      raw: { width, height, channels: 4 },
    })
      .rotate(rotation)
      // Emit a plain RGB PNG, NOT an indexed-palette one. A palette PNG's index
      // order is content-dependent, and a device that reads palette indices
      // directly (the Inky library) then swaps black/white between frames —
      // intermittent colour inversion on the panel. RGB is unambiguous.
      .removeAlpha()
      .png()
      .toBuffer()
  )
}
