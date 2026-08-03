import type { Meta, StoryObj } from "@storybook/react-vite"
import {
  DEFAULT_PANEL_ARGS,
  PANEL_ARG_TYPES,
  type PanelStoryArgs,
  renderPanelStory,
} from "../storybook/panelArgs.tsx"

/**
 * Full-height album art beside a playbill with an accent label and play-state bars.
 *
 * Every story here is the same view under the shared panel controls — switch
 * `Device` to see it on another panel, turn `Dither` on to see what the glass
 * paints, and set the crop numbers to preview a mat.
 */
const meta = {
  title: "Views/Now Playing (Poster)",
  argTypes: PANEL_ARG_TYPES,
  args: DEFAULT_PANEL_ARGS,
  render: (args: PanelStoryArgs) =>
    renderPanelStory({
      viewName: "Now Playing (Poster)",
      args,
    }),
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

export const M5PaperDithered: Story = {
  name: "M5Paper mono — dithered (no hardware dither)",
  args: {
    ...DEFAULT_PANEL_ARGS,
    deviceId: "m5paper",
    isDithered: true,
    ditherAlgorithm: "floyd-steinberg",
  },
}
