/** @jsxRuntime automatic @jsxImportSource react */
import type { CSSProperties } from "react"
import type { NowPlayingViewProps } from "./viewProps.ts"
import {
  buildPanelRootStyle,
  fitText,
  READABLE_FONT_FLOOR_PX,
} from "./viewStyles.ts"

/**
 * Now-playing view, dashboard variant — one layout at every panel size.
 *
 * The track title is the visual anchor: it comes first (big and bold), with
 * the artist beneath it and the album third. The artist line is hidden when
 * it is empty or the "—" placeholder (YouTube Music streams often carry no
 * artist). Long lines condense/shrink-to-fit via `fitText` (down to the
 * panel's readable floor) before the ellipsis truncation kicks in.
 *
 * The layout: album art beside the title/artist/album block (nudged optically
 * high so it isn't bottom-heavy), and the date + time on one footer strip
 * ("Thursday, July 2" · "2:46 AM", pre-formatted server-side). There is no
 * "Now Playing / Last Played" banner — the big panel matches the small one
 * (the banner read as clutter on the wall). All text is bold so it survives
 * 1-bit dithering. Inline styles + flexbox only (Satori-safe).
 */
export type NowPlayingDashboardProps =
  NowPlayingViewProps & {
    time: string
    date: string
  }

const ARTIST_PLACEHOLDER = "—"

export const NowPlayingDashboard = ({
  width,
  height,
  colourMode,
  artist,
  title,
  album,
  time,
  date,
  artworkDataUri,
}: NowPlayingDashboardProps) => {
  const hasArtwork = artworkDataUri !== undefined
  const trimmedArtist = artist.trim()
  const hasVisibleArtist =
    trimmedArtist !== "" &&
    trimmedArtist !== ARTIST_PLACEHOLDER
  // Generated playlists (YouTube Music) often cram everything into the
  // title with no artist/album — give the lonely title a second line
  // instead of truncating one long line.
  const titleLineCount = !hasVisibleArtist && !album ? 2 : 1

  const baseTitleFontSize = Math.round(height * 0.16)
  const baseArtistFontSize = Math.round(height * 0.13)
  const baseAlbumFontSize = Math.round(height * 0.11)
  const dateFontSize = Math.round(height * 0.12)
  const timeFontSize = Math.round(height * 0.12)
  const padding = Math.round(height * 0.06)

  const artworkSide = Math.round(
    height * (colourMode === "e6" ? 0.5 : 0.6),
  )
  const artworkToTextGap = Math.round(height * 0.06)
  const solidLineThickness = Math.max(
    2,
    Math.round(height * 0.008),
  )

  const trackTextAvailableWidth =
    width -
    padding * 2 -
    (hasArtwork ? artworkSide + artworkToTextGap : 0)

  // Never shrink a line below the panel's readable floor — past that the view
  // wraps (the lonely-title case raises `titleLineCount`) or ellipsis-clips
  // instead of rendering illegibly small.
  const readableFloor = READABLE_FONT_FLOOR_PX[colourMode]

  const fittedTitle = fitText({
    baseFontSize: baseTitleFontSize,
    minimumFontSize: Math.min(
      baseTitleFontSize,
      readableFloor,
    ),
    availableWidth: trackTextAvailableWidth,
    text: title,
    lineCount: titleLineCount,
  })
  const titleFontSize = fittedTitle.fontSize
  // The title is the anchor: when a long title shrinks below the artist's
  // base size, the artist/album cap below it so the hierarchy never inverts.
  const fittedArtist = fitText({
    baseFontSize: Math.min(
      baseArtistFontSize,
      Math.round(titleFontSize * 0.85),
    ),
    minimumFontSize: Math.min(
      baseArtistFontSize,
      readableFloor,
    ),
    availableWidth: trackTextAvailableWidth,
    text: artist,
  })
  const fittedAlbum = fitText({
    baseFontSize: Math.min(
      baseAlbumFontSize,
      Math.round(titleFontSize * 0.7),
    ),
    minimumFontSize: Math.min(
      baseAlbumFontSize,
      readableFloor,
    ),
    availableWidth: trackTextAvailableWidth,
    text: album ?? "",
  })

  const rootStyle: CSSProperties = {
    ...buildPanelRootStyle({ width, height }),
    padding,
  }

  const bodyRowStyle: CSSProperties = {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    flexGrow: 1,
    minWidth: 0,
    // The centered body reads bottom-heavy next to the footer strip, so bias
    // the optical centre upward a touch.
    paddingBottom: Math.round(height * 0.06),
  }

  const artworkFrameStyle: CSSProperties = {
    display: "flex",
    width: artworkSide,
    height: artworkSide,
    flexShrink: 0,
    border: `${solidLineThickness}px solid #000000`,
  }

  const artworkImageStyle: CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  }

  const trackColumnStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    flexGrow: 1,
    minWidth: 0,
    marginLeft: hasArtwork ? artworkToTextGap : 0,
  }

  const truncatingLineStyle: CSSProperties = {
    display: "flex",
    maxWidth: "100%",
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  }

  const titleLineHeight = 1.12
  const titleStyle: CSSProperties =
    titleLineCount > 1
      ? {
          // Wrapping variant: normal white-space across a capped number of
          // lines, clipped at the line boundary (works under both engines,
          // unlike -webkit-line-clamp).
          display: "flex",
          maxWidth: "100%",
          overflow: "hidden",
          fontSize: titleFontSize,
          letterSpacing: fittedTitle.letterSpacing,
          fontWeight: 700,
          lineHeight: titleLineHeight,
          maxHeight: Math.round(
            titleFontSize *
              titleLineHeight *
              titleLineCount,
          ),
        }
      : {
          ...truncatingLineStyle,
          fontSize: titleFontSize,
          letterSpacing: fittedTitle.letterSpacing,
          fontWeight: 700,
          lineHeight: 1.05,
        }

  const artistStyle: CSSProperties = {
    ...truncatingLineStyle,
    fontSize: fittedArtist.fontSize,
    letterSpacing: fittedArtist.letterSpacing,
    // Small text dithers away on the 1-bit panel unless it is bold.
    fontWeight: 700,
    lineHeight: 1.1,
    marginTop: Math.round(height * 0.02),
  }

  const albumStyle: CSSProperties = {
    ...truncatingLineStyle,
    fontSize: fittedAlbum.fontSize,
    letterSpacing: fittedAlbum.letterSpacing,
    fontWeight: 700,
    lineHeight: 1.1,
    marginTop: Math.round(height * 0.015),
  }

  const footerRuleStyle: CSSProperties = {
    display: "flex",
    width: "100%",
    height: solidLineThickness,
    backgroundColor: "#000000",
  }

  const footerRowStyle: CSSProperties = {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: Math.round(height * 0.02),
  }

  const dateStyle: CSSProperties = {
    display: "flex",
    fontSize: dateFontSize,
    fontWeight: 700,
    lineHeight: 1,
  }

  const timeStyle: CSSProperties = {
    display: "flex",
    fontSize: timeFontSize,
    fontWeight: 700,
    lineHeight: 1,
  }

  return (
    <div style={rootStyle}>
      <div style={bodyRowStyle}>
        {hasArtwork ? (
          <div style={artworkFrameStyle}>
            <img
              alt=""
              src={artworkDataUri}
              style={artworkImageStyle}
            />
          </div>
        ) : null}

        <div style={trackColumnStyle}>
          <div style={titleStyle}>{title}</div>
          {hasVisibleArtist ? (
            <div style={artistStyle}>{artist}</div>
          ) : null}
          {album ? (
            <div style={albumStyle}>{album}</div>
          ) : null}
        </div>
      </div>

      <div style={footerRuleStyle} />

      <div style={footerRowStyle}>
        <div style={dateStyle}>{date}</div>
        <div style={timeStyle}>{time}</div>
      </div>
    </div>
  )
}
