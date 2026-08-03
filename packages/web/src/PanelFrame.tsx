import type { CSSProperties, ReactNode } from "react"

/**
 * Renders one view at a panel's exact native pixel size, scaled up by an integer
 * `zoom` (via CSS transform) so the tiny mono panel is legible on a desktop
 * monitor. The inner render is 1:1 with what the device gets — Chromium is the
 * render engine, so this browser preview matches device output (pre-dither).
 *
 * The view arrives as `children` built at the panel's dimensions; the frame only
 * labels and scales it, so any view can use the same frame.
 */
export type PanelFrameProps = {
  label: string
  width: number
  height: number
  colourMode: "mono" | "e6"
  zoom: number
  children: ReactNode
}

export const PanelFrame = ({
  label,
  width,
  height,
  colourMode,
  zoom,
  children,
}: PanelFrameProps) => {
  const scaledStyle: CSSProperties = {
    width: width * zoom,
    height: height * zoom,
    border: "1px solid #999",
    overflow: "hidden",
  }

  const transformStyle: CSSProperties = {
    width,
    height,
    transform: `scale(${zoom})`,
    transformOrigin: "top left",
  }

  return (
    <figure style={{ margin: 0 }}>
      <figcaption
        style={{
          fontFamily: "monospace",
          fontSize: 12,
          marginBottom: 6,
          color: "#333",
        }}
      >
        {label} — {width}×{height} {colourMode} · {zoom}×
      </figcaption>

      <div style={scaledStyle}>
        <div style={transformStyle}>{children}</div>
      </div>
    </figure>
  )
}
