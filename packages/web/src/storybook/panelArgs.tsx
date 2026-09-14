import type { DitherAlgorithm } from "@castkit/core/devices/device"
import { DITHER_ALGORITHMS } from "@castkit/core/devices/device"
import type { ViewName } from "@castkit/shared/views/viewNames"
import type { ViewColorMode } from "@castkit/views/viewProps"
import { PanelFrame } from "../PanelFrame.tsx"
import { DitherPreview } from "./DitherPreview.tsx"
import { PanelStage } from "./PanelStage.tsx"
import {
  getPanelCatalogEntry,
  PALETTE_VARIANTS,
  PANEL_DEVICE_IDS,
  type PaletteVariant,
  resolvePalette,
} from "./panelCatalog.ts"

/**
 * One control surface shared by every view story, so "this view on that panel"
 * is a dropdown rather than a hand-edited pair of numbers.
 *
 * The panel dimensions are derived from `deviceId` and are deliberately NOT
 * args. Letting someone type an arbitrary width would let a story show a panel
 * that does not exist, which is the opposite of what a device preview is for.
 */
export type PanelStoryArgs = {
  deviceId: string
  colorMode: ViewColorMode | "device default"
  isDithered: boolean
  ditherAlgorithm: DitherAlgorithm
  supersampleFactor: number
  paletteVariant: PaletteVariant
  zoom: number
  isShownAsMounted: boolean
  marginTop: number
  marginRight: number
  marginBottom: number
  marginLeft: number
  isEmpty: boolean
}

export const PANEL_ARG_TYPES = {
  deviceId: {
    name: "Device",
    control: { type: "select" as const },
    options: PANEL_DEVICE_IDS,
    description:
      "Drives width, height, color mode, palette and the supersample default.",
    table: { category: "Panel" },
  },
  colorMode: {
    name: "Color mode",
    control: { type: "inline-radio" as const },
    options: ["device default", "monochrome", "spectra6"],
    table: { category: "Panel" },
  },
  zoom: {
    name: "Zoom",
    control: { type: "inline-radio" as const },
    options: [1, 2, 3, 4],
    description:
      "Display scale only — the view is always built at native size.",
    table: { category: "Panel" },
  },
  isShownAsMounted: {
    name: "Show as mounted",
    control: { type: "boolean" as const },
    description:
      "Apply the device's physical mount rotation (the pHAT hangs USB-up at 180°). Off by default, because upside-down text is hard to review.",
    table: { category: "Panel" },
  },

  isDithered: {
    name: "Dither",
    control: { type: "boolean" as const },
    description:
      "Quantize to the panel palette with @castkit/core's shared quantizer — what the glass actually shows.",
    table: { category: "Dither" },
  },
  ditherAlgorithm: {
    name: "Algorithm",
    control: { type: "select" as const },
    options: DITHER_ALGORITHMS,
    description:
      '"off" ships full color for the panel to dither itself.',
    table: { category: "Dither" },
  },
  supersampleFactor: {
    name: "Supersample",
    control: { type: "inline-radio" as const },
    options: [1, 2, 3, 4],
    description:
      "Render at Nx native then downscale, baking anti-aliasing in before quantizing. Approximate: canvas bilinear here, Lanczos3 on the server.",
    table: { category: "Dither" },
  },
  paletteVariant: {
    name: "E Ink Spectra 6 palette",
    control: { type: "inline-radio" as const },
    options: PALETTE_VARIANTS,
    description:
      "Spectra 6 vivid/device blend. Ignored on mono panels.",
    table: { category: "Dither" },
  },

  marginTop: {
    name: "Margin top",
    control: { type: "number" as const, min: 0, max: 200 },
    table: { category: "Margin" },
  },
  marginRight: {
    name: "Margin right",
    control: { type: "number" as const, min: 0, max: 200 },
    table: { category: "Margin" },
  },
  marginBottom: {
    name: "Margin bottom",
    control: { type: "number" as const, min: 0, max: 200 },
    table: { category: "Margin" },
  },
  marginLeft: {
    name: "Margin left",
    control: { type: "number" as const, min: 0, max: 200 },
    table: { category: "Margin" },
  },

  isEmpty: {
    name: "Empty state",
    control: { type: "boolean" as const },
    description:
      "Render the no-data state, where the view has one.",
    table: { category: "Content" },
  },
}

export const DEFAULT_PANEL_ARGS: PanelStoryArgs = {
  deviceId: "inky-impression",
  colorMode: "device default",
  isDithered: false,
  ditherAlgorithm: "floyd-steinberg",
  supersampleFactor: 2,
  paletteVariant: "default",
  zoom: 1,
  isShownAsMounted: false,
  marginTop: 0,
  marginRight: 0,
  marginBottom: 0,
  marginLeft: 0,
  isEmpty: false,
}

/**
 * Render one view under the shared args. Undithered it is the live DOM (crisp,
 * inspectable, and what the Chromium engine sees); dithered it is a canvas of
 * the quantized pixels.
 */
export const renderPanelStory = ({
  viewName,
  args,
  photoUrl,
}: {
  viewName: ViewName
  args: PanelStoryArgs
  photoUrl?: string
}) => {
  const { device, defaultZoom } = getPanelCatalogEntry(
    args.deviceId,
  )
  const colorMode =
    args.colorMode === "device default"
      ? device.colorMode
      : args.colorMode
  const zoom = args.zoom || defaultZoom

  const stage = (
    <PanelStage
      viewName={viewName}
      width={device.width}
      height={device.height}
      colorMode={colorMode}
      photoUrl={photoUrl}
      isEmpty={args.isEmpty}
      panelMargin={{
        top: args.marginTop,
        right: args.marginRight,
        bottom: args.marginBottom,
        left: args.marginLeft,
      }}
    />
  )

  const label = `${device.label} · ${viewName}`

  if (!args.isDithered) {
    return (
      <PanelFrame
        label={label}
        width={device.width}
        height={device.height}
        colorMode={colorMode}
        zoom={zoom}
      >
        {stage}
      </PanelFrame>
    )
  }

  return (
    <figure style={{ margin: 0 }}>
      <figcaption
        style={{
          fontFamily: "monospace",
          fontSize: 12,
          marginBottom: 6,
          color: "#333",
        }}
      >
        {label} — {device.width}x{device.height} {colorMode}{" "}
        · {zoom}x · {args.ditherAlgorithm} @{" "}
        {args.supersampleFactor}x
      </figcaption>
      <DitherPreview
        width={device.width}
        height={device.height}
        palette={resolvePalette({
          colorMode,
          paletteVariant: args.paletteVariant,
        })}
        algorithm={args.ditherAlgorithm}
        supersampleFactor={args.supersampleFactor}
        zoom={zoom}
        rotation={device.rotation}
        isShownAsMounted={args.isShownAsMounted}
      >
        {stage}
      </DitherPreview>
    </figure>
  )
}
