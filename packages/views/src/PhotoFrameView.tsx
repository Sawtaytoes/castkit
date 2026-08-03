/** @jsxRuntime automatic @jsxImportSource react */
import type { CSSProperties } from "react"
import type { PanelViewProps } from "./viewProps.ts"
import { buildPanelRootStyle } from "./viewStyles.ts"

/**
 * The Immich photo-frame view: a full-bleed photo, already face-aware-cropped
 * or letterboxed to the exact panel size server-side, so the view just paints
 * the bytes. Without a photo (Immich unconfigured or nothing fetched yet) it
 * renders an instructional placeholder instead of a blank panel.
 */
export type PhotoFrameViewProps = PanelViewProps & {
  photoDataUri?: string
}

export const PhotoFrameView = ({
  width,
  height,
  colourMode,
  photoDataUri,
}: PhotoFrameViewProps) => {
  const rootStyle: CSSProperties = {
    ...buildPanelRootStyle({
      width,
      height,
      colourMode,
    }),
    alignItems: "center",
    justifyContent: "center",
  }

  if (!photoDataUri) {
    const messageStyle: CSSProperties = {
      display: "flex",
      fontSize: Math.round(height * 0.09),
      fontWeight: 700,
      textAlign: "center",
    }
    const hintStyle: CSSProperties = {
      display: "flex",
      fontSize: Math.round(height * 0.055),
      marginTop: Math.round(height * 0.04),
      textAlign: "center",
    }

    return (
      <div style={rootStyle}>
        <div style={messageStyle}>Photo Frame</div>
        <div style={hintStyle}>
          Set the device's "Photo Frame: People" or "Photo
          Frame: Query" in Home Assistant
        </div>
      </div>
    )
  }

  const photoStyle: CSSProperties = {
    width,
    height,
    // The photo arrives already sized to exactly `width × height` (the server
    // crops it; the browser preview cover-crops it first), so `cover` is a
    // no-op here — it is just a guard against a mis-sized source stretching.
    objectFit: "cover",
  }

  return (
    <div style={rootStyle}>
      {/*
        Explicit width/height attributes (not only the CSS) pin the intrinsic
        size, so the panel never reflows while the photo decodes.
      */}
      <img
        alt=""
        src={photoDataUri}
        width={width}
        height={height}
        style={photoStyle}
      />
    </div>
  )
}
