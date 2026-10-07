import type { StoryObj } from "@storybook/preact-vite"
import {
  buildDeviceStories,
  renderApp,
  seedDecorator,
} from "./slatecastStory.tsx"

const meta = {
  title: "Views/Print Queue",
  render: renderApp,
  decorators: [seedDecorator("print-queue")],
}
export default meta

type Story = StoryObj<typeof meta>
const deviceStories = buildDeviceStories({
  data: {
    printQueue: {
      items: [
        {
          title: "Storage tray",
          artist: "Printer 1 · Printing",
          durationSeconds: 5400,
          isCurrent: true,
        },
        {
          title: "Cable holder",
          artist: "Printer 2 · Manual start",
          durationSeconds: 1800,
          isCurrent: false,
        },
        {
          title: "Display stand",
          artist: "Any available printer · Pending",
          durationSeconds: 7200,
          isCurrent: false,
        },
      ],
    },
  },
})
export const Workbench: Story = deviceStories.Workbench
export const PiTouchLandscape: Story =
  deviceStories.PiTouchLandscape
