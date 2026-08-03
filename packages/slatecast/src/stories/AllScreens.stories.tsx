import type { Meta, StoryObj } from "@storybook/preact-vite"
import {
  BROWSER_DEVICE_PROFILES,
  MEDIA_CONTROLS_PROFILE,
} from "./deviceProfiles.ts"

/**
 * Every browser view on every browser panel, in one scrollable grid.
 *
 * Each cell is a real `<iframe>` pointing at the matching per-view story, sized
 * to the panel. That is not a flourish: slatecast lays out in `vmin`/`vw`/`vh`,
 * and those units resolve against the iframe's OWN viewport — so a nested
 * iframe is the only way to show many panels at once and have each one's
 * layout be correct. A plain scaled `<div>` would read the outer viewport and
 * mis-size every panel.
 */

const VIEW_STORIES = [
  {
    label: "Now Playing",
    storyId: "browser-views-now-playing",
  },
  { label: "Queue", storyId: "browser-views-queue" },
  { label: "Ambient", storyId: "browser-views-ambient" },
  { label: "Clock", storyId: "browser-views-clock" },
  { label: "Weather", storyId: "browser-views-weather" },
  { label: "Calendar", storyId: "browser-views-calendar" },
  {
    label: "Photo Frame",
    storyId: "browser-views-photo-frame",
  },
] as const

const CELL_LABEL_STYLE = {
  fontFamily: "monospace",
  fontSize: "11px",
  color: "#333",
  marginBottom: "4px",
}

const buildStoryUrl = ({
  storyId,
  storyExport,
}: {
  storyId: string
  storyExport: string
}) =>
  `iframe.html?viewMode=story&id=${storyId}--${storyExport}`

const AllBrowserScreens = () => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: "32px",
      padding: "16px",
      backgroundColor: "#ffffff",
    }}
  >
    {VIEW_STORIES.map((view) => (
      <section key={view.storyId}>
        <h2
          style={{
            fontFamily: "system-ui, sans-serif",
            fontSize: "15px",
            margin: "0 0 10px",
          }}
        >
          {view.label}
        </h2>
        <div
          style={{
            display: "flex",
            gap: "24px",
            flexWrap: "wrap",
            alignItems: "flex-start",
          }}
        >
          {BROWSER_DEVICE_PROFILES.map((device) => (
            <figure key={device.id} style={{ margin: 0 }}>
              <figcaption style={CELL_LABEL_STYLE}>
                {device.label} — {device.width}×
                {device.height}
              </figcaption>
              <iframe
                title={`${view.label} on ${device.label}`}
                src={buildStoryUrl({
                  storyId: view.storyId,
                  storyExport:
                    device.id === MEDIA_CONTROLS_PROFILE.id
                      ? "media-controls"
                      : "porthole",
                })}
                width={device.width}
                height={device.height}
                style={{
                  border: "1px solid #808080",
                  // The inner story's own viewport preset would letterbox the
                  // panel inside a larger frame; the iframe is already the panel
                  // size, so this keeps it 1:1.
                  colorScheme: "normal",
                }}
              />
            </figure>
          ))}
        </div>
      </section>
    ))}
  </div>
)

const meta = {
  title: "Overview/All browser screens",
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

export const EveryViewEveryPanel: Story = {
  name: "Every browser view × every browser panel",
  render: () => <AllBrowserScreens />,
}
