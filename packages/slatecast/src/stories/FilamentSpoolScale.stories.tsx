import type { SpoolsData } from "@castkit/shared/viewData/types"
import type {
  Decorator,
  StoryObj,
} from "@storybook/preact-vite"
import {
  ASH_GRAY_SPOOL,
  buildMatchedSpools,
  buildSpools,
  buildUnknownSpools,
  DUAL_COLOR_SPOOL,
  GALAXY_SPOOL,
  PRINTERS,
  TRANSLUCENT_SPOOL,
} from "../__fixtures__/buildSpools.ts"
import {
  type SpoolScreen,
  spoolScreen,
} from "../views/spoolScreen.ts"
import { PI_TOUCH_LANDSCAPE_PROFILE } from "./deviceProfiles.ts"
import {
  buildDeviceStories,
  renderApp,
  seedDecorator,
} from "./slatecastStory.tsx"

/**
 * Filament Spool Scale on fixture data.
 *
 * Every spool is INVENTED — products a filament shop sells, never the
 * household's inventory — because these stories feed the `vrt` job and a PNG
 * is opaque to every search that would otherwise catch a real name.
 *
 * The screen a story opens on is seeded through the view's own screen
 * signal, so a story can show the copy picker or the third assign step
 * without a play function driving the taps. The decorator sets it on EVERY
 * render, for the same reason `seedDecorator` re-seeds the data: module
 * state leaks between stories otherwise.
 */

const meta = {
  title: "Views/Filament Spool Scale",
  render: renderApp,
  decorators: [seedDecorator("filament-spool-scale")],
}

export default meta

type Story = StoryObj<typeof meta>

const deviceStories = buildDeviceStories({
  data: { spools: buildSpools() },
})

export const MediaControls: Story =
  deviceStories.MediaControls
export const Porthole: Story = deviceStories.Porthole
export const Workbench: Story = deviceStories.Workbench
export const PiTouchLandscape: Story =
  deviceStories.PiTouchLandscape
export const PiTouchPortrait: Story =
  deviceStories.PiTouchPortrait

/** Opens the view on a given screen before it renders. */
const screenDecorator =
  (screen: SpoolScreen): Decorator =>
  (Story) => {
    spoolScreen.value = screen
    return <Story />
  }

/**
 * The variants below are the 1280×720 panel only — the one with a scale
 * under it. The view is sized in px for that panel and no other.
 */
const panelVariant = ({
  name,
  data,
  screen = { kind: "spool" },
}: {
  name: string
  data: SpoolsData
  screen?: SpoolScreen
}): Story => ({
  ...(deviceStories.PiTouchLandscape as Story),
  name,
  decorators: [screenDecorator(screen)],
  parameters: {
    ...(deviceStories.PiTouchLandscape as Story).parameters,
    slatecast: {
      data: { spools: data },
      device: PI_TOUCH_LANDSCAPE_PROFILE,
    },
  },
})

export const Ready: Story = panelVariant({
  name: "Ready to scan",
  data: buildSpools(),
})

export const Matched: Story = panelVariant({
  name: "Tag matched",
  data: buildMatchedSpools(),
})

/** A translucent color on the reader: the swatch is a checkerboard under it. */
export const MatchedTranslucent: Story = panelVariant({
  name: "Tag matched, translucent",
  data: buildMatchedSpools({
    scale: { grams: 1_030, isStable: true, isOnline: true },
    tag: {
      state: "matched",
      uid: "9F8E7D6C",
      tagType: "NTAG215",
      spoolId: TRANSLUCENT_SPOOL.id,
    },
  }),
})

export const MatchedGalaxy: Story = panelVariant({
  name: "Tag matched, galaxy",
  data: buildMatchedSpools({
    scale: { grams: 1_077, isStable: true, isOnline: true },
    tag: {
      state: "matched",
      uid: GALAXY_SPOOL.tagUid,
      tagType: GALAXY_SPOOL.tagType,
      spoolId: GALAXY_SPOOL.id,
    },
  }),
})

export const MatchedDualColor: Story = panelVariant({
  name: "Tag matched, two colors",
  data: buildMatchedSpools({
    scale: { grams: 654, isStable: true, isOnline: true },
    tag: {
      state: "matched",
      uid: "7A6B5C4D",
      tagType: "NTAG215",
      spoolId: DUAL_COLOR_SPOOL.id,
    },
  }),
})

export const Unknown: Story = panelVariant({
  name: "Unknown tag",
  data: buildUnknownSpools(),
})

export const CopyPicker: Story = panelVariant({
  name: "Copy an existing spool",
  data: buildUnknownSpools(),
  screen: { kind: "pick", mode: "copy" },
})

export const LinkPicker: Story = panelVariant({
  name: "Link to a spool without a tag",
  data: buildUnknownSpools(),
  screen: { kind: "pick", mode: "link" },
})

export const AssignPrinter: Story = panelVariant({
  name: "Assign, step 1: printer",
  data: buildMatchedSpools(),
  screen: { kind: "assign", spoolId: ASH_GRAY_SPOOL.id },
})

export const AssignAms: Story = panelVariant({
  name: "Assign, step 2: AMS",
  data: buildMatchedSpools(),
  screen: {
    kind: "assign",
    spoolId: ASH_GRAY_SPOOL.id,
    printerId: "foopie",
  },
})

export const AssignSlot: Story = panelVariant({
  name: "Assign, step 3: slot",
  data: buildMatchedSpools(),
  screen: {
    kind: "assign",
    spoolId: ASH_GRAY_SPOOL.id,
    printerId: "foopie",
    amsId: 1,
  },
})

export const AmsView: Story = panelVariant({
  name: "AMS view",
  data: buildSpools(),
  screen: { kind: "ams", printerId: "foopie" },
})

/** The tab and the units draw dimmed: the trays are the last it saw. */
export const AmsViewOffline: Story = panelVariant({
  name: "AMS view, printer offline",
  data: buildSpools({
    printers: PRINTERS.map((printer) =>
      printer.id === "foopie"
        ? { ...printer, isOnline: false }
        : printer,
    ),
  }),
  screen: { kind: "ams", printerId: "foopie" },
})

export const ScaleOffline: Story = panelVariant({
  name: "Scale offline",
  data: buildMatchedSpools({
    scale: { grams: 0, isStable: false, isOnline: false },
  }),
})

/** Before the first `spools` push: the view has nothing to draw yet. */
export const Waiting: Story = {
  ...panelVariant({
    name: "Waiting for the scale",
    data: buildSpools(),
  }),
  parameters: {
    ...(deviceStories.PiTouchLandscape as Story).parameters,
    slatecast: {
      data: {},
      device: PI_TOUCH_LANDSCAPE_PROFILE,
    },
  },
}
