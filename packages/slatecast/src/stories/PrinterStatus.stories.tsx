import type { PrinterJob } from "@castkit/shared/viewData/types"
import type {
  Decorator,
  StoryObj,
} from "@storybook/preact-vite"
import { buildPrinterJob } from "../__fixtures__/buildSnapshot.ts"
import { __setPrinterPendingForStories } from "../views/PrinterStatus.tsx"
import { PI_TOUCH_LANDSCAPE_PROFILE } from "./deviceProfiles.ts"
import { SCREENSHOT_EPOCH_MILLIS } from "./freezeClockUnderAutomation.ts"
import {
  buildDeviceStories,
  renderApp,
  seedDecorator,
} from "./slatecastStory.tsx"

/**
 * Printer Status on fixture data.
 *
 * The plate renders are INVENTED, not real ones. A real plate render of this
 * household's prints carries a person's name modeled into the part, and a
 * picture is opaque to every search that would otherwise catch it before a
 * public repo shipped it. These are square slicer-style renders of made-up
 * parts, drawn by `scripts/printer-fixture-images/`, so the card shows the
 * picture it shows on the glass: a square render on a dark field.
 */

const PLATE_PHOTO = "sample-photos/printer-plate-stand.png"
const PODS_PLATE = "sample-photos/printer-plate-pods.png"
const CANISTERS_PLATE =
  "sample-photos/printer-plate-canisters.png"

const MINUTE_MILLIS = 60_000

/**
 * A settled job's end time, pinned to the screenshot instant so the `vrt`
 * shot reads the same "Ended 12:47 PM" on every run. A person opening the
 * Storybook sees it dated, because the frozen clock is for automation only.
 */
const endedAtMs = (minutesAgo: number) =>
  SCREENSHOT_EPOCH_MILLIS - minutesAgo * MINUTE_MILLIS

const THREE_PRINTERS: readonly PrinterJob[] = [
  buildPrinterJob({
    thumbnailPath: PLATE_PHOTO,
    filaments: [
      {
        name: "PLA Matte",
        color: "#1c1c1c",
        location: "AMS 3, slot 3",
      },
      {
        name: "Support for PLA",
        color: "#f1e7d0",
        location: "AMS 1, slot 1",
      },
    ],
  }),
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
    thumbnailPath: PODS_PLATE,
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
    thumbnailPath: CANISTERS_PLATE,
  }),
]

/** A print that reached its last layer and is holding its plate. */
const FINISHED_PRINTER: PrinterJob = buildPrinterJob({
  id: "magi",
  name: "Magi",
  jobName:
    "Rear_Frame_R10_-_Matte_Charcoal_-_Carbon_Fiber_-_Magi",
  percent: 100,
  state: "finished",
  currentLayer: 334,
  totalLayers: 334,
  remainingMinutes: 0,
  finishAtMs: endedAtMs(47),
  thumbnailPath: PLATE_PHOTO,
})

/** A print the printer gave up on part way through. */
const FAILED_PRINTER: PrinterJob = buildPrinterJob({
  id: "foopie",
  name: "Foopie",
  jobName:
    "Supersquared_Five_Complete_Holders_-_Smoke_PETG_-_Foopie",
  percent: 41,
  state: "failed",
  currentLayer: 173,
  totalLayers: 499,
  remainingMinutes: 0,
  finishAtMs: endedAtMs(12),
  filamentText: "PETG Translucent · AMS 1 slot 4",
  filamentColor: "#8e8e8e",
  thumbnailPath: PLATE_PHOTO,
})

/** One of each: a plate waiting, a failure waiting, and a print still running. */
const MIXED_PRINTERS: readonly PrinterJob[] = [
  FINISHED_PRINTER,
  FAILED_PRINTER,
  THREE_PRINTERS[2] as PrinterJob,
]

type PrinterStatusParameters = {
  /** Actions the view mounts with already pending, keyed by printer id. */
  printerPending?: Record<string, "clear">
}

/**
 * Seeds the pending state before the view mounts. The pending label is
 * component state that only a tap sets, and a story cannot tap before its
 * picture is taken; every story resets it so nothing leaks between cells.
 */
const pendingDecorator: Decorator = (Story, context) => {
  const { printerPending = {} } = (context.parameters
    .printerStatus ?? {}) as PrinterStatusParameters
  __setPrinterPendingForStories(printerPending)
  return <Story />
}

const EXTRA_PRINTERS: readonly PrinterJob[] = Array.from(
  { length: 6 },
  (_, index) => {
    const printerNumber = index + 4
    return buildPrinterJob({
      id: `printer-${printerNumber}`,
      name: `Printer ${printerNumber}`,
      jobName: `Storage_Tray_Set_${printerNumber}_PETG`,
      percent: 82 - index * 9,
      currentLayer: 24 + index * 17,
      totalLayers: 188 + index * 23,
      remainingMinutes: 38 + index * 31,
      filamentText: "Matte PETG · AMS slot 2",
      thumbnailPath: PLATE_PHOTO,
    })
  },
)

const FOUR_PRINTERS: readonly PrinterJob[] = [
  ...THREE_PRINTERS.map((printer) => ({
    ...printer,
    thumbnailPath: PLATE_PHOTO,
  })),
  EXTRA_PRINTERS[0] as PrinterJob,
]
const FIVE_PRINTERS: readonly PrinterJob[] = [
  ...FOUR_PRINTERS,
  EXTRA_PRINTERS[1] as PrinterJob,
]
const NINE_PRINTERS: readonly PrinterJob[] = [
  ...FOUR_PRINTERS,
  ...EXTRA_PRINTERS.slice(1),
]

const meta = {
  title: "Views/3D Printer Status",
  render: renderApp,
  decorators: [
    pendingDecorator,
    seedDecorator("printer-status"),
  ],
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
 * more than twenty-four hours away names the day.
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

/*
 * A finished or failed print stays on the glass until the plate is cleared.
 * These are on every panel, not the workbench alone: the card changes shape
 * (no metrics, one solid button), and a shape is what a panel story is for.
 * The export names carry the panel so every id stays unique in the `vrt`
 * baseline.
 */

const finishedStories = buildDeviceStories({
  data: { printers: { printers: [FINISHED_PRINTER] } },
})

const failedStories = buildDeviceStories({
  data: { printers: { printers: [FAILED_PRINTER] } },
})

const mixedStories = buildDeviceStories({
  data: { printers: { printers: MIXED_PRINTERS } },
})

const clearingStories = buildDeviceStories({
  data: { printers: { printers: MIXED_PRINTERS } },
})

/** A device story renamed for the state it shows. */
const stateVariant = ({
  story,
  stateLabel,
  parameters = {},
}: {
  story: StoryObj
  stateLabel: string
  parameters?: PrinterStatusParameters
}): Story => ({
  ...(story as Story),
  name: `${stateLabel} · ${story.name ?? ""}`,
  parameters: {
    ...(story as Story).parameters,
    printerStatus: parameters,
  },
})

/** The one card, finished, at the 720x720 square. */
export const FinishedMediaControls: Story = stateVariant({
  story: finishedStories.MediaControls as StoryObj,
  stateLabel: "Finished",
})
export const FinishedPorthole: Story = stateVariant({
  story: finishedStories.Porthole as StoryObj,
  stateLabel: "Finished",
})
export const FinishedWorkbench: Story = stateVariant({
  story: finishedStories.Workbench as StoryObj,
  stateLabel: "Finished",
})
export const FinishedPiTouchLandscape: Story = stateVariant(
  {
    story: finishedStories.PiTouchLandscape as StoryObj,
    stateLabel: "Finished",
  },
)
export const FinishedPiTouchPortrait: Story = stateVariant({
  story: finishedStories.PiTouchPortrait as StoryObj,
  stateLabel: "Finished",
})

export const FailedMediaControls: Story = stateVariant({
  story: failedStories.MediaControls as StoryObj,
  stateLabel: "Failed",
})
export const FailedPorthole: Story = stateVariant({
  story: failedStories.Porthole as StoryObj,
  stateLabel: "Failed",
})
export const FailedWorkbench: Story = stateVariant({
  story: failedStories.Workbench as StoryObj,
  stateLabel: "Failed",
})
export const FailedPiTouchLandscape: Story = stateVariant({
  story: failedStories.PiTouchLandscape as StoryObj,
  stateLabel: "Failed",
})
export const FailedPiTouchPortrait: Story = stateVariant({
  story: failedStories.PiTouchPortrait as StoryObj,
  stateLabel: "Failed",
})

/** Finished, failed and printing side by side: three shapes in one row. */
export const MixedMediaControls: Story = stateVariant({
  story: mixedStories.MediaControls as StoryObj,
  stateLabel: "Mixed",
})
export const MixedPorthole: Story = stateVariant({
  story: mixedStories.Porthole as StoryObj,
  stateLabel: "Mixed",
})
export const MixedWorkbench: Story = stateVariant({
  story: mixedStories.Workbench as StoryObj,
  stateLabel: "Mixed",
})
export const MixedPiTouchLandscape: Story = stateVariant({
  story: mixedStories.PiTouchLandscape as StoryObj,
  stateLabel: "Mixed",
})
export const MixedPiTouchPortrait: Story = stateVariant({
  story: mixedStories.PiTouchPortrait as StoryObj,
  stateLabel: "Mixed",
})

/** The finished card after a tap: `Clearing…` until the next push drops it. */
const CLEARING = {
  printerPending: { magi: "clear" as const },
}

export const ClearingMediaControls: Story = stateVariant({
  story: clearingStories.MediaControls as StoryObj,
  stateLabel: "Clearing",
  parameters: CLEARING,
})
export const ClearingPorthole: Story = stateVariant({
  story: clearingStories.Porthole as StoryObj,
  stateLabel: "Clearing",
  parameters: CLEARING,
})
export const ClearingWorkbench: Story = stateVariant({
  story: clearingStories.Workbench as StoryObj,
  stateLabel: "Clearing",
  parameters: CLEARING,
})
export const ClearingPiTouchLandscape: Story = stateVariant(
  {
    story: clearingStories.PiTouchLandscape as StoryObj,
    stateLabel: "Clearing",
    parameters: CLEARING,
  },
)
export const ClearingPiTouchPortrait: Story = stateVariant({
  story: clearingStories.PiTouchPortrait as StoryObj,
  stateLabel: "Clearing",
  parameters: CLEARING,
})

export const FourPrinters: Story = {
  ...workbenchVariant(FOUR_PRINTERS),
  name: "Four printers",
}

export const FivePrinters: Story = {
  ...workbenchVariant(FIVE_PRINTERS),
  name: "Five printers",
}

export const NinePrinters: Story = {
  ...workbenchVariant(NINE_PRINTERS),
  name: "Nine printers",
}
