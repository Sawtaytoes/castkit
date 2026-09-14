import type { Palette } from "../panels/palette.ts"
import {
  MONOCHROME_PALETTE,
  SPECTRA6_DEFAULT_PALETTE,
} from "../panels/palette.ts"

/**
 * The color capability of a panel. Drives which palette the dither pipeline
 * quantizes to and, downstream, which dithering algorithm reads best.
 */
export type ColorMode = "monochrome" | "spectra6"

/**
 * The dithering kernels the pipeline can apply. Error-diffusion kernels
 * (floyd-steinberg … sierra) come from `image-q`; `ordered` and `threshold`
 * are implemented in-house. `off` skips our quantization entirely and sends
 * the full-color downscaled image so the panel's own controller does the
 * dithering (brightness/saturation still apply). The best choice differs by
 * panel — mono vs E Ink Spectra 6 — so it is a per-device knob, not one global setting.
 * (`off`, not `none`: Home Assistant reserves the `select` payload `none` as
 * its "reset to unknown" sentinel, so a literal `none` option can't round-trip.)
 */
export const DITHER_ALGORITHMS = [
  "off",
  "threshold",
  "ordered",
  "floyd-steinberg",
  "atkinson",
  "stucki",
  "sierra",
] as const

export type DitherAlgorithm =
  (typeof DITHER_ALGORITHMS)[number]

/**
 * How a device's full-color render is reduced to its panel's inks. Kept per
 * device so a mono pHAT and a 6-color Impression can each use the algorithm +
 * supersample factor that looks best on that hardware (the Decision-2 bake-off
 * picks these).
 */
export type DitherProfile = {
  algorithm: DitherAlgorithm
  /**
   * Render at `supersampleFactor × native` then Lanczos-downscale to native
   * before dithering, baking in anti-aliasing. 1 = off.
   */
  supersampleFactor: number
}

/**
 * Everything the render server needs to turn a view into panel-ready bytes for
 * one physical display. Mirrors the "Device registry + metadata" section of the
 * build handoff.
 */
export type DeviceMetadata = {
  id: string
  label: string
  /** Lower-case colon-separated MAC; the device's stable identity on the wire. */
  mac: string
  /**
   * The panel's framebuffer, in the orientation the device presents it — NOT
   * the glass's datasheet resolution. This pair is the box every view lays
   * itself out in, and the M5Paper is why the distinction is spelled out: its
   * glass is a 540x960 portrait panel, but the firmware drives it as a 960x540
   * landscape canvas, and recording the datasheet number composed every text
   * view for a tall narrow box.
   */
  width: number
  height: number
  colorMode: ColorMode
  palette: Palette
  /**
   * Clockwise degrees applied to the FINISHED bitmap, to cancel out how the
   * panel is mounted (pHAT mounts USB-up = 180).
   *
   * This turns the composed frame; it never re-runs the layout. A quarter turn
   * therefore does NOT give you a landscape view of a portrait panel — it
   * gives you the portrait view, on its side, with the text running off what
   * is now the long edge. A panel read in landscape is a landscape
   * `width`/`height` above with rotation 0 or 180.
   */
  rotation: 0 | 90 | 180 | 270
  ditherProfile: DitherProfile
  /**
   * How the panel receives its render. Default `"mqtt-image"`: the server
   * publishes the PNG bytes to `<base>/image` (the Pi fleet + HA's image entity
   * consume them). `"http-pull"`: the panel can't consume MQTT image bytes
   * (e.g. the ESPHome M5Paper), so the server instead publishes a single-use
   * render URL to `<base>/image_url`, which the panel fetches over HTTP.
   */
  imageDelivery?: "mqtt-image" | "http-pull"
  /**
   * Default Immich people for the Photo Frame view. This SEEDS the device's
   * retained `photo_people` state when the broker has no value for it — first
   * boot, or after a retained-topic wipe. Home Assistant owns the live value
   * from then on: editing the HA text entity never writes back here, and the
   * seed never overwrites a value the broker already restored.
   *
   * Absent = the frame starts with an empty filter and waits for HA, which is
   * what stranded the 13.3" panels on the setup placeholder after the
   * inkcast→castkit topic migration wiped their retained state.
   */
  photoPeople?: readonly string[]
}

// NOTE: these are generic EXAMPLE devices — placeholder MACs, no room labels —
// safe to commit to a public repo. A real deployment supplies its own devices
// (real MACs, names, rotation, dither choices) from a gitignored config the
// server loads at startup; see @castkit/server config. Panel geometry/palette
// here are hardware facts, not house-specific.

/**
 * Example Inky pHAT: 250×122 1-bit mono, mounted USB-up so it renders rotated
 * 180°.
 */
export const PHAT_DEVICE: DeviceMetadata = {
  id: "inky-phat",
  label: "Inky pHAT",
  mac: "02:00:00:00:00:01",
  width: 250,
  height: 122,
  colorMode: "monochrome",
  palette: MONOCHROME_PALETTE,
  rotation: 180,
  ditherProfile: {
    algorithm: "atkinson",
    supersampleFactor: 4,
  },
}

/**
 * Example Inky Impression 7.3" Spectra: 800×480 6-color E Ink Spectra 6. Palette is the 0.5
 * vivid/device blend the on-device Spectra path uses.
 */
export const IMPRESSION_DEVICE: DeviceMetadata = {
  id: "inky-impression",
  label: 'Inky Impression 7.3"',
  mac: "02:00:00:00:00:02",
  width: 800,
  height: 480,
  colorMode: "spectra6",
  palette: SPECTRA6_DEFAULT_PALETTE,
  rotation: 0,
  ditherProfile: {
    algorithm: "floyd-steinberg",
    supersampleFactor: 4,
  },
}

/**
 * Example M5Paper (ESP32): 1-bit mono, pulled over HTTP rather than pushed as
 * an MQTT image. Unlike the Inky panels it has no on-device dithering to fall
 * back on, so what our pipeline emits is exactly what the glass shows — which
 * is why it is the panel the dither comparison matters most for.
 *
 * 960×540 LANDSCAPE, which is the firmware's canvas, not the glass's 540×960
 * datasheet figure. See `rotation` on DeviceMetadata: this entry read 540×960
 * with the mount corrected by a 90-degree turn, and every text view was
 * composed for a 540px-wide box and then tipped on its side.
 */
export const M5PAPER_DEVICE: DeviceMetadata = {
  id: "m5paper",
  label: "M5Paper",
  mac: "02:00:00:00:00:05",
  width: 960,
  height: 540,
  colorMode: "monochrome",
  palette: MONOCHROME_PALETTE,
  rotation: 0,
  imageDelivery: "http-pull",
  ditherProfile: {
    algorithm: "floyd-steinberg",
    supersampleFactor: 2,
  },
}

/** Example devices — the two panel types Inkcast targets. Override via config. */
export const SEED_DEVICES: readonly DeviceMetadata[] = [
  PHAT_DEVICE,
  IMPRESSION_DEVICE,
]

/**
 * Every example panel, for previews and docs — deliberately NOT `SEED_DEVICES`,
 * which is what a fresh install actually registers. The M5Paper belongs in a
 * preview matrix (it is the panel with no hardware dither) but adding it to the
 * seed list would change what every new server announces to Home Assistant.
 */
export const EXAMPLE_DEVICES: readonly DeviceMetadata[] = [
  PHAT_DEVICE,
  IMPRESSION_DEVICE,
  M5PAPER_DEVICE,
]
