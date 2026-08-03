import type { DeviceMetadata } from "@castkit/core/devices/device"
import {
  IMPRESSION_DEVICE,
  M5PAPER_DEVICE,
  PHAT_DEVICE,
} from "@castkit/core/devices/device"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { PanelFrame } from "../PanelFrame.tsx"
import { PanelStage } from "../storybook/PanelStage.tsx"
import { STORY_VIEW_NAMES } from "../storybook/storyViewCatalog.tsx"

/**
 * One panel at a time, showing every view it can be told to display — the page
 * for reviewing a single device without the other panels competing for
 * attention. Each panel is shown at the zoom that makes it readable, so the
 * 250×122 pHAT is not a postage stamp next to the Impression.
 */

const DeviceSheet = ({
  device,
  zoom,
}: {
  device: DeviceMetadata
  zoom: number
}) => (
  <div
    style={{
      display: "flex",
      gap: 24,
      flexWrap: "wrap",
      alignItems: "flex-start",
      padding: 16,
      backgroundColor: "#ffffff",
    }}
  >
    {STORY_VIEW_NAMES.map((viewName) => (
      <PanelFrame
        key={viewName}
        label={viewName}
        width={device.width}
        height={device.height}
        colourMode={device.colourMode}
        zoom={zoom}
      >
        <PanelStage
          viewName={viewName}
          width={device.width}
          height={device.height}
          colourMode={device.colourMode}
        />
      </PanelFrame>
    ))}
  </div>
)

const meta = {
  title: "Overview/Per device",
  parameters: {
    layout: "fullscreen",
    controls: { disable: true },
  },
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

export const InkyPhat: Story = {
  name: "Inky pHAT — every view",
  render: () => (
    <DeviceSheet device={PHAT_DEVICE} zoom={3} />
  ),
}

export const InkyImpression: Story = {
  name: "Inky Impression — every view",
  render: () => (
    <DeviceSheet device={IMPRESSION_DEVICE} zoom={1} />
  ),
}

export const M5Paper: Story = {
  name: "M5Paper — every view",
  render: () => (
    <DeviceSheet device={M5PAPER_DEVICE} zoom={1} />
  ),
}
