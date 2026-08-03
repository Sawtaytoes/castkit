import type { StoryObj } from "@storybook/preact-vite"
import {
  buildDeviceStories,
  renderApp,
  seedDecorator,
} from "./slatecastStory.tsx"

const meta = {
  title: "Browser views/Queue",
  render: renderApp,
  decorators: [seedDecorator("queue")],
}

export default meta

type Story = StoryObj<typeof meta>

const deviceStories = buildDeviceStories({})

export const MediaControls: Story =
  deviceStories.MediaControls
export const Porthole: Story = deviceStories.Porthole
