import type { BrowserDeviceProfile } from "@castkit/shared/protocol/ws"

/**
 * A story rendered at its panel's real size, inside a nested `<iframe>`.
 *
 * Slatecast lays out in `vmin`/`vw`/`vh`, so a story is only faithful when the
 * DOCUMENT it renders in is the panel's size. Storybook's viewport preset was
 * doing that job and it silently does not work here: `storybook.octen.dev`
 * shows this Storybook as a COMPOSED REF, and a composition's toolbar belongs
 * to the host site, which knows nothing about a ref's `parameters.viewport`.
 * Every panel story therefore rendered at the host canvas size — measured
 * 1200×610 on 2026-09-13 for a story labelled 480×320 — where `10vmin` is
 * 61px instead of 32px and the short-landscape media query never matches at
 * all. The layout the owner reviewed was not a layout any panel ever shows.
 *
 * An iframe gets its own viewport, so it is correct in a composition, at
 * localhost, and inside the all-screens matrix, with no toolbar state to get
 * right. The cost is one extra document per cell, which is what the matrix has
 * always paid for the same reason.
 *
 * The frame renders the SAME story id with {@link PANEL_QUERY_FLAG} set; that
 * flag is what tells the inner document to render the app rather than another
 * frame, so there is no second level of nesting.
 */

/** Marks a preview document as the panel itself rather than its frame. */
export const PANEL_QUERY_FLAG = "castkitPanel"

export const isPanelDocument = () =>
  new URLSearchParams(window.location.search).has(
    PANEL_QUERY_FLAG,
  )

/**
 * The inner document's URL. The story id comes from the render context rather
 * than `location.search`, because Storybook re-renders the preview in place
 * when the selection changes and the address it was loaded with can be a story
 * back.
 */
export const buildPanelUrl = (storyId: string) =>
  `iframe.html?viewMode=story&id=${encodeURIComponent(storyId)}&${PANEL_QUERY_FLAG}=1`

/** Bezel thickness around the panel, in pixels. */
const BEZEL_WIDTH = 8

const CAPTION_STYLE = {
  color: "#8a8a8a",
  fontFamily: "monospace",
  fontSize: "11px",
  marginTop: "10px",
  textAlign: "center" as const,
}

export const PanelFrame = ({
  device,
  storyId,
}: {
  device: BrowserDeviceProfile
  storyId: string
}) => {
  const isRound = device.shape === "round"
  return (
    <div
      style={{
        alignItems: "center",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "24px",
        width: "100%",
      }}
    >
      <div
        style={{
          // The mask is the point for the porthole: the real panel is a
          // circle, and a square preview of it hides every corner the bezel
          // actually eats. `overflow: hidden` clips the nested document.
          background: "#101010",
          borderRadius: isRound
            ? "50%"
            : `${BEZEL_WIDTH}px`,
          boxSizing: "content-box",
          flex: "none",
          height: `${device.height}px`,
          overflow: "hidden",
          padding: `${BEZEL_WIDTH}px`,
          width: `${device.width}px`,
        }}
      >
        <iframe
          height={device.height}
          src={buildPanelUrl(storyId)}
          style={{
            border: 0,
            borderRadius: isRound ? "50%" : "2px",
            colorScheme: "normal",
            display: "block",
          }}
          title={device.label}
          width={device.width}
        />
      </div>
      <div style={CAPTION_STYLE}>
        {device.label} — {device.width}×{device.height}
        {isRound ? " — masked to the round bezel" : ""}
      </div>
    </div>
  )
}
