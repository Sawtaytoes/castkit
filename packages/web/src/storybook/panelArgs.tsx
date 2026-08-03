import type { DitherAlgorithm } from "@castkit/core/devices/device"
import { DITHER_ALGORITHMS } from "@castkit/core/devices/device"
import type { ViewName } from "@castkit/shared/views/viewNames"
import type { ViewColourMode } from "@castkit/views/viewProps"
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
  colourMode: ViewColourMode | "device default"
  isDithered: boolean
  ditherAlgorithm: DitherAlgorithm
  supersampleFactor: number
  paletteVariant: PaletteVariant
  zoom: number
  isShownAsMounted: boolean
  cropTop: number
  cropRight: number
  cropBottom: number
  cropLeft: number
  isEmpty: boolean
}

export const PANEL_ARG_TYPES = {
  deviceId: {
    name: "Device",
    control: { type: "select" as const },
    options: PANEL_DEVICE_IDS,
    description:
      "Drives width, height, colour mode, palette and the supersample default.",
    table: { category: "Panel" },
  },
  colourMode: {
    name: "Colour mode",
    control: { type: "inline-radio" as const },
    options: ["device default", "mono", "e6"],
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
      '"off" ships full colour for the panel to dither itself.',
    table: { category: "Dither" },
  },
  supersampleFactor: {
    name: "Supersample",
    control: { type: "inline-radio" as const },
    options: [1, 2, 3, 4],
    description:
      "Render at N× native then downscale, baking anti-aliasing in before quantizing. Approximate: canvas bilinear here, Lanczos3 on the server.",
    table: { category: "Dither" },
  },
  paletteVariant: {
    name: "E6 palette",
    control: { type: "inline-radio" as const },
    options: PALETTE_VARIANTS,
    description:
      "Spectra 6 vivid/device blend. Ignored on mono panels.",
    table: { category: "Dither" },
  },

  cropTop: {
    name: "Crop top",
    control: { type: "number" as const, min: 0, max: 200 },
    table: { category: "Safe area (crop)" },
  },
  cropRight: {
    name: "Crop right",
    control: { type: "number" as const, min: 0, max: 200 },
    table: { category: "Safe area (crop)" },
  },
  cropBottom: {
    name: "Crop bottom",
    control: { type: "number" as const, min: 0, max: 200 },
    table: { category: "Safe area (crop)" },
  },
  cropLeft: {
    name: "Crop left",
    control: { type: "number" as const, min: 0, max: 200 },
    table: { category: "Safe area (crop)" },
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
  colourMode: "device default",
  isDithered: false,
  ditherAlgorithm: "floyd-steinberg",
  supersampleFactor: 2,
  paletteVariant: "default",
  zoom: 1,
  isShownAsMounted: false,
  cropTop: 0,
  cropRight: 0,
  cropBottom: 0,
  cropLeft: 0,
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
  const colourMode =
    args.colourMode === "device default"
      ? device.colourMode
      : args.colourMode
  const zoom = args.zoom || defaultZoom

  const stage = (
    <PanelStage
      viewName={viewName}
      width={device.width}
      height={device.height}
      colourMode={colourMode}
      photoUrl={photoUrl}
      isEmpty={args.isEmpty}
      cropInset={{
        top: args.cropTop,
        right: args.cropRight,
        bottom: args.cropBottom,
        left: args.cropLeft,
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
        colourMode={colourMode}
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
        {label} — {device.width}×{device.height}{" "}
        {colourMode} · {zoom}× · {args.ditherAlgorithm} @{" "}
        {args.supersampleFactor}×
      </figcaption>
      <DitherPreview
        width={device.width}
        height={device.height}
        palette={resolvePalette({
          colourMode,
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
