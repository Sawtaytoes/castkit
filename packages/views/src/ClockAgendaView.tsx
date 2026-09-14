/** @jsxRuntime automatic @jsxImportSource react */
import type { CSSProperties } from "react"
import type { PanelViewProps } from "./viewProps.ts"
import {
  buildPanelRootStyle,
  countRowsThatFit,
  fitText,
  getAccentColour,
  READABLE_FONT_FLOOR_PX,
} from "./viewStyles.ts"

/**
 * A clock view that surfaces the day's upcoming calendar events, so an
 * imminent appointment shows itself on the panel alongside the time, date, and
 * weather. It builds on `ClockWeatherView`: the big time is the anchor, then
 * date + weather, then an agenda block. When there are no events the view
 * renders *identically* to `ClockWeatherView` — time + date (+ weather) with no
 * empty "Today" heading — so a device parked on this view on a free day just
 * looks like the weather clock, and it is safe as an always-available option.
 *
 * The compact pHAT (≤200px tall) is switched to this view *because* an event
 * is imminent, so it shrinks the time to move it up and stacks a few tight
 * event rows under a compact date/temp row. The large Impression gives the
 * date and weather their own rows, then a
 * "Today" heading and up to a handful of event rows. Every string
 * (time, date, weather, and each event's `timeText`) arrives pre-formatted so
 * the view stays a pure function of its props; all text is bold to survive
 * 1-bit dithering. Inline styles + flexbox only (Satori-safe).
 *
 * The view draws only the event rows that FINISH on the panel. It is handed
 * more events than it can show, tightens its own vertical rhythm to buy room
 * for as many as possible, measures what is left, and drops the rest — the
 * least imminent ones, which arrive on a later repaint once the earlier ones
 * have started and fallen off the list.
 */
export type ClockAgendaEvent = {
  /** Pre-formatted per panel size, e.g. "2:30p" / "2:30 PM" / "All day". */
  timeText: string
  summary: string
}

export type ClockAgendaViewProps = PanelViewProps & {
  time: string
  date: string
  temperatureText?: string
  conditionText?: string
  /** Upcoming events, already sorted and sliced to the panel's budget. */
  events: readonly ClockAgendaEvent[]
}

const COMPACT_PANEL_MAX_HEIGHT = 200

/**
 * How much of the view's vertical whitespace survives once events are on the
 * panel. The airy rhythm this view inherits from `ClockWeatherView` reads well
 * with three blocks on the glass; with an agenda under them it is the gaps, not
 * the rows, that have to give — at full spacing a 960x540 M5Paper finished two
 * event rows and cut the third, and cut the top off the clock as well.
 */
const AGENDA_GAP_SCALE = 0.5

/** Every event row is `fontSize × this`, matching the rows' `lineHeight`. */
const EVENT_LINE_HEIGHT = 1.1

export const ClockAgendaView = ({
  width,
  height,
  colourMode,
  time,
  date,
  temperatureText,
  conditionText,
  events,
}: ClockAgendaViewProps) => {
  const accentColour = getAccentColour({
    colourMode,
    intent: "accent",
  })
  const isCompactPanel = height <= COMPACT_PANEL_MAX_HEIGHT
  const hasTemperature =
    temperatureText !== undefined && temperatureText !== ""
  const hasCondition =
    conditionText !== undefined && conditionText !== ""
  const hasWeather = hasTemperature || hasCondition
  const hasEvents = events.length > 0

  const horizontalPadding = Math.round(width * 0.04)
  const availableWidth = width - horizontalPadding * 2
  const readableFloor = READABLE_FONT_FLOOR_PX[colourMode]

  // With an event present the time cedes height to the agenda; without one the
  // proportions match ClockWeatherView. On the compact pHAT the time shrinks
  // further still when events are present, moving it up to free vertical room
  // for a stack of event rows.
  const fittedTime = fitText({
    baseFontSize: Math.round(
      height *
        (hasEvents
          ? isCompactPanel
            ? 0.2
            : 0.3
          : hasWeather
            ? 0.36
            : 0.42),
    ),
    minimumFontSize: readableFloor,
    availableWidth,
    text: time,
  })

  const compactInfoText = [
    date,
    temperatureText ?? "",
    conditionText ?? "",
  ].join(" ")
  const fittedCompactInfo = fitText({
    baseFontSize: Math.round(height * 0.12),
    minimumFontSize: readableFloor,
    availableWidth,
    text: compactInfoText,
  })
  const compactInfoFontSize = fittedCompactInfo.fontSize
  const compactTemperatureFontSize = Math.round(
    compactInfoFontSize * 1.25,
  )

  // The date is the widest single string this view ever draws — a long one
  // ("Wednesday, September 11") beats "4:59 AM" for character count — so it is
  // fitted to the panel exactly like the time. Left unfitted it wrapped onto a
  // second line on the 13.3" Impressions, which also broke the centred column.
  const fittedDate = fitText({
    baseFontSize: Math.round(height * 0.13),
    minimumFontSize: readableFloor,
    availableWidth,
    text: date,
  })
  const largeTemperatureFontSize = Math.round(height * 0.14)
  const largeConditionFontSize = Math.round(height * 0.075)
  const headingFontSize = Math.round(height * 0.055)
  const eventTimeFontSize = Math.round(height * 0.07)
  const eventSummaryFontSize = Math.round(height * 0.07)
  // Compact rows sit at the readable floor so as many fit as legibility allows,
  // with the time nudged up so it reads as the row's anchor.
  const compactEventTimeFontSize = Math.round(
    readableFloor * 1.15,
  )
  const compactEventSummaryFontSize = readableFloor

  // Every vertical gap in the view, named once so the layout maths below and
  // the style objects further down can never disagree about the rhythm. With
  // events on the panel they all tighten together; with none the view keeps
  // ClockWeatherView's spacing, because on a free day it *is* that view.
  const gapScale = hasEvents ? AGENDA_GAP_SCALE : 1
  const compactInfoGap = Math.round(
    height * 0.05 * gapScale,
  )
  const compactAgendaGap = Math.round(
    height * 0.03 * gapScale,
  )
  const compactEventRowGap = Math.round(
    height * 0.01 * gapScale,
  )
  const dateGap = Math.round(height * 0.045 * gapScale)
  const weatherGap = Math.round(height * 0.05 * gapScale)
  const agendaGap = Math.round(height * 0.05 * gapScale)
  const headingGap = Math.round(height * 0.02 * gapScale)
  const eventRowGap = Math.round(height * 0.015 * gapScale)
  const pinnedTopPadding = Math.round(height * 0.04)
  // Held back from the row budget. A row that ends on the last pixel row reads
  // as clipped even when it is not, and it is one rounding change away from
  // actually being clipped.
  const bottomBreathingRoom = Math.round(height * 0.02)

  // What the blocks above the agenda cost, so the rows get exactly the height
  // that is actually left. Every term mirrors a style object below: the time,
  // date and weather lines are `lineHeight: 1`, so their ink height is their
  // font size, and a weather row is as tall as its tallest member.
  const compactWeatherRowHeight = hasTemperature
    ? compactTemperatureFontSize
    : compactInfoFontSize
  const largeWeatherRowHeight = hasTemperature
    ? largeTemperatureFontSize
    : largeConditionFontSize
  const headerHeight = isCompactPanel
    ? pinnedTopPadding +
      fittedTime.fontSize +
      compactInfoGap +
      compactWeatherRowHeight +
      compactAgendaGap
    : fittedTime.fontSize +
      dateGap +
      fittedDate.fontSize +
      (hasWeather
        ? weatherGap + largeWeatherRowHeight
        : 0) +
      agendaGap +
      headingFontSize +
      headingGap

  const eventRowHeight = isCompactPanel
    ? compactEventRowGap +
      Math.ceil(
        compactEventTimeFontSize * EVENT_LINE_HEIGHT,
      )
    : eventRowGap +
      Math.ceil(
        Math.max(eventTimeFontSize, eventSummaryFontSize) *
          EVENT_LINE_HEIGHT,
      )

  // Only the rows that finish on the glass are drawn. The dropped ones are the
  // least imminent, and they arrive on a later repaint as the earlier events
  // start and leave the list.
  const visibleEvents = events.slice(
    0,
    countRowsThatFit({
      availableHeight:
        height - headerHeight - bottomBreathingRoom,
      rowHeight: eventRowHeight,
    }),
  )
  const hasVisibleEvents = visibleEvents.length > 0

  // Pin the time to the top once a compact panel is carrying events. The row
  // count above already guarantees the column fits, so this is about stability
  // rather than overflow: the pHAT's agenda gains and loses rows through the
  // day, and a centred column would walk the clock up and down the glass on
  // every repaint. Pinned, the time stays where the reader last saw it. With no
  // events the view still centres, so it reads identically to ClockWeatherView
  // on a free day.
  const isPinnedToTop = isCompactPanel && hasVisibleEvents
  const rootStyle: CSSProperties = {
    ...buildPanelRootStyle({
      width,
      height,
      colourMode,
    }),
    alignItems: "center",
    justifyContent: isPinnedToTop ? "flex-start" : "center",
    paddingTop: isPinnedToTop ? pinnedTopPadding : 0,
    paddingLeft: horizontalPadding,
    paddingRight: horizontalPadding,
  }

  // Event summaries never wrap (one row each), so a long title would otherwise
  // run off the right edge. Cap each summary to the row's remaining width and
  // ellipsis-truncate — both render engines honour this with nowrap + hidden.
  const compactSummaryMaxWidth =
    availableWidth -
    Math.round(width * 0.2) -
    Math.round(width * 0.02)
  const largeSummaryMaxWidth =
    availableWidth -
    Math.round(width * 0.16) -
    Math.round(width * 0.02)

  const timeStyle: CSSProperties = {
    display: "flex",
    fontSize: fittedTime.fontSize,
    letterSpacing: fittedTime.letterSpacing,
    fontWeight: 700,
    lineHeight: 1,
    whiteSpace: "nowrap",
    color: accentColour,
  }

  const compactInfoRowStyle: CSSProperties = {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    marginTop: compactInfoGap,
  }

  const compactDateStyle: CSSProperties = {
    display: "flex",
    fontSize: compactInfoFontSize,
    letterSpacing: fittedCompactInfo.letterSpacing,
    fontWeight: 700,
    lineHeight: 1,
    whiteSpace: "nowrap",
  }

  const compactSeparatorStyle: CSSProperties = {
    display: "flex",
    fontSize: compactInfoFontSize,
    fontWeight: 700,
    lineHeight: 1,
    marginLeft: Math.round(width * 0.02),
    marginRight: Math.round(width * 0.02),
  }

  const compactTemperatureStyle: CSSProperties = {
    display: "flex",
    fontSize: compactTemperatureFontSize,
    fontWeight: 700,
    lineHeight: 1,
    color: accentColour,
  }

  const compactConditionStyle: CSSProperties = {
    display: "flex",
    fontSize: compactInfoFontSize,
    letterSpacing: fittedCompactInfo.letterSpacing,
    fontWeight: 700,
    lineHeight: 1,
    whiteSpace: "nowrap",
    marginLeft: Math.round(width * 0.02),
  }

  const largeDateStyle: CSSProperties = {
    display: "flex",
    fontSize: fittedDate.fontSize,
    letterSpacing: fittedDate.letterSpacing,
    fontWeight: 700,
    lineHeight: 1,
    whiteSpace: "nowrap",
    marginTop: dateGap,
  }

  const largeWeatherRowStyle: CSSProperties = {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    marginTop: weatherGap,
  }

  const largeTemperatureStyle: CSSProperties = {
    display: "flex",
    fontSize: largeTemperatureFontSize,
    fontWeight: 700,
    lineHeight: 1,
    color: accentColour,
  }

  const largeConditionStyle: CSSProperties = {
    display: "flex",
    fontSize: largeConditionFontSize,
    fontWeight: 700,
    lineHeight: 1,
    whiteSpace: "nowrap",
    marginLeft: Math.round(width * 0.025),
  }

  // The compact pHAT stacks its imminent events as tight time + summary rows,
  // sized so a handful fit above the fold on a 122px panel.
  const compactAgendaBlockStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    marginTop: compactAgendaGap,
  }

  const compactEventRowStyle: CSSProperties = {
    display: "flex",
    flexDirection: "row",
    alignItems: "baseline",
    marginTop: compactEventRowGap,
  }

  const compactEventTimeStyle: CSSProperties = {
    display: "flex",
    fontSize: compactEventTimeFontSize,
    fontWeight: 700,
    lineHeight: 1.1,
    whiteSpace: "nowrap",
    color: accentColour,
    width: Math.round(width * 0.2),
    flexShrink: 0,
  }

  // `block`, NOT `flex`: text-overflow only applies to a block container, so as
  // a flex box Chromium silently drops the ellipsis and lets a long summary run
  // off the panel edge. `minWidth: 0` is equally load-bearing — a flex child
  // defaults to `min-width: auto` and refuses to shrink below its nowrap text,
  // so `maxWidth` never binds without it.
  const compactEventSummaryStyle: CSSProperties = {
    display: "block",
    fontSize: compactEventSummaryFontSize,
    fontWeight: 700,
    lineHeight: 1.1,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    minWidth: 0,
    maxWidth: compactSummaryMaxWidth,
    marginLeft: Math.round(width * 0.02),
  }

  const agendaBlockStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    marginTop: agendaGap,
  }

  const headingStyle: CSSProperties = {
    display: "flex",
    fontSize: headingFontSize,
    fontWeight: 700,
    lineHeight: 1,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: accentColour,
    marginBottom: headingGap,
  }

  const eventRowStyle: CSSProperties = {
    display: "flex",
    flexDirection: "row",
    alignItems: "baseline",
    marginTop: eventRowGap,
  }

  const eventTimeStyle: CSSProperties = {
    display: "flex",
    fontSize: eventTimeFontSize,
    fontWeight: 700,
    lineHeight: 1.1,
    whiteSpace: "nowrap",
    color: accentColour,
    width: Math.round(width * 0.16),
    flexShrink: 0,
  }

  /** Block + minWidth 0 for the same reason as the compact style above. */
  const eventSummaryStyle: CSSProperties = {
    display: "block",
    fontSize: eventSummaryFontSize,
    fontWeight: 700,
    lineHeight: 1.1,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    minWidth: 0,
    maxWidth: largeSummaryMaxWidth,
    marginLeft: Math.round(width * 0.02),
  }

  return (
    <div style={rootStyle}>
      <div style={timeStyle}>{time}</div>

      {isCompactPanel ? (
        <div style={compactInfoRowStyle}>
          <div style={compactDateStyle}>{date}</div>
          {hasWeather ? (
            <div style={compactSeparatorStyle}>·</div>
          ) : null}
          {hasTemperature ? (
            <div style={compactTemperatureStyle}>
              {temperatureText}
            </div>
          ) : null}
          {hasCondition ? (
            <div style={compactConditionStyle}>
              {conditionText}
            </div>
          ) : null}
        </div>
      ) : (
        <div style={largeDateStyle}>{date}</div>
      )}

      {isCompactPanel || !hasWeather ? null : (
        <div style={largeWeatherRowStyle}>
          {hasTemperature ? (
            <div style={largeTemperatureStyle}>
              {temperatureText}
            </div>
          ) : null}
          {hasCondition ? (
            <div style={largeConditionStyle}>
              {conditionText}
            </div>
          ) : null}
        </div>
      )}

      {!hasVisibleEvents ? null : isCompactPanel ? (
        <div style={compactAgendaBlockStyle}>
          {visibleEvents.map((event) => (
            <div
              key={`${event.timeText}-${event.summary}`}
              style={compactEventRowStyle}
            >
              <div style={compactEventTimeStyle}>
                {event.timeText}
              </div>
              <div style={compactEventSummaryStyle}>
                {event.summary}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={agendaBlockStyle}>
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
        </div>
      )}
    </div>
  )
}
