import type { Meta, StoryObj } from "@storybook/preact-vite"
import { BROWSER_DEVICE_PROFILES } from "./deviceProfiles.ts"
import { PANEL_QUERY_FLAG } from "./panelFrame.tsx"
import { STORY_EXPORT_BY_DEVICE_ID } from "./slatecastStory.tsx"

/**
 * Every view on every panel this renderer drives, in one scrollable grid.
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
 *
 * ⚠️ **Every cell is `loading="lazy"`, and that is not an optimisation — it is
 * what makes the page usable.** A cell is a whole Storybook preview boot: the
 * Storybook runtime, the Preact app, the fonts, the sample photos, and a 1 Hz
 * clock tick that runs for as long as the document lives. Seven views times
 * five panels is 35 of them. Measured eagerly on 2026-09-13 against
 * storybook.octen.dev: 400 requests, 42 MiB, 35 live documents, and roughly 25
 * seconds before the grid settled, with the owner's machine pinned the whole
 * time. Lazy cells boot only the ones scrolled into view.
 */

const VIEW_STORIES = [
  {
    label: "Now Playing",
    storyId: "views-now-playing",
  },
  { label: "Queue", storyId: "views-queue" },
  { label: "Ambient", storyId: "views-ambient" },
  { label: "Clock", storyId: "views-clock" },
  { label: "Weather", storyId: "views-weather" },
  { label: "Calendar", storyId: "views-calendar" },
  {
    label: "Photo Frame",
    storyId: "views-photo-frame",
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

const AllScreens = () => (
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
                {device.label} — {device.width}x
                {device.height}
              </figcaption>
              <iframe
                height={device.height}
                loading="lazy"
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
  title: "Overview/All screens",
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

export const EveryViewEveryPanel: Story = {
  name: "Every view x every panel",
  render: () => <AllScreens />,
}
