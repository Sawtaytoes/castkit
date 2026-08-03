import { IMPRESSION_DEVICE } from "@castkit/core/devices/device"
import type { SafeAreaInset } from "@castkit/core/panels/safeArea"
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
 * The safe-area crop — the HA `Display: Crop {edge}` numbers (0–200px), which
 * exist because a physical mat overlaps the panel edge and hides whatever is
 * under it.
 *
 * The important thing to see here is that a crop is **not** a clip. The view
 * is laid out *inside* the reduced box, so its text reflows and re-fits to what
 * stays visible; it is then composited onto a full-size white panel. Cropping
 * by hiding overflow would show the uncropped layout with its edges chopped —
 * which is what you might expect from the name, and is not what happens.
 *
 * Photo views are the deliberate exception: they bleed to the panel edge and
 * ignore the inset entirely, because a photo looks right filling the panel even
 * under a mat.
 */

const CAPTION_STYLE = {
  fontFamily: "monospace",
  fontSize: 11,
  color: "#333",
  marginBottom: 4,
} as const

const CropCell = ({
  viewName,
  cropInset,
  caption,
}: {
  viewName: ViewName
  cropInset?: SafeAreaInset
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
        colourMode="e6"
        cropInset={cropInset}
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
    <CropCell viewName={viewName} caption="No crop" />
    <CropCell
      viewName={viewName}
      cropInset={{
        top: 40,
        right: 40,
        bottom: 40,
        left: 40,
      }}
      caption="40px all round — text reflows into the smaller box"
    />
    <CropCell
      viewName={viewName}
      cropInset={{
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
  title: "Safe area (crop)/Behaviour",
  parameters: {
    layout: "fullscreen",
    controls: { disable: true },
  },
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

export const TextViewHonoursCrop: Story = {
  name: "A text view reflows into the crop",
  render: () => <ComparisonRow viewName="Clock (Agenda)" />,
}

export const AgendaHonoursCrop: Story = {
  name: "Agenda — same crop, different layout budget",
  render: () => <ComparisonRow viewName="Agenda" />,
}

export const PhotoViewIgnoresCrop: Story = {
  name: "A photo view bleeds and ignores the crop",
  render: () => <ComparisonRow viewName="Photo Frame" />,
}

export const ExtremeCropClamps: Story = {
  name: "An impossible crop clamps instead of collapsing",
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
      <CropCell
        viewName="Clock"
        cropInset={{
          top: 400,
          right: 600,
          bottom: 400,
          left: 600,
        }}
        caption="Crops larger than the panel — clamped to a 1×1 content box"
      />
    </div>
  ),
}

/**
 * The interactive one: drag the four crop numbers and watch the view re-fit.
 * Switch `Device` to check a crop against every panel, and flip to a photo
 * view to confirm it stays put.
 */
export const Interactive: StoryObj<PanelStoryArgs> = {
  name: "Interactive — drag the crop numbers",
  parameters: { layout: "centered", controls: {} },
  argTypes: PANEL_ARG_TYPES,
  args: {
    ...DEFAULT_PANEL_ARGS,
    cropTop: 30,
    cropRight: 30,
    cropBottom: 30,
    cropLeft: 30,
  },
  render: (args: PanelStoryArgs) =>
    renderPanelStory({
      viewName: "Clock (Agenda)",
      args,
    }),
}
