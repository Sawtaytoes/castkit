import type { Meta, StoryObj } from "@storybook/preact-vite"
import { PRINTERS } from "../__fixtures__/buildSpools.ts"
import { AmsFilaments } from "../views/AmsFilaments.tsx"
import { BROWSER_DEVICE_PROFILES } from "./deviceProfiles.ts"
import "../styles.css"

const meta: Meta<typeof AmsFilaments> = {
  title: "Views/AMS Filaments",
  component: AmsFilaments,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story, context) => {
      document.documentElement.dataset.scheme = "dark"
      return (
        <div
          style={{
            width: `${context.parameters.panelWidth ?? 1280}px`,
            height: `${context.parameters.panelHeight ?? 720}px`,
            position: "relative",
          }}
        >
          <Story />
        </div>
      )
    },
  ],
  args: {
    data: {
      printers: PRINTERS.map((printer, printerIndex) => ({
        ...printer,
        name: `Printer ${printerIndex + 1}`,
        ams: printer.ams.map((unit) => ({
          ...unit,
          temperatureCelsius: 28.5,
          trays: unit.trays.map((tray, index) =>
            index === 1 && tray.state !== "empty"
              ? { ...tray, kValue: 0.025 }
              : tray,
          ),
        })),
      })),
    },
  },
}
export default meta
type Story = StoryObj<typeof AmsFilaments>
export const SlotCards: Story = {}
export const SpoolRows: Story = {
  args: { initialLayout: "rows" },
}
export const Waiting: Story = { args: { data: null } }
export const Empty: Story = {
  args: { data: { printers: [] } },
}

const panelStory = (id: string) => {
  const profile = BROWSER_DEVICE_PROFILES.find(
    (device) => device.id === id,
  )
  return {
    parameters: {
      panelWidth: profile?.width,
      panelHeight: profile?.height,
    },
  }
}
export const MediaControls = panelStory("media-controls")
export const Workbench = panelStory("workbench")
export const Porthole = panelStory("porthole")
export const PiTouchPortrait = panelStory(
  "pi-touch-portrait",
)
