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
 * Every algorithm runs over typed arrays with plain `for` loops: no object per
 * pixel, no closure per pixel. A 1600×1200 panel is 1.9 million pixels, and
 * the `image-q` path this replaced built a `Point` object for each one — the
 * profile spent 25.7% of its time in that class-field helper and 14.8% in the
 * garbage collector.
 *
 * The error-diffusion kernels (floyd-steinberg, atkinson, stucki, sierra)
 * reproduce `image-q` 4.0.0's `ErrorDiffusionArray` with the options CastKit
 * used (`euclidean` distance, serpentine, `minimumColorDistanceToDither: 0`,
 * error measured from the ORIGINAL pixel, not the corrected one), and the
 * output is byte-identical to it. The details that make it identical are
 * called out where they happen — change any of them and the golden test in
 * `quantize.test.ts` fails.
 */

/** Every algorithm except `"off"`, which is an encoding choice, not a quantization. */
export type QuantizeAlgorithm = Exclude<
  DitherAlgorithm,
  "off"
>

type DiffusionAlgorithm = Exclude<
  QuantizeAlgorithm,
  "threshold" | "ordered"
>

/**
 * One error-diffusion kernel, flattened into parallel arrays: the share of the
 * error each neighbor receives, and that neighbor's column and row offset from
 * the current pixel. The entry ORDER is `image-q`'s and is kept on purpose —
 * a right-to-left row walks it backwards, exactly as `image-q` does.
 */
type DiffusionKernel = {
  weights: Float64Array
  columnOffsets: Int32Array
  rowOffsets: Int32Array
  /** How many error rows the kernel reaches, counting the current one. */
  errorRowCount: number
}

/** Build a kernel from `[weight, columnOffset, rowOffset]` entries. */
const createDiffusionKernel = (
  entries: readonly (readonly [number, number, number])[],
): DiffusionKernel => ({
  weights: Float64Array.from(entries, (entry) => entry[0]),
  columnOffsets: Int32Array.from(
    entries,
    (entry) => entry[1],
  ),
  rowOffsets: Int32Array.from(entries, (entry) => entry[2]),
  errorRowCount: Math.max(
    1,
    ...entries.map((entry) => entry[2] + 1),
  ),
})

/**
 * The kernels, copied entry for entry from `image-q` 4.0.0
 * (`src/image/array.ts`, `ErrorDiffusionArray._setKernel`). The weights are
 * the same `n / d` expressions, so each is the same double.
 */
const DIFFUSION_KERNELS: Record<
  DiffusionAlgorithm,
  DiffusionKernel
> = {
  "floyd-steinberg": createDiffusionKernel([
    [7 / 16, 1, 0],
    [3 / 16, -1, 1],
    [5 / 16, 0, 1],
    [1 / 16, 1, 1],
  ]),
  atkinson: createDiffusionKernel([
    [1 / 8, 1, 0],
    [1 / 8, 2, 0],
    [1 / 8, -1, 1],
    [1 / 8, 0, 1],
    [1 / 8, 1, 1],
    [1 / 8, 0, 2],
  ]),
  stucki: createDiffusionKernel([
    [8 / 42, 1, 0],
    [4 / 42, 2, 0],
    [2 / 42, -2, 1],
    [4 / 42, -1, 1],
    [8 / 42, 0, 1],
    [4 / 42, 1, 1],
    [2 / 42, 2, 1],
    [1 / 42, -2, 2],
    [2 / 42, -1, 2],
    [4 / 42, 0, 2],
    [2 / 42, 1, 2],
    [1 / 42, 2, 2],
  ]),
  sierra: createDiffusionKernel([
    [5 / 32, 1, 0],
    [3 / 32, 2, 0],
    [2 / 32, -2, 1],
    [4 / 32, -1, 1],
    [5 / 32, 0, 1],
    [4 / 32, 1, 1],
    [2 / 32, 2, 1],
    [2 / 32, -1, 2],
    [3 / 32, 0, 2],
    [2 / 32, 1, 2],
  ]),
}

const getIsDiffusionAlgorithm = (
  algorithm: QuantizeAlgorithm,
): algorithm is DiffusionAlgorithm =>
  algorithm in DIFFUSION_KERNELS

/** RGB channels per palette entry in a packed palette. */
const PALETTE_STRIDE = 3

/** RGBA bytes per pixel. */
const PIXEL_STRIDE = 4

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
 * Normalized 8×8 Bayer threshold matrix (values in −0.5…+0.5), flattened
 * row-major. Added to each channel before the nearest-color lookup so
 * `ordered` dithering spreads quantization error spatially instead of
 * diffusing it.
 */
const BAYER_8X8 = Float64Array.from(
  [
    [0, 32, 8, 40, 2, 34, 10, 42],
    [48, 16, 56, 24, 50, 18, 58, 26],
    [12, 44, 4, 36, 14, 46, 6, 38],
    [60, 28, 52, 20, 62, 30, 54, 22],
    [3, 35, 11, 43, 1, 33, 9, 41],
    [51, 19, 59, 27, 49, 17, 57, 25],
    [15, 47, 7, 39, 13, 45, 5, 37],
    [63, 31, 55, 23, 61, 29, 53, 21],
  ].flat(),
  (cellValue) => cellValue / 64 - 0.5,
)

/** Whether an RGB sample is close enough to gray to count as neutral. */
const getIsNeutral = (
  red: number,
  green: number,
  blue: number,
) =>
  Math.max(red, green, blue) - Math.min(red, green, blue) <=
  NEUTRAL_CHROMA_THRESHOLD

/**
 * The arguments every quantizer shares. A quantizer writes into
 * `outputPixels`; with `isNeutralOnly` it still walks every pixel (error
 * diffusion has to) but writes only the neutral ones, which is how neutral
 * protection lays its black/white pass over the full-palette pass.
 */
type QuantizeIntoOptions = {
  rgbaPixels: Uint8ClampedArray
  width: number
  height: number
  palette: Palette
  outputPixels: Uint8ClampedArray
  isNeutralOnly: boolean
}

/**
 * Nearest-color quantization with an optional per-pixel bias. With no bias
 * this is plain `threshold`; with the Bayer bias it is `ordered` dithering.
 */
const quantizeWithBiasInto = ({
  rgbaPixels,
  width,
  height,
  palette,
  outputPixels,
  isNeutralOnly,
  hasOrderedBias,
}: QuantizeIntoOptions & { hasOrderedBias: boolean }) => {
  const paletteLength = palette.length

  for (let rowIndex = 0; rowIndex < height; rowIndex += 1) {
    for (
      let columnIndex = 0;
      columnIndex < width;
      columnIndex += 1
    ) {
      const byteOffset =
        (rowIndex * width + columnIndex) * PIXEL_STRIDE
      const red = rgbaPixels[byteOffset]
      const green = rgbaPixels[byteOffset + 1]
      const blue = rgbaPixels[byteOffset + 2]

      if (
        isNeutralOnly &&
        !getIsNeutral(red, green, blue)
      ) {
        continue
      }

      const bias = hasOrderedBias
        ? BAYER_8X8[
            (rowIndex % 8) * 8 + (columnIndex % 8)
          ] * 255
        : 0

      const biasedRed = Math.max(
        0,
        Math.min(255, red + bias),
      )
      const biasedGreen = Math.max(
        0,
        Math.min(255, green + bias),
      )
      const biasedBlue = Math.max(
        0,
        Math.min(255, blue + bias),
      )

      let nearestIndex = 0
      let nearestDistance = Number.POSITIVE_INFINITY

      for (
        let colorIndex = 0;
        colorIndex < paletteLength;
        colorIndex += 1
      ) {
        const color = palette[colorIndex]
        const redDelta = biasedRed - color[0]
        const greenDelta = biasedGreen - color[1]
        const blueDelta = biasedBlue - color[2]
        const distance =
          redDelta * redDelta +
          greenDelta * greenDelta +
          blueDelta * blueDelta

        if (distance < nearestDistance) {
          nearestDistance = distance
          nearestIndex = colorIndex
        }
      }

      const nearestColor = palette[nearestIndex]
      outputPixels[byteOffset] = nearestColor[0]
      outputPixels[byteOffset + 1] = nearestColor[1]
      outputPixels[byteOffset + 2] = nearestColor[2]
      outputPixels[byteOffset + 3] = 255
    }
  }
}

/**
 * Error-diffusion dithering to a fixed palette, matching `image-q` 4.0.0's
 * `ErrorDiffusionArray` byte for byte. What has to match, and why:
 *
 * - **Serpentine, starting right to left.** `image-q` flips direction BEFORE
 *   each row, so row 0 runs right to left. A right-to-left row also walks the
 *   kernel entries in reverse with mirrored column offsets.
 * - **Error is a double, summed in the same order.** Each neighbor's error
 *   accumulates `error * weight` in pixel-visit order. A `Float64Array` keeps
 *   every sum the same double `image-q`'s `number[]` held. A `Float32Array`
 *   happens to agree for the n/8, n/16 and n/32 kernels, and moves pixels
 *   under Stucki's n/42 weights.
 * - **The corrected pixel is `Math.round`ed, then clamped to 0…255** (round
 *   half up, so −2.5 becomes −2), as `inRange0to255Rounded` does.
 * - **The error is ORIGINAL minus chosen**, not corrected minus chosen
 *   (`calculateErrorLikeGIMP: false`), and it is never clamped.
 * - **The nearest color is the FIRST entry at the smallest distance.**
 *   `image-q`'s `euclidean` is `sqrt(dR² + dG² + dB² + dA²)` with unit weights.
 *   Every input is an integer, so the squared sum is exact, and `sqrt` keeps
 *   both its order and its ties — comparing the integer sum is the same
 *   decision. Every palette entry is opaque, so `dA²` is one constant shared
 *   by every candidate and cannot change the winner; alpha is dropped.
 *   (`image-q`'s per-color cache only memoized that same function.)
 * - **Palette channels are truncated to integers** (`| 0`), as
 *   `Point.createByRGBA` does, and every output pixel is opaque.
 */
const diffuseToPaletteInto = ({
  rgbaPixels,
  width,
  height,
  palette,
  outputPixels,
  isNeutralOnly,
  kernel,
}: QuantizeIntoOptions & { kernel: DiffusionKernel }) => {
  const paletteLength = palette.length
  const paletteChannels = new Int32Array(
    paletteLength * PALETTE_STRIDE,
  )
  for (
    let colorIndex = 0;
    colorIndex < paletteLength;
    colorIndex += 1
  ) {
    const color = palette[colorIndex]
    const channelOffset = colorIndex * PALETTE_STRIDE
    paletteChannels[channelOffset] = color[0] | 0
    paletteChannels[channelOffset + 1] = color[1] | 0
    paletteChannels[channelOffset + 2] = color[2] | 0
  }

  const {
    weights,
    columnOffsets,
    rowOffsets,
    errorRowCount,
  } = kernel
  const kernelLength = weights.length

  // A ring of error rows, RGB per pixel. The row for image row `y` lives in
  // slot `y % errorRowCount`; a slot is cleared when its row is reached, so it
  // starts empty for the row `errorRowCount − 1` below.
  const errorRowLength = width * PALETTE_STRIDE
  const errors = new Float64Array(
    errorRowCount * errorRowLength,
  )

  let direction = 1

  for (let rowIndex = 0; rowIndex < height; rowIndex += 1) {
    direction = -direction

    const currentErrorRowOffset =
      (rowIndex % errorRowCount) * errorRowLength
    const columnStart = direction === 1 ? 0 : width - 1
    const columnEnd = direction === 1 ? width : -1
    const kernelStart =
      direction === 1 ? 0 : kernelLength - 1
    const kernelEnd = direction === 1 ? kernelLength : -1

    for (
      let columnIndex = columnStart;
      columnIndex !== columnEnd;
      columnIndex += direction
    ) {
      const byteOffset =
        (rowIndex * width + columnIndex) * PIXEL_STRIDE
      const errorOffset =
        currentErrorRowOffset + columnIndex * PALETTE_STRIDE

      const red = rgbaPixels[byteOffset]
      const green = rgbaPixels[byteOffset + 1]
      const blue = rgbaPixels[byteOffset + 2]

      const correctedRed = Math.min(
        255,
        Math.max(0, Math.round(red + errors[errorOffset])),
      )
      const correctedGreen = Math.min(
        255,
        Math.max(
          0,
          Math.round(green + errors[errorOffset + 1]),
        ),
      )
      const correctedBlue = Math.min(
        255,
        Math.max(
          0,
          Math.round(blue + errors[errorOffset + 2]),
        ),
      )

      // The slot is read; clear it for the row that reuses it.
      errors[errorOffset] = 0
      errors[errorOffset + 1] = 0
      errors[errorOffset + 2] = 0

      let nearestChannelOffset = 0
      let nearestDistance = Number.POSITIVE_INFINITY

      for (
        let channelOffset = 0;
        channelOffset < paletteChannels.length;
        channelOffset += PALETTE_STRIDE
      ) {
        const redDelta =
          paletteChannels[channelOffset] - correctedRed
        const greenDelta =
          paletteChannels[channelOffset + 1] -
          correctedGreen
        const blueDelta =
          paletteChannels[channelOffset + 2] - correctedBlue
        const distance =
          redDelta * redDelta +
          greenDelta * greenDelta +
          blueDelta * blueDelta

        if (distance < nearestDistance) {
          nearestDistance = distance
          nearestChannelOffset = channelOffset
        }
      }

      const nearestRed =
        paletteChannels[nearestChannelOffset]
      const nearestGreen =
        paletteChannels[nearestChannelOffset + 1]
      const nearestBlue =
        paletteChannels[nearestChannelOffset + 2]

      if (
        !isNeutralOnly ||
        getIsNeutral(red, green, blue)
      ) {
        outputPixels[byteOffset] = nearestRed
        outputPixels[byteOffset + 1] = nearestGreen
        outputPixels[byteOffset + 2] = nearestBlue
        outputPixels[byteOffset + 3] = 255
      }

      const redError = red - nearestRed
      const greenError = green - nearestGreen
      const blueError = blue - nearestBlue

      for (
        let kernelIndex = kernelStart;
        kernelIndex !== kernelEnd;
        kernelIndex += direction
      ) {
        const targetColumn =
          columnIndex +
          columnOffsets[kernelIndex] * direction
        const targetRow = rowIndex + rowOffsets[kernelIndex]

        if (
          targetColumn >= 0 &&
          targetColumn < width &&
          targetRow < height
        ) {
          const weight = weights[kernelIndex]
          const targetOffset =
            (targetRow % errorRowCount) * errorRowLength +
            targetColumn * PALETTE_STRIDE

          errors[targetOffset] += redError * weight
          errors[targetOffset + 1] += greenError * weight
          errors[targetOffset + 2] += blueError * weight
        }
      }
    }
  }
}

/** Quantize into `outputPixels` with the chosen algorithm. */
const quantizeInto = ({
  algorithm,
  ...options
}: QuantizeIntoOptions & {
  algorithm: QuantizeAlgorithm
}) => {
  if (getIsDiffusionAlgorithm(algorithm)) {
    diffuseToPaletteInto({
      ...options,
      kernel: DIFFUSION_KERNELS[algorithm],
    })
    return
  }

  quantizeWithBiasInto({
    ...options,
    hasOrderedBias: algorithm === "ordered",
  })
}

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
 * means.
 *
 * A palette with colored inks gets neutral protection: near-neutral (gray)
 * pixels are dithered against only the palette's black/white ends, everything
 * else against the full palette. Without it, error diffusion sprays the gray
 * anti-aliased edges of text across the color palette — red/green speckle
 * lines along letter edges on the physical panel. It is two complete passes
 * into one buffer — the full palette for every pixel, then the black/white
 * pair over the neutral ones — because each pass diffuses its own error
 * through every pixel, so neither can be cut short without changing the
 * other's result. A mono or grayscale palette skips the second pass, which
 * would gain it nothing.
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
}) => {
  const outputPixels = new Uint8ClampedArray(
    width * height * PIXEL_STRIDE,
  )

  quantizeInto({
    rgbaPixels,
    width,
    height,
    palette,
    algorithm,
    outputPixels,
    isNeutralOnly: false,
  })

  if (getHasChromaticInk(palette)) {
    quantizeInto({
      rgbaPixels,
      width,
      height,
      palette: getMonochromeSubPalette(palette),
      algorithm,
      outputPixels,
      isNeutralOnly: true,
    })
  }

  return outputPixels
}
