import type { QueueItem } from "@castkit/shared/viewData/types"
import type { StoryObj } from "@storybook/preact-vite"
import {
  buildDeviceStories,
  FULL_VIEW_DATA,
  renderApp,
  seedDecorator,
} from "./slatecastStory.tsx"

/**
 * A whole album queued, the current track first. Two rows never reached the
 * bottom of any panel, so the stories could not show whether the list fills
 * the glass or where it stops. Every third row has no artwork, because the
 * placeholder is a row shape of its own. The artwork is the CC0 sample photos.
 */
const ARTWORK = [
  "sample-photos/landscape-gradient.jpg",
  "sample-photos/landscape-color.jpg",
  undefined,
  "sample-photos/landscape-highcontrast.jpg",
  "sample-photos/landscape-neutral-text.jpg",
  undefined,
] as const

const TRACKS = [
  ["Roygbiv", 151],
  ["Rue the Whirl", 399],
  ["Aquarius", 348],
  ["Olson", 90],
  ["Pete Standing Alone", 371],
  ["Smokes Quantity", 187],
  ["Open the Light", 265],
  ["One Very Important Thought", 74],
  ["Wildlife Analysis", 77],
  ["An Eagle in Your Mind", 383],
  ["The Color of the Fire", 105],
  ["Telephasic Workshop", 395],
] as const

const FULL_QUEUE: readonly QueueItem[] = TRACKS.map(
  ([title, durationSeconds], index) => ({
    title,
    artist: "Boards of Canada",
    artworkPath: ARTWORK[index % ARTWORK.length],
    durationSeconds,
    isCurrent: index === 0,
  }),
)

const meta = {
  title: "Views/Queue",
  render: renderApp,
  decorators: [seedDecorator("queue")],
}

export default meta

type Story = StoryObj<typeof meta>

const deviceStories = buildDeviceStories({
  data: { ...FULL_VIEW_DATA, queue: { items: FULL_QUEUE } },
})

export const MediaControls: Story =
  deviceStories.MediaControls
export const Porthole: Story = deviceStories.Porthole
export const Workbench: Story = deviceStories.Workbench
export const PiTouchLandscape: Story =
  deviceStories.PiTouchLandscape
export const PiTouchPortrait: Story =
  deviceStories.PiTouchPortrait
