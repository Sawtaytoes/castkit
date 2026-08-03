import type { ViewName } from "@castkit/shared/views/viewNames"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { PanelStage } from "../storybook/PanelStage.tsx"
import { PANEL_CATALOG } from "../storybook/panelCatalog.ts"
import { STORY_VIEW_NAMES } from "../storybook/storyViewCatalog.tsx"

/**
 * Every view on every panel, at 1:1, in one scrollable grid — the page for
 * spotting the thing you only notice by comparison: a row that overflows the
 * panel, a title that wraps differently on one device, an empty state that
 * looks broken next to its neighbours.
 *
 * Deliberately undithered. Rasterizing 9 views × 3 panels at once takes
 * seconds to settle and would make the page useless for scanning; the
 * dedicated Dither story is where that comparison belongs.
 */

const CELL_LABEL_STYLE = {
  fontFamily: "monospace",
  fontSize: 11,
  color: "#333",
  marginBottom: 4,
} as const

const AllScreensGrid = ({
  viewNames,
}: {
  viewNames: readonly ViewName[]
}) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: 32,
      padding: 16,
      backgroundColor: "#ffffff",
    }}
  >
    {viewNames.map((viewName) => (
      <section key={viewName}>
        <h2
          style={{
            fontFamily: "system-ui, sans-serif",
            fontSize: 15,
            margin: "0 0 10px",
          }}
        >
          {viewName}
        </h2>
        <div
          style={{
            display: "flex",
            gap: 24,
            flexWrap: "wrap",
            alignItems: "flex-start",
          }}
        >
          {PANEL_CATALOG.map(({ device }) => (
            <figure key={device.id} style={{ margin: 0 }}>
              <figcaption style={CELL_LABEL_STYLE}>
                {device.label} — {device.width}×
                {device.height} {device.colourMode}
              </figcaption>
              <div
                style={{
                  border: "1px solid #808080",
                  width: device.width,
                  height: device.height,
                }}
              >
                <PanelStage
                  viewName={viewName}
                  width={device.width}
                  height={device.height}
                  colourMode={device.colourMode}
                />
              </div>
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
    controls: { disable: true },
  },
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

export const EveryViewEveryPanel: Story = {
  name: "Every view × every panel",
  render: () => (
    <AllScreensGrid viewNames={STORY_VIEW_NAMES} />
  ),
}

export const TextViews: Story = {
  name: "Text views only",
  render: () => (
    <AllScreensGrid
      viewNames={STORY_VIEW_NAMES.filter(
        (viewName) => !viewName.startsWith("Photo Frame"),
      )}
    />
  ),
}
