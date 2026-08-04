import type { StoryObj } from "@storybook/preact-vite"
import {
  buildDeviceStories,
  renderApp,
  seedDecorator,
} from "./slatecastStory.tsx"

const meta = {
  title: "Browser views/Photo Frame",
  render: renderApp,
  decorators: [seedDecorator("photo-frame")],
}

export default meta

type Story = StoryObj<typeof meta>

const deviceStories = buildDeviceStories({
  photoHandlerPath: "sample-photos/landscape-colour.jpg",
})

export const MediaControls: Story =
  deviceStories.MediaControls
export const Porthole: Story = deviceStories.Porthole
