import type { StoryObj } from "@storybook/preact-vite"
import {
  buildDeviceStories,
  renderApp,
  seedDecorator,
} from "./slatecastStory.tsx"

/**
 * What a panel shows when it is asked for a view its bundle does not have.
 *
 * Not a configured view, which is why it sits under `States/` and is not in the
 * all-screens grid. It is the state a panel reaches when the server has been
 * deployed under it and its page never reloaded — on 2026-09-23 the workbench
 * panel was told to show `printer-status`, had no such view, and showed Now
 * Playing's idle card over two running prints. A current bundle reloads itself
 * instead (see the new-build-reloads-a-live-browser-panel record); this state
 * exists so the next mismatch names itself.
 */
const meta = {
  title: "States/Out Of Date",
  render: renderApp,
  decorators: [seedDecorator("a-view-from-a-later-build")],
}

export default meta

type Story = StoryObj<typeof meta>

const deviceStories = buildDeviceStories()

export const MediaControls: Story =
  deviceStories.MediaControls
export const Porthole: Story = deviceStories.Porthole
export const Workbench: Story = deviceStories.Workbench
export const PiTouchLandscape: Story =
  deviceStories.PiTouchLandscape
export const PiTouchPortrait: Story =
  deviceStories.PiTouchPortrait
