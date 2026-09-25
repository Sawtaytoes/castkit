import type { RepaintGrade } from "@castkit/shared/panels/repaint"
import type { Palette } from "../panels/palette.ts"
import {
  GRAYSCALE16_PALETTE,
  MONOCHROME_PALETTE,
  SPECTRA6_DEFAULT_PALETTE,
} from "../panels/palette.ts"

/**
 * The color capability of a panel. Drives which palette the dither pipeline
 * quantizes to and, downstream, which dithering algorithm reads best.
 * `grayscale` is the 16-level M5Paper: hue still carries nothing, tone does.
 */
export type ColorMode =
  | "monochrome"
  | "grayscale"
  | "spectra6"

/**
 * The fleet-default palette for each color mode — what a device gets when its
 * config names a mode and nothing more. Spectra 6 is the 0.5 vivid/device
 * blend the on-device Spectra path uses.
 */
export const PALETTE_BY_COLOR_MODE: Record<
  ColorMode,
  Palette
> = {
  monochrome: MONOCHROME_PALETTE,
  grayscale: GRAYSCALE16_PALETTE,
  spectra6: SPECTRA6_DEFAULT_PALETTE,
}

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
   * consume them). `"http-pull"`: the server instead publishes a single-use
   * render URL to `<base>/image_url`, which the panel fetches over HTTP.
   *
   * ⚠️ It is NOT "because ESPHome cannot consume MQTT image bytes", which this
   * comment used to say. The WT32-SC01 runs ESPHome too and is fed pushed
   * bytes by a custom component. The M5Paper pulls because it runs STOCK
   * components, and `online_image` is an HTTP client — a fact about one
   * firmware's component set, not a limit of ESPHome.
   */
  imageDelivery?: "mqtt-image" | "http-pull"
  /**
   * Whether the panel carries a cell. A panel fact, not an installation:
   * the M5Paper has one whether or not this unit is running off it.
   *
   * `true` gains the display battery telemetry, a low threshold and an end
   * state. ⚠️ On ePaper a flat battery does not look flat — the glass holds
   * its last frame at zero power, so a dead panel keeps showing yesterday's
   * agenda and reads as a working display with wrong data.
   */
  hasBattery?: boolean
  /**
   * How long this glass takes to show a new frame, and therefore which views
   * the display is offered and which values those views may print.
   *
   * Optional because it is INFERRED when absent — `getDefaultRepaint` reads
   * the grade off `imageDelivery` and `colorMode`, which gets every panel in
   * the current fleet right. Setting it explicitly always wins, and a new
   * panel kind that breaks the pattern should set one rather than lean on the
   * inference.
   */
  repaint?: RepaintGrade
  /**
   * How THIS unit is actually supplied. An installation fact: a panel with a
   * cell may still be plugged in, and the M5Paper is today.
   *
   * `"battery"` makes every repaint cost charge, so the display is offered the
   * view list of the next slower grade. ⚠️ That does not take the clock off a
   * `fast` panel — `fast` and `slow` offer the same list, and the clock comes
   * off at `super-slow`. What it really buys is fewer repaints per day.
   */
  power?: "wired" | "battery"
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
 * Example M5Paper (ESP32): 16-level grayscale, pulled over HTTP rather than
 * pushed as an MQTT image. Unlike the Inky panels it has no on-device
 * dithering to fall back on, so what our pipeline emits is exactly what the
 * glass shows — which is why it is the panel the dither comparison matters
 * most for. It was 1-bit until 2026-09-17; the IT8951E always painted 4 bits
 * per pixel with GC16, so the two-color render spent the 16-level budget on
 * dither noise.
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
  colorMode: "grayscale",
  palette: GRAYSCALE16_PALETTE,
  rotation: 0,
  imageDelivery: "http-pull",
  ditherProfile: {
    algorithm: "floyd-steinberg",
    supersampleFactor: 2,
  },
}

/**
 * Example Waveshare 10.85" e-Paper HAT+: 1360×480 1-bit mono over SPI.
 *
 * A letterbox panel — nearly three times as wide as it is tall — which is the
 * whole reason it is in the registry. Every other example is roughly 2:1 or
 * squarer, so a view that has only ever been laid out against those can look
 * correct and still strand its content in the middle third of this glass.
 *
 * ⚠️ Two products share the "10.85inch e-Paper" name and only one of them is
 * this entry. The HAT+ is black and white with 2 gray levels; the HAT+ (G) is
 * the same 1360×480 glass in red/yellow/black/white and would need its own
 * palette and color mode. Registering the wrong one gives a panel that renders
 * without error and throws away every color the hardware can paint.
 *
 * `slow` comes from the datasheet's 3.5 s full refresh. Partial refresh is
 * 0.6 s, which we do not use: CastKit sends whole frames.
 */
export const WAVESHARE_1085_DEVICE: DeviceMetadata = {
  id: "waveshare-1085",
  label: 'Waveshare 10.85" e-Paper',
  mac: "02:00:00:00:00:06",
  width: 1360,
  height: 480,
  colorMode: "monochrome",
  palette: MONOCHROME_PALETTE,
  rotation: 0,
  repaint: "slow",
  ditherProfile: {
    algorithm: "atkinson",
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
  WAVESHARE_1085_DEVICE,
]
