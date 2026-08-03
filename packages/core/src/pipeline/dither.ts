import sharp from "sharp"
import type { DitherAlgorithm } from "../devices/device.ts"
import type { Palette } from "../panels/palette.ts"
import { quantizeRgbaToPalette } from "./quantize.ts"

/**
 * The per-panel image pipeline: take a full-colour render, downscale it to the
 * panel's native resolution with a high-quality (Lanczos) filter to bake in
 * anti-aliasing, then quantize/dither to the panel's fixed palette.
 *
 * This is the sharp-bound half — resize, tone adjustment, rotation, encoding.
 * The quantization itself lives in `./quantize.ts`, which is free of sharp and
 * Node built-ins so the browser preview can dither with the very same code
 * rather than an approximation of it. Which algorithm wins is panel-specific —
 * that is the whole point of the Decision-2 bake-off — so it is a parameter.
 */

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
 * How the `"off"` (panel-dithers-it-itself) path encodes its full-colour
 * output. `png` is lossless (exact, but a photographic RGB PNG is large);
 * `webp`/`jpeg` are lossy and shrink a photo frame ~10× on the wire — fine
 * there because the panel re-quantizes anyway. `quality` (1–100) applies to
 * the lossy formats only. Defaults to lossless PNG so non-photo callers are
 * never silently degraded.
 */
export type FullColourEncoding = {
  format: "png" | "webp" | "jpeg"
  quality?: number
}

const DEFAULT_LOSSY_QUALITY = 80

/** Encode a sharp pipeline as the chosen full-colour format. */
const encodeFullColour = ({
  pipeline,
  encoding,
}: {
  pipeline: ReturnType<typeof sharp>
  encoding: FullColourEncoding
}): Promise<Buffer> => {
  const quality = encoding.quality ?? DEFAULT_LOSSY_QUALITY
  if (encoding.format === "webp") {
    return pipeline.webp({ quality }).toBuffer()
  }
  if (encoding.format === "jpeg") {
    return pipeline.jpeg({ quality }).toBuffer()
  }
  return pipeline.png().toBuffer()
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
  fullColourEncoding = { format: "png" },
}: {
  imageBuffer: Buffer
  width: number
  height: number
  palette: Palette
  algorithm: DitherAlgorithm
  rotation?: number
  adjustments?: DitherAdjustments
  fullColourEncoding?: FullColourEncoding
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

  // "off": skip our palette quantization and hand the panel a full-colour
  // (downscaled, tone-adjusted) image so its own controller dithers. Rotated
  // into the mount orientation and encoded per `fullColourEncoding` — lossless
  // RGB PNG by default, or a lossy WebP/JPEG (much smaller on the wire) for the
  // photo frame, where the panel re-dithers anyway.
  if (algorithm === "off") {
    return encodeFullColour({
      pipeline: adjustedPipeline
        .rotate(rotation)
        .removeAlpha(),
      encoding: fullColourEncoding,
    })
  }

  const { data: rgbaBuffer } = await adjustedPipeline
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const ditheredPixels = quantizeRgbaToPalette({
    rgbaPixels: new Uint8ClampedArray(
      rgbaBuffer.buffer,
      rgbaBuffer.byteOffset,
      rgbaBuffer.byteLength,
    ),
    width,
    height,
    palette,
    algorithm,
  })

  return (
    sharp(ditheredPixels, {
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
