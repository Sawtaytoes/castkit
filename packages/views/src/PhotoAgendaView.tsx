/** @jsxRuntime automatic @jsxImportSource react */
import type { CSSProperties } from "react"
import type { ClockAgendaEvent } from "./ClockAgendaView.tsx"
import type { PanelViewProps } from "./viewProps.ts"
import {
  buildPanelRootStyle,
  countRowsThatFit,
  fitText,
  getAccentColor,
  getPanelColors,
  READABLE_FONT_FLOOR_PX,
} from "./viewStyles.ts"

/** Every event row is `fontSize x this`, matching the rows' line height. */
const EVENT_LINE_HEIGHT = 1.15

export type PhotoAgendaViewProps = PanelViewProps & {
  photoDataUri?: string
  date: string
  temperatureText?: string
  conditionText?: string
  /** Upcoming events, already sorted; the view trims them to what fits. */
  events: readonly ClockAgendaEvent[]
  /** Shown when there is nothing left today. */
  emptyText: string
}

/**
 * A clockless, even split between one photo and the day's agenda.
 *
 * The split is measured inside the visible window. The server lays the whole
 * view out inside that safe box, so no face or text is hidden under a physical
 * mat. The rail stays dark text on paper, with accent ink on event times. This
 * view deliberately has no wall clock: it remains truthful for a super-slow
 * panel that takes about 28 seconds to repaint.
 */
export const PhotoAgendaView = ({
  width,
  height,
  colorMode,
  photoDataUri,
  date,
  temperatureText,
  conditionText,
  events,
  emptyText,
}: PhotoAgendaViewProps) => {
  const colors = getPanelColors({ colorMode })
  const accentColor = getAccentColor({
    colorMode,
    intent: "accent",
  })
  const hasTemperature =
    temperatureText !== undefined && temperatureText !== ""
  const hasCondition =
    conditionText !== undefined && conditionText !== ""
  const hasWeather = hasTemperature || hasCondition
  const hasEvents = events.length > 0

  const photoWidth = Math.floor(width / 2)
  const railWidth = width - photoWidth
  const dividerWidth = Math.max(
    3,
    Math.round(width * 0.004),
  )
  const railPadding = Math.round(width * 0.028)
  const railContentWidth =
    railWidth - railPadding - dividerWidth
  const readableFloor = READABLE_FONT_FLOOR_PX[colorMode]

  const fittedDate = fitText({
    baseFontSize: Math.round(height * 0.09),
    minimumFontSize: readableFloor,
    availableWidth: railContentWidth,
    text: date,
  })
  const weatherFontSize = Math.max(
    readableFloor,
    Math.round(height * 0.065),
  )
  const eventFontSize = Math.max(
    readableFloor,
    Math.round(
      Math.min(height * 0.055, railContentWidth * 0.075),
    ),
  )
  const headingFontSize = Math.max(
    readableFloor,
    Math.round(height * 0.045),
  )
  const emptyFontSize = Math.max(
    readableFloor,
    Math.round(height * 0.07),
  )

  const topPadding = Math.round(height * 0.055)
  const weatherGap = Math.round(height * 0.025)
  const dividerGap = Math.round(height * 0.04)
  const dividerHeight = Math.max(
    2,
    Math.round(height * 0.005),
  )
  const headingGap = Math.round(height * 0.025)
  const eventRowGap = Math.round(height * 0.016)
  const bottomBreathingRoom = Math.round(height * 0.02)
  const eventRowHeight =
    eventRowGap +
    Math.ceil(eventFontSize * EVENT_LINE_HEIGHT)
  const headerHeight =
    topPadding +
    fittedDate.fontSize +
    (hasWeather ? weatherGap + weatherFontSize : 0) +
    dividerGap +
    dividerHeight +
    headingGap +
    headingFontSize
  const visibleEvents = events.slice(
    0,
    countRowsThatFit({
      availableHeight:
        height - headerHeight - bottomBreathingRoom,
      rowHeight: eventRowHeight,
    }),
  )

  const rootStyle: CSSProperties = {
    ...buildPanelRootStyle({ width, height, colorMode }),
    flexDirection: "row",
    alignItems: "stretch",
  }
  const photoColumnStyle: CSSProperties = {
    display: "flex",
    width: photoWidth,
    height,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    overflow: "hidden",
  }
  const photoStyle: CSSProperties = {
    width: photoWidth,
    height,
    objectFit: "cover",
  }
  const photoPlaceholderStyle: CSSProperties = {
    display: "flex",
    width: photoWidth,
    paddingLeft: railPadding,
    paddingRight: railPadding,
    fontSize: Math.max(
      readableFloor,
      Math.round(height * 0.07),
    ),
    fontWeight: 700,
    lineHeight: 1.15,
    textAlign: "center",
  }
  const railStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    width: railWidth,
    height,
    paddingTop: topPadding,
    paddingLeft: railPadding,
    paddingRight: 0,
    borderLeft: `${dividerWidth}px solid ${colors.content.primary}`,
    backgroundColor: colors.surface.base,
    boxSizing: "border-box",
  }
  const dateStyle: CSSProperties = {
    display: "block",
    width: railContentWidth,
    fontSize: fittedDate.fontSize,
    letterSpacing: fittedDate.letterSpacing,
    fontWeight: 700,
    lineHeight: 1,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  }
  const weatherRowStyle: CSSProperties = {
    display: "flex",
    flexDirection: "row",
    alignItems: "baseline",
    width: railContentWidth,
    marginTop: weatherGap,
  }
  const temperatureStyle: CSSProperties = {
    display: "flex",
    fontSize: weatherFontSize,
    fontWeight: 700,
    lineHeight: 1,
    color: accentColor,
    flexShrink: 0,
  }
  const conditionStyle: CSSProperties = {
    display: "block",
    minWidth: 0,
    marginLeft: Math.round(height * 0.018),
    fontSize: weatherFontSize,
    fontWeight: 700,
    lineHeight: 1,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  }
  const ruleStyle: CSSProperties = {
    display: "flex",
    width: railContentWidth,
    height: dividerHeight,
    marginTop: dividerGap,
    backgroundColor: accentColor,
    flexShrink: 0,
  }
  const headingStyle: CSSProperties = {
    display: "flex",
    marginTop: headingGap,
    fontSize: headingFontSize,
    fontWeight: 700,
    lineHeight: 1,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: accentColor,
  }
  const eventRowStyle: CSSProperties = {
    display: "flex",
    flexDirection: "row",
    alignItems: "baseline",
    width: railContentWidth,
    marginTop: eventRowGap,
  }
  const eventTimeColumnWidth = Math.round(
    eventFontSize * 3.8,
  )
  const eventGutterWidth = Math.round(eventFontSize * 0.45)
  const eventTimeStyle: CSSProperties = {
    display: "flex",
    width: eventTimeColumnWidth,
    fontSize: eventFontSize,
    fontWeight: 700,
    lineHeight: EVENT_LINE_HEIGHT,
    whiteSpace: "nowrap",
    color: accentColor,
    flexShrink: 0,
  }
  const eventSummaryStyle: CSSProperties = {
    display: "block",
    minWidth: 0,
    maxWidth:
      railContentWidth -
      eventTimeColumnWidth -
      eventGutterWidth,
    marginLeft: eventGutterWidth,
    fontSize: eventFontSize,
    fontWeight: 700,
    lineHeight: EVENT_LINE_HEIGHT,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  }
  const emptyStyle: CSSProperties = {
    display: "flex",
    width: railContentWidth,
    marginTop: Math.round(height * 0.06),
    fontSize: emptyFontSize,
    fontWeight: 700,
    lineHeight: 1.15,
  }

  return (
    <div style={rootStyle}>
      <div style={photoColumnStyle}>
        {photoDataUri ? (
          <img
            alt=""
            src={photoDataUri}
            width={photoWidth}
            height={height}
            style={photoStyle}
          />
        ) : (
          <div style={photoPlaceholderStyle}>
            Photo Frame
          </div>
        )}
      </div>

      <div style={railStyle}>
        <div style={dateStyle}>{date}</div>

        {hasWeather ? (
          <div style={weatherRowStyle}>
            {hasTemperature ? (
              <div style={temperatureStyle}>
                {temperatureText}
              </div>
            ) : null}
            {hasCondition ? (
              <div style={conditionStyle}>
                {conditionText}
              </div>
            ) : null}
          </div>
        ) : null}

        {hasEvents ? (
          <>
            <div style={ruleStyle} />
            <div style={headingStyle}>Today</div>
            {visibleEvents.map((event) => (
              <div
                key={`${event.timeText}-${event.summary}`}
                style={eventRowStyle}
              >
                <div style={eventTimeStyle}>
                  {event.timeText}
                </div>
                <div style={eventSummaryStyle}>
                  {event.summary}
                </div>
              </div>
            ))}
          </>
        ) : (
          <div style={emptyStyle}>{emptyText}</div>
        )}
      </div>
    </div>
  )
}
