import type { Meta, StoryObj } from "@storybook/preact-vite"
import { BROWSER_DEVICE_PROFILES } from "./deviceProfiles.ts"
import { PANEL_QUERY_FLAG } from "./panelFrame.tsx"
import { STORY_EXPORT_BY_DEVICE_ID } from "./slatecastStory.tsx"

/**
 * Every browser view on every browser panel, in one scrollable grid.
 *
 * Each cell is a real `<iframe>` pointing at the matching per-view story, sized
 * to the panel. That is not a flourish: slatecast lays out in `vmin`/`vw`/`vh`,
 * and those units resolve against the iframe's OWN viewport — so a nested
 * iframe is the only way to show many panels at once and have each one's
 * layout be correct. A plain scaled `<div>` would read the outer viewport and
 * mis-size every panel.
 *
 * The cells ask for the panel document directly ({@link PANEL_QUERY_FLAG}), so
 * a cell holds the app rather than the app inside its own single-panel frame.
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
  color: "#333",
  fontFamily: "monospace",
  fontSize: "11px",
  marginBottom: "4px",
}

/**
 * Storybook's story id is the component id plus the export name, lower-cased
 * with each capital turned into a hyphenated word. `PiTouchLandscape` becomes
 * `pi-touch-landscape`, which is the same transform applied here rather than a
 * second hand-maintained list.
 */
const toStoryExportId = (exportName: string) =>
  exportName
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()

const buildStoryUrl = ({
  storyId,
  storyExport,
}: {
  storyId: string
  storyExport: string
}) =>
  `iframe.html?viewMode=story&id=${storyId}--${toStoryExportId(storyExport)}&${PANEL_QUERY_FLAG}=1`

const AllBrowserScreens = () => (
  <div
    style={{
      backgroundColor: "#ffffff",
      display: "flex",
      flexDirection: "column",
      gap: "32px",
      padding: "16px",
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
            alignItems: "flex-start",
            display: "flex",
            flexWrap: "wrap",
            gap: "24px",
          }}
        >
          {BROWSER_DEVICE_PROFILES.map((device) => (
            <figure key={device.id} style={{ margin: 0 }}>
              <figcaption style={CELL_LABEL_STYLE}>
                {device.label} — {device.width}×
                {device.height}
              </figcaption>
              <iframe
                height={device.height}
                src={buildStoryUrl({
                  storyExport: STORY_EXPORT_BY_DEVICE_ID[
                    device.id
                  ] as string,
                  storyId: view.storyId,
                })}
                style={{
                  // The round panel is masked here for the same reason the
                  // single-panel frame masks it: a square preview of a circle
                  // hides every corner the real bezel eats.
                  border: "1px solid #808080",
                  borderRadius:
                    device.shape === "round" ? "50%" : "0",
                  colorScheme: "normal",
                }}
                title={`${view.label} on ${device.label}`}
                width={device.width}
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
