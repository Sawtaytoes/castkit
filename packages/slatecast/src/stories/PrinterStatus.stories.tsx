import type { PrinterJob } from "@castkit/shared/viewData/types"
import type { StoryObj } from "@storybook/preact-vite"
import { buildPrinterJob } from "../__fixtures__/buildSnapshot.ts"
import { PI_TOUCH_LANDSCAPE_PROFILE } from "./deviceProfiles.ts"
import {
  buildDeviceStories,
  renderApp,
  seedDecorator,
} from "./slatecastStory.tsx"

/**
 * Printer Status on fixture data.
 *
 * The plate renders are SAMPLE PHOTOS, not real ones. A real plate render of
 * this household's prints carries a person's name modeled into the part, and a
 * picture is opaque to every search that would otherwise catch it before a
 * public repo shipped it. The shape of the card is what a story has to show,
 * and a landscape photo tests the fit harder than a square render does.
 */

const PLATE_PHOTO = "sample-photos/landscape-gradient.jpg"

const THREE_PRINTERS: readonly PrinterJob[] = [
  buildPrinterJob({ thumbnailPath: PLATE_PHOTO }),
  buildPrinterJob({
    id: "foopie",
    name: "Foopie",
    jobName:
      "AMS_2_Pro_Dry_Pods_-_Six_Large_-_Smoke_PETG_-_Foopie_-_240C",
    percent: 38,
    currentLayer: 173,
    totalLayers: 499,
    remainingMinutes: 537,
    filamentText: "PETG Translucent · AMS 1 slot 4",
    filamentColor: "#8e8e8e",
    thumbnailPath: PLATE_PHOTO,
  }),
  buildPrinterJob({
    id: "quadrahedron",
    name: "Quadrahedron",
    jobName:
      "Laundry_ACD_15_Swaps_Lips_Then_Icons_Quadrahedron",
    percent: 2,
    currentLayer: 13,
    totalLayers: 503,
    remainingMinutes: 331,
    filamentText: "PLA Basic · AMS 2 slot 4",
    thumbnailPath: PLATE_PHOTO,
  }),
]

const meta = {
  title: "Views/Printer Status",
  render: renderApp,
  decorators: [seedDecorator("printer-status")],
}

export default meta

type Story = StoryObj<typeof meta>

const deviceStories = buildDeviceStories({
  data: { printers: { printers: THREE_PRINTERS } },
})

export const MediaControls: Story =
  deviceStories.MediaControls
export const Porthole: Story = deviceStories.Porthole
export const Workbench: Story = deviceStories.Workbench
export const PiTouchLandscape: Story =
  deviceStories.PiTouchLandscape
export const PiTouchPortrait: Story =
  deviceStories.PiTouchPortrait

/**
 * The variants below are the workbench panel only. Count is what changes the
 * layout, and this is the panel the view was drawn for — repeating each state
 * on five panels would add twenty cells that say the same thing.
 */
const workbenchVariant = (
  printers: readonly PrinterJob[],
): Story => ({
  ...(deviceStories.PiTouchLandscape as Story),
  parameters: {
    ...(deviceStories.PiTouchLandscape as Story).parameters,
    slatecast: {
      data: { printers: { printers } },
      device: PI_TOUCH_LANDSCAPE_PROFILE,
    },
  },
})

/** One printer puts the picture BESIDE the facts, and the type grows. */
export const OnePrinter: Story = {
  ...workbenchVariant([THREE_PRINTERS[0] as PrinterJob]),
  name: "One printer",
}

export const TwoPrinters: Story = {
  ...workbenchVariant(THREE_PRINTERS.slice(0, 2)),
  name: "Two printers",
}

export const Paused: Story = {
  ...workbenchVariant([
    buildPrinterJob({
      state: "paused",
      thumbnailPath: PLATE_PHOTO,
    }),
    THREE_PRINTERS[1] as PrinterJob,
  ]),
  name: "One paused",
}

export const Problem: Story = {
  ...workbenchVariant([
    buildPrinterJob({
      problemText:
        "HMS_0300_0100_0001_0007 — filament ran out",
      state: "paused",
      thumbnailPath: PLATE_PHOTO,
    }),
    THREE_PRINTERS[1] as PrinterJob,
    THREE_PRINTERS[2] as PrinterJob,
  ]),
  name: "One reporting a problem",
}

export const Preparing: Story = {
  ...workbenchVariant([
    buildPrinterJob({
      state: "preparing",
      percent: 0,
      currentLayer: 0,
      thumbnailPath: PLATE_PHOTO,
    }),
  ]),
  name: "Preparing",
}

export const NothingPrinting: Story = {
  ...workbenchVariant([]),
  name: "Nothing printing",
}

/**
 * The case the bare clock time got wrong. A print of more than a day showed
 * "3:47 PM" beside its percentage, and that reads as this afternoon. A finish
 * on any other calendar day now names the day.
 *
 * Three cards, because three is where the metric block is narrowest and the
 * longer string has the least room.
 */
export const FinishesTomorrow: Story = {
  ...workbenchVariant([
    buildPrinterJob({
      currentLayer: 44,
      percent: 12,
      remainingMinutes: 1_604,
      thumbnailPath: PLATE_PHOTO,
      totalLayers: 1_180,
    }),
    THREE_PRINTERS[1] as PrinterJob,
    THREE_PRINTERS[2] as PrinterJob,
  ]),
  name: "A print that finishes tomorrow",
}

/**
 * A job that has not started names no tray yet. Its Filament row still draws,
 * as a placeholder, so the card stays as tall as the running ones beside it.
 */
export const PreparingBesideRunning: Story = {
  ...workbenchVariant([
    buildPrinterJob({
      state: "preparing",
      percent: 0,
      currentLayer: 0,
      filamentText: undefined,
      filamentColor: undefined,
      thumbnailPath: PLATE_PHOTO,
    }),
    THREE_PRINTERS[1] as PrinterJob,
    THREE_PRINTERS[2] as PrinterJob,
  ]),
  name: "Preparing beside running printers",
}
