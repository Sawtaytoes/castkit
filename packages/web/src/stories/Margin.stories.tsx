import { IMPRESSION_DEVICE } from "@castkit/core/devices/device"
import type { PanelMargin } from "@castkit/core/panels/safeArea"
import type { ViewName } from "@castkit/shared/views/viewNames"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { PanelStage } from "../storybook/PanelStage.tsx"
import {
  DEFAULT_PANEL_ARGS,
  PANEL_ARG_TYPES,
  type PanelStoryArgs,
  renderPanelStory,
} from "../storybook/panelArgs.tsx"

/**
 * The panel margin — the HA `Display: Margin {edge}` numbers (0-200px), which
 * exist because a physical mat overlaps the panel edge and hides whatever is
 * under it.
 *
 * A margin **cuts nothing**. The view is laid out *inside* the reduced box, so
 * its text reflows and re-fits to what stays visible; it is then composited
 * onto a full-size white panel. Clipping instead would show the full-size
 * layout with its edges chopped, which is not what happens.
 *
 * **Every** view honors the margin, photos included. The knob that does cut is
 * `Photo Frame: Crop`, a separate control on a separate axis. See
 * docs/decisions/2026-09-08-margin-pushes-in-and-crop-cuts-away.md.
 */

const CAPTION_STYLE = {
  fontFamily: "monospace",
  fontSize: 11,
  color: "#333",
  marginBottom: 4,
} as const

const MarginCell = ({
  viewName,
  panelMargin,
  caption,
}: {
  viewName: ViewName
  panelMargin?: PanelMargin
  caption: string
}) => (
  <figure style={{ margin: 0 }}>
    <figcaption style={CAPTION_STYLE}>{caption}</figcaption>
    <div
      style={{
        border: "1px solid #808080",
        width: IMPRESSION_DEVICE.width,
        height: IMPRESSION_DEVICE.height,
      }}
    >
      <PanelStage
        viewName={viewName}
        width={IMPRESSION_DEVICE.width}
        height={IMPRESSION_DEVICE.height}
        colorMode="spectra6"
        panelMargin={panelMargin}
      />
    </div>
  </figure>
)

const ComparisonRow = ({
  viewName,
}: {
  viewName: ViewName
}) => (
  <div
    style={{
      display: "flex",
      gap: 20,
      flexWrap: "wrap",
      alignItems: "flex-start",
      padding: 16,
      backgroundColor: "#ffffff",
    }}
  >
    <MarginCell viewName={viewName} caption="No margin" />
    <MarginCell
      viewName={viewName}
      panelMargin={{
        top: 40,
        right: 40,
        bottom: 40,
        left: 40,
      }}
      caption="40px all round — the view reflows into the smaller box"
    />
    <MarginCell
      viewName={viewName}
      panelMargin={{
        top: 20,
        right: 80,
        bottom: 60,
        left: 10,
      }}
      caption="Asymmetric 20/80/60/10"
    />
  </div>
)

const meta = {
  title: "Margin/Behavior",
  parameters: {
    layout: "fullscreen",
    controls: { disable: true },
  },
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

export const TextViewHonorsMargin: Story = {
  name: "A text view reflows into the margin",
  render: () => <ComparisonRow viewName="Clock (Agenda)" />,
}

export const AgendaHonorsMargin: Story = {
  name: "Agenda — same margin, different layout budget",
  render: () => <ComparisonRow viewName="Agenda" />,
}

export const PhotoViewHonorsMargin: Story = {
  name: "A photo view fits the margin too",
  render: () => <ComparisonRow viewName="Photo Frame" />,
}

export const ExtremeMarginClamps: Story = {
  name: "An impossible margin clamps instead of collapsing",
  render: () => (
    <div
      style={{
        display: "flex",
        gap: 20,
        flexWrap: "wrap",
        padding: 16,
        backgroundColor: "#ffffff",
      }}
    >
      <MarginCell
        viewName="Clock"
        panelMargin={{
          top: 400,
          right: 600,
          bottom: 400,
          left: 600,
        }}
        caption="Margins larger than the panel - clamped to a 1x1 content box"
      />
    </div>
  ),
}

/**
 * The interactive one: drag the four margin numbers and watch the view re-fit.
 * Switch `Device` to check a margin against every panel.
 */
export const Interactive: StoryObj<PanelStoryArgs> = {
  name: "Interactive — drag the margin numbers",
  parameters: { layout: "centered", controls: {} },
  argTypes: PANEL_ARG_TYPES,
  args: {
    ...DEFAULT_PANEL_ARGS,
    marginTop: 30,
    marginRight: 30,
    marginBottom: 30,
    marginLeft: 30,
  },
  render: (args: PanelStoryArgs) =>
    renderPanelStory({
      viewName: "Clock (Agenda)",
      args,
    }),
}
