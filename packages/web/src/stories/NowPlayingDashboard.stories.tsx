import { PHAT_DEVICE } from "@castkit/core/devices/device"
import { NowPlayingDashboard } from "@castkit/views/NowPlayingDashboard"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { DitherPreview } from "../storybook/DitherPreview.tsx"
import {
  DEFAULT_PANEL_ARGS,
  PANEL_ARG_TYPES,
  type PanelStoryArgs,
  renderPanelStory,
} from "../storybook/panelArgs.tsx"

/**
 * Title-anchored now-playing with art beside the text and a date/time footer strip.
 *
 * Every story here is the same view under the shared panel controls — switch
 * `Device` to see it on another panel, turn `Dither` on to see what the glass
 * paints, and set the crop numbers to preview a mat.
 */
const meta = {
  title: "Views/Now Playing (Dashboard)",
  argTypes: PANEL_ARG_TYPES,
  args: DEFAULT_PANEL_ARGS,
  render: (args: PanelStoryArgs) =>
    renderPanelStory({
      viewName: "Now Playing (Dashboard)",
      args,
    }),
} satisfies Meta<PanelStoryArgs>

export default meta

type Story = StoryObj<typeof meta>

export const PhatMono: Story = {
  name: "pHAT mono (250x122)",
  args: {
    ...DEFAULT_PANEL_ARGS,
    deviceId: "inky-phat",
    zoom: 3,
  },
}

export const ImpressionE6: Story = {
  name: "Impression E Ink Spectra 6 (800x480)",
  args: {
    ...DEFAULT_PANEL_ARGS,
    deviceId: "inky-impression",
  },
}

export const M5PaperMono: Story = {
  name: "M5Paper mono (960x540)",
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

/** The first canvas draw must include offline Japanese font glyphs. */
export const JapaneseDithered: Story = {
  name: "Japanese metadata — dithered (250x122)",
  parameters: { controls: { disable: true } },
  render: () => (
    <DitherPreview
      width={250}
      height={122}
      palette={PHAT_DEVICE.palette}
      algorithm="off"
      supersampleFactor={4}
      zoom={3}
      rotation={0}
      isShownAsMounted={false}
    >
      <NowPlayingDashboard
        width={250}
        height={122}
        colorMode="monochrome"
        title="日本語の音楽 ABC123"
        artist="ひらがな カタカナ"
        album="東京 音楽"
        date="Mo-26"
        time="6:17p"
        isPlaying
      />
    </DitherPreview>
  ),
}
