import type { StoryObj } from "@storybook/preact-vite"
import { buildNowPlaying } from "../__fixtures__/buildSnapshot.ts"
import {
  buildDeviceStories,
  FULL_VIEW_DATA,
  renderApp,
  STORY_ARTWORK_PATH,
  seedDecorator,
} from "./slatecastStory.tsx"

const meta = {
  title: "Browser views/Now Playing",
  render: renderApp,
  decorators: [seedDecorator("now-playing")],
}

export default meta

type Story = StoryObj<typeof meta>

// With artwork: the picture is the view's anchor and, on a touch panel, its
// only transport, so a story without one shows the wrong thing.
const deviceStories = buildDeviceStories({
  data: {
    ...FULL_VIEW_DATA,
    nowPlaying: buildNowPlaying({
      artworkPath: STORY_ARTWORK_PATH,
    }),
  },
  photoHandlerPath: "sample-photos/landscape-colour.jpg",
})

export const MediaControls: Story =
  deviceStories.MediaControls
export const Porthole: Story = deviceStories.Porthole
export const Workbench: Story = deviceStories.Workbench
