import type { Meta, StoryObj } from "@storybook/preact-vite"
import { buildMusicPlayer } from "../__fixtures__/buildMusicPlayer.ts"
import { MusicPlayer } from "../views/MusicPlayer.tsx"
import "../styles.css"

/*
 * Read once, at import. Under automation the preview freezes the clock first,
 * so the `vrt` capture draws the same position every time.
 */
const NOW_MS = Date.now()

const meta: Meta<typeof MusicPlayer> = {
  title: "Views/Music Player",
  component: MusicPlayer,
  parameters: {
    layout: "fullscreen",
    panelWidth: 1024,
    panelHeight: 600,
  },
  decorators: [
    (Story, context) => {
      document.documentElement.dataset.scheme = "dark"
      return (
        <div
          style={{
            width: `${context.parameters.panelWidth}px`,
            height: `${context.parameters.panelHeight}px`,
            position: "relative",
          }}
        >
          <Story />
        </div>
      )
    },
  ],
  args: {
    data: buildMusicPlayer({ nowMs: NOW_MS }),
    layout: "side-by-side",
    isLyricsTabVisible: true,
    playedRowCount: 2,
    isControlEnabled: true,
    onAction: async () => undefined,
  },
}
export default meta
type Story = StoryObj<typeof MusicPlayer>

/** The 1024 x 600 desk display: player beside the queue. */
export const SideBySide: Story = {}

/** The wide-waveform layout: one control strip, the queue below at full width. */
export const WideWaveform: Story = {
  args: { layout: "wide-waveform" },
}

/** Synced lyrics: the sung line is brightest and centered. */
export const LyricsTab: Story = {
  args: { initialTab: "lyrics" },
}

/** No waveform from the source: the seek bar falls back to a progress line. */
export const WithoutWaveform: Story = {
  args: {
    data: buildMusicPlayer({
      nowMs: NOW_MS,
      overrides: { waveform: undefined, lyrics: undefined },
    }),
  },
}

/** Paused at the start of the queue: nothing has played yet. */
export const PausedAtStart: Story = {
  args: {
    data: buildMusicPlayer({
      nowMs: NOW_MS,
      currentIndex: 0,
      state: "paused",
      positionSeconds: 0,
    }),
  },
}

/** A read-only view: every control is shown and disabled. */
export const ReadOnly: Story = {
  args: { isControlEnabled: false },
}

/** Waiting for the first snapshot. */
export const Waiting: Story = {
  args: { data: null },
}

/** A 1920 x 1080 browser window. */
export const Wide1080: Story = {
  parameters: { panelWidth: 1920, panelHeight: 1080 },
}

/** Too narrow for two columns: the player alone. */
export const Narrow: Story = {
  parameters: { panelWidth: 480, panelHeight: 600 },
}
