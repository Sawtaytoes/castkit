import type { StoryObj } from "@storybook/preact-vite"
import {
  buildDeviceStories,
  renderApp,
  seedDecorator,
} from "./slatecastStory.tsx"

const meta = {
  title: "Browser views/Clock",
  render: renderApp,
  decorators: [seedDecorator("clock")],
}

export default meta

type Story = StoryObj<typeof meta>

const deviceStories = buildDeviceStories({})

export const MediaControls: Story =
  deviceStories.MediaControls
export const Porthole: Story = deviceStories.Porthole
