import type { DeviceMetadata } from "@castkit/core/devices/device"
import { EXAMPLE_DEVICES } from "@castkit/core/devices/device"
import {
  E6_DEFAULT_PALETTE,
  E6_DEVICE_PALETTE,
  E6_VIVID_PALETTE,
  MONO_PALETTE,
  type Palette,
} from "@castkit/core/panels/palette"

/**
 * The panels the stories can render, derived from the shared example registry
 * so a panel added there shows up here without being listed twice.
 *
 * `defaultZoom` is presentation only: the 250×122 pHAT is unreadable at 1:1 on
 * a desktop monitor, the 800×480 Impression is fine. It never affects the
 * rendered view — the view is always built at native size and scaled after.
 */
export type PanelCatalogEntry = {
  device: DeviceMetadata
  defaultZoom: number
}

const DEFAULT_ZOOM_BY_DEVICE_ID: Record<string, number> = {
  "inky-phat": 3,
  "inky-impression": 1,
  m5paper: 1,
}

export const PANEL_CATALOG: readonly PanelCatalogEntry[] =
  EXAMPLE_DEVICES.map((device) => ({
    device,
    defaultZoom: DEFAULT_ZOOM_BY_DEVICE_ID[device.id] ?? 1,
  }))

export const PANEL_DEVICE_IDS = PANEL_CATALOG.map(
  (entry) => entry.device.id,
)

/** The catalog entry for a device id, falling back to the first panel. */
export const getPanelCatalogEntry = (deviceId: string) =>
  PANEL_CATALOG.find(
    (entry) => entry.device.id === deviceId,
  ) ?? PANEL_CATALOG[0]

/**
 * Which Spectra 6 palette the preview quantizes against. The device blends
 * vivid and device-measured at 0.5 by default (`E6_DEFAULT_PALETTE`); the two
 * ends are offered because the difference is only visible once dithered, which
 * is exactly what this preview is for. Mono panels ignore this entirely.
 */
export const PALETTE_VARIANTS = [
  "default",
  "vivid",
  "device",
] as const

export type PaletteVariant =
  (typeof PALETTE_VARIANTS)[number]

const E6_PALETTES_BY_VARIANT: Record<
  PaletteVariant,
  Palette
> = {
  default: E6_DEFAULT_PALETTE,
  vivid: E6_VIVID_PALETTE,
  device: E6_DEVICE_PALETTE,
}

/** The palette to dither against for a colour mode + chosen E6 variant. */
export const resolvePalette = ({
  colourMode,
  paletteVariant,
}: {
  colourMode: "mono" | "e6"
  paletteVariant: PaletteVariant
}) =>
  colourMode === "mono"
    ? MONO_PALETTE
    : E6_PALETTES_BY_VARIANT[paletteVariant]
