/** @jsxRuntime automatic @jsxImportSource react */
import type { CSSProperties } from "react"
import type { ClockAgendaEvent } from "./ClockAgendaView.tsx"
import type { PanelViewProps } from "./viewProps.ts"
import {
  buildPanelRootStyle,
  fitText,
  getAccentColour,
  READABLE_FONT_FLOOR_PX,
} from "./viewStyles.ts"

/**
 * The day's upcoming events, with NO clock. This is the whole point of the
 * view: `ClockAgendaView` shows a time, so it must be re-rendered every minute
 * to stay honest, and a full ePaper refresh on a 7.3" E6 panel takes ~28
 * seconds — a per-minute repaint there is a panel that is essentially always
 * flashing. Dropping the time makes the render valid until the agenda data
 * itself changes, so this view repaints only when Home Assistant pushes new
 * events or the view is selected. See docs/decisions/ for the record that
 * supersedes the kitchen "no clock views" rule.
 *
 * Because events are the content rather than a footnote under a big clock,
 * they get the panel: a date header, then the event rows at a size that reads
 * from across a room. Every string (the date, and each event's `timeText`)
 * arrives pre-formatted so the view stays a pure function of its props; all
 * text is bold to survive 1-bit dithering. Inline styles + flexbox only
 * (Satori-safe). Event rows reuse `ClockAgendaEvent` so both agenda views
 * speak the same shape.
 */
export type AgendaViewProps = PanelViewProps & {
  date: string
  temperatureText?: string
  conditionText?: string
  /** Upcoming events, already sorted and sliced to the panel's budget. */
  events: readonly ClockAgendaEvent[]
  /** Shown when there is nothing left today, e.g. "Nothing else today". */
  emptyText: string
}

export const AgendaView = ({
  width,
  height,
  colourMode,
  date,
  temperatureText,
  conditionText,
  events,
  emptyText,
}: AgendaViewProps) => {
  const accentColour = getAccentColour({
    colourMode,
    e6Colour: "#1f4fd0",
  })
  const hasTemperature =
    temperatureText !== undefined && temperatureText !== ""
  const hasCondition =
    conditionText !== undefined && conditionText !== ""
  const hasWeather = hasTemperature || hasCondition
  const hasEvents = events.length > 0

  const horizontalPadding = Math.round(width * 0.04)
  const availableWidth = width - horizontalPadding * 2
  const readableFloor = READABLE_FONT_FLOOR_PX[colourMode]

  // The date is the anchor here (the clock views' role), so it gets the
  // headline treatment — fitted so a long "Wednesday, September 24" still sits
  // on one line.
  const fittedDate = fitText({
    baseFontSize: Math.round(height * 0.13),
    minimumFontSize: readableFloor,
    availableWidth,
    text: date,
  })

  const weatherFontSize = Math.round(height * 0.075)
  const eventFontSize = Math.max(
    readableFloor,
    Math.round(height * 0.085),
  )
  const emptyFontSize = Math.round(height * 0.09)

  const rootStyle: CSSProperties = {
    ...buildPanelRootStyle({ width, height }),
    alignItems: "flex-start",
    justifyContent: "flex-start",
    paddingTop: Math.round(height * 0.06),
    paddingLeft: horizontalPadding,
    paddingRight: horizontalPadding,
  }

  const dateStyle: CSSProperties = {
    display: "flex",
    fontSize: fittedDate.fontSize,
    letterSpacing: fittedDate.letterSpacing,
    fontWeight: 700,
    lineHeight: 1,
    whiteSpace: "nowrap",
    color: accentColour,
  }

  const weatherRowStyle: CSSProperties = {
    display: "flex",
    flexDirection: "row",
    alignItems: "baseline",
    marginTop: Math.round(height * 0.025),
  }

  const temperatureStyle: CSSProperties = {
    display: "flex",
    fontSize: weatherFontSize,
    fontWeight: 700,
    lineHeight: 1,
  }

  const conditionStyle: CSSProperties = {
    display: "flex",
    fontSize: weatherFontSize,
    fontWeight: 700,
    lineHeight: 1,
    whiteSpace: "nowrap",
    marginLeft: Math.round(width * 0.025),
  }

  const agendaBlockStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    marginTop: Math.round(height * 0.06),
  }

  const eventRowStyle: CSSProperties = {
    display: "flex",
    flexDirection: "row",
    alignItems: "baseline",
    marginTop: Math.round(height * 0.03),
  }

  const eventTimeStyle: CSSProperties = {
    display: "flex",
    fontSize: eventFontSize,
    fontWeight: 700,
    lineHeight: 1.1,
    color: accentColour,
    minWidth: Math.round(width * 0.22),
  }

  // Summaries never wrap (one row each), so cap each to the row's remaining
  // width and ellipsis-truncate — both render engines honour nowrap + hidden.
  const eventSummaryStyle: CSSProperties = {
    display: "flex",
    fontSize: eventFontSize,
    fontWeight: 700,
    lineHeight: 1.1,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth:
      availableWidth -
      Math.round(width * 0.22) -
      Math.round(width * 0.02),
    marginLeft: Math.round(width * 0.02),
  }

  const emptyStyle: CSSProperties = {
    display: "flex",
    fontSize: emptyFontSize,
    fontWeight: 700,
    lineHeight: 1.2,
    marginTop: Math.round(height * 0.08),
  }

  return (
    <div style={rootStyle}>
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
        <div style={agendaBlockStyle}>
          {events.map((event) => (
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
        </div>
      ) : (
        <div style={emptyStyle}>{emptyText}</div>
      )}
    </div>
  )
}
