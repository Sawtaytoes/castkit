import type { Meta, StoryObj } from "@storybook/react-vite"
import {
  DEFAULT_PANEL_ARGS,
  PANEL_ARG_TYPES,
  type PanelStoryArgs,
  renderPanelStory,
} from "../storybook/panelArgs.tsx"

/**
 * One photo beside a clockless agenda. The split stays truthful on panels
 * whose full repaint is too slow for a wall clock.
 */
const meta = {
  title: "Views/Photo Frame (Agenda)",
  argTypes: PANEL_ARG_TYPES,
  args: DEFAULT_PANEL_ARGS,
  render: (args: PanelStoryArgs) =>
    renderPanelStory({
      viewName: "Photo Frame (Agenda)",
      args,
    }),
} satisfies Meta<PanelStoryArgs>

export default meta

type Story = StoryObj<typeof meta>

export const ImpressionE6: Story = {
  name: "Impression E Ink Spectra 6 (800x480)",
  args: {
    ...DEFAULT_PANEL_ARGS,
    deviceId: "inky-impression",
    marginTop: 36,
    marginRight: 63,
    marginBottom: 28,
    marginLeft: 59,
  },
}

export const ImpressionE6Empty: Story = {
  name: "Impression E Ink Spectra 6 - no events",
  args: {
    ...DEFAULT_PANEL_ARGS,
    deviceId: "inky-impression",
    marginTop: 36,
    marginRight: 63,
    marginBottom: 28,
    marginLeft: 59,
    isEmpty: true,
  },
}
