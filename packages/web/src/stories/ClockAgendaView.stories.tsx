import type { Meta, StoryObj } from "@storybook/react-vite"
import {
  DEFAULT_PANEL_ARGS,
  PANEL_ARG_TYPES,
  type PanelStoryArgs,
  renderPanelStory,
} from "../storybook/panelArgs.tsx"

/**
 * Big clock over the day's agenda. Degrades to the clock/weather layout when there are no events.
 *
 * Every story here is the same view under the shared panel controls — switch
 * `Device` to see it on another panel, turn `Dither` on to see what the glass
 * paints, and set the crop numbers to preview a mat.
 */
const meta = {
  title: "Views/Clock (Agenda)",
  argTypes: PANEL_ARG_TYPES,
  args: DEFAULT_PANEL_ARGS,
  render: (args: PanelStoryArgs) =>
    renderPanelStory({ viewName: "Clock (Agenda)", args }),
} satisfies Meta<PanelStoryArgs>

export default meta

type Story = StoryObj<typeof meta>

export const PhatMono: Story = {
  name: "pHAT mono (250×122)",
  args: {
    ...DEFAULT_PANEL_ARGS,
    deviceId: "inky-phat",
    zoom: 3,
  },
}

export const ImpressionE6: Story = {
  name: "Impression E6 (800×480)",
  args: {
    ...DEFAULT_PANEL_ARGS,
    deviceId: "inky-impression",
  },
}

export const M5PaperMono: Story = {
  name: "M5Paper mono (540×960)",
  args: { ...DEFAULT_PANEL_ARGS, deviceId: "m5paper" },
}

export const ImpressionE6Empty: Story = {
  name: "Impression E6 — no events",
  args: {
    ...DEFAULT_PANEL_ARGS,
    deviceId: "inky-impression",
    isEmpty: true,
  },
}

export const PhatMonoEmpty: Story = {
  name: "pHAT mono — no events",
  args: {
    ...DEFAULT_PANEL_ARGS,
    deviceId: "inky-phat",
    zoom: 3,
    isEmpty: true,
  },
}

export const M5PaperDithered: Story = {
  name: "M5Paper mono — dithered (no hardware dither)",
  args: {
    ...DEFAULT_PANEL_ARGS,
    deviceId: "m5paper",
    isDithered: true,
    ditherAlgorithm: "floyd-steinberg",
  },
}
