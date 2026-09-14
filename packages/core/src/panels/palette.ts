/**
 * Panel color palettes for the display fleet.
 *
 * A palette is the fixed set of ink colors a given ePaper panel can physically
 * show. The dither pipeline quantizes a full-color render down to one of these
 * so the on-screen preview matches what the hardware actually renders.
 *
 * The Spectra 6 (E Ink Spectra 6) values are lifted from Pimoroni's `inky` library
 * (`inky/inky_e673.py`) so a server-side render is color-faithful to the panel
 * the on-device `inky.set_image(saturation=…)` path produces. See the
 * home-displays Spectra fetcher (`immich_impression_frame.py`) for prior art.
 */

/** A single ink color as an 8-bit-per-channel RGB triple. */
export type RgbColor = readonly [number, number, number]

/** An ordered, fixed set of ink colors a panel can display. */
export type Palette = readonly RgbColor[]

/** 1-bit black/white — the Inky pHAT (250×122 mono). */
export const MONOCHROME_PALETTE: Palette = [
  [0, 0, 0],
  [255, 255, 255],
]

/**
 * Spectra 6 "vivid" reference palette (Pimoroni DESATURATED_PALETTE, indices
 * 0–5). Pure primaries — what the colors are *meant* to be, before the panel's
 * real-ink muting. Index 6 (a spare white) is intentionally dropped: E Ink Spectra 6 shows 6
 * inks.
 */
export const SPECTRA6_VIVID_PALETTE: Palette = [
  [0, 0, 0],
  [255, 255, 255],
  [255, 255, 0],
  [255, 0, 0],
  [0, 0, 255],
  [0, 255, 0],
]

/**
 * Spectra 6 "device-real" palette (Pimoroni SATURATED_PALETTE, indices 0–5).
 * The muted tones the physical E Ink Spectra 6 ink actually produces — closer to the honest
 * on-wall look — the honest, slightly muted result real E Ink Spectra 6 ink produces).
 */
export const SPECTRA6_DEVICE_PALETTE: Palette = [
  [0, 0, 0],
  [161, 164, 165],
  [208, 190, 71],
  [156, 72, 75],
  [61, 59, 94],
  [58, 91, 70],
]

/**
 * Blend the vivid and device-real E Ink Spectra 6 palettes the same way Pimoroni's
 * `inky._palette_blend(saturation)` does: per channel,
 * `device × saturation + vivid × (1 − saturation)`.
 *
 * `saturation` 0 → fully vivid; 1 → fully device-real. The Spectra fetcher runs
 * at `IMMICH_SATURATION = 0.5`, so a 0.5 blend is the fleet default and makes
 * the preview match the panel.
 */
export const blendSpectra6Palette = ({
  saturation,
}: {
  saturation: number
}): Palette =>
  SPECTRA6_VIVID_PALETTE.map(
    (vividColor, colorIndex): RgbColor => {
      const deviceColor =
        SPECTRA6_DEVICE_PALETTE[colorIndex]

      return [
        Math.round(
          deviceColor[0] * saturation +
            vividColor[0] * (1 - saturation),
        ),
        Math.round(
          deviceColor[1] * saturation +
            vividColor[1] * (1 - saturation),
        ),
        Math.round(
          deviceColor[2] * saturation +
            vividColor[2] * (1 - saturation),
        ),
      ]
    },
  )

/** The fleet-default E Ink Spectra 6 palette (0.5 blend), matching the Spectra fetcher. */
export const SPECTRA6_DEFAULT_PALETTE: Palette =
  blendSpectra6Palette({
    saturation: 0.5,
  })
