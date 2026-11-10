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

/** Each date line is `fontSize x this`; two lines stack without touching. */
const DATE_LINE_HEIGHT = 1.08

/**
 * Bold Atkinson Hyperlegible advance per character, in em, for every
 * character an `en-US` date can contain. Measured in Chromium with the
 * bundled font. Summed over a whole date, these land within 0.5% of the
 * rendered width for every weekday, month, and day. `fitText`'s flat 0.52
 * estimate is what let a long date be cut off on the glass.
 */
const DATE_BOLD_ADVANCE_EM: Readonly<
  Record<string, number>
> = {
  "0": 0.652,
  "1": 0.448,
  "2": 0.586,
  "3": 0.605,
  "4": 0.626,
  "5": 0.612,
  "6": 0.632,
  "7": 0.543,
  "8": 0.625,
  "9": 0.561,
  " ": 0.32,
  ",": 0.243,
  "/": 0.442,
  A: 0.69,
  D: 0.686,
  F: 0.544,
  J: 0.56,
  M: 0.842,
  N: 0.7,
  O: 0.764,
  S: 0.619,
  T: 0.617,
  W: 0.883,
  a: 0.553,
  b: 0.596,
  c: 0.52,
  d: 0.596,
  e: 0.566,
  g: 0.597,
  h: 0.572,
  i: 0.315,
  l: 0.314,
  m: 0.886,
  n: 0.572,
  o: 0.573,
  p: 0.596,
  r: 0.372,
  s: 0.534,
  t: 0.379,
  u: 0.57,
  v: 0.526,
  y: 0.518,
}

/** An unlisted character counts as the widest glyph in the table. */
const WIDEST_DATE_ADVANCE_EM = Math.max(
  ...Object.values(DATE_BOLD_ADVANCE_EM),
)

/**
 * Kerning and rounding margin between the summed and the drawn width. A
 * one-line date inside the raw estimate but not this margin tightens its
 * letter-spacing by the difference, so a near-boundary date neither splits
 * (and costs a row) nor ends in an ellipsis.
 */
const DATE_WIDTH_SAFETY = 1.02

/** Raw width of `text` in bold at `fontSize`, from the measured table. */
const estimateDateWidth = ({
  text,
  fontSize,
}: {
  text: string
  fontSize: number
}) =>
  [...text].reduce(
    (total, character) =>
      total +
      (DATE_BOLD_ADVANCE_EM[character] ??
        WIDEST_DATE_ADVANCE_EM),
    0,
  ) * fontSize

/**
 * The most a one-line date may tighten its letter-spacing, in em. Half of
 * `fitText`'s condense limit, so the squeeze is not visible. It absorbs the
 * gap between the measured table and Satori, which draws a little narrower
 * than Chromium, so a date that truly fits never splits and costs a row.
 */
const MAXIMUM_DATE_CONDENSE_EM = 0.03

/**
 * Letter-spacing (0 or negative, to a tenth of a pixel, rounded toward
 * tighter) that brings a one-line date inside the safety margin, or
 * `undefined` when that would take more than `MAXIMUM_DATE_CONDENSE_EM`.
 */
const getOneLineDateLetterSpacing = ({
  text,
  fontSize,
  availableWidth,
}: {
  text: string
  fontSize: number
  availableWidth: number
}) => {
  const overflow =
    estimateDateWidth({ text, fontSize }) *
      DATE_WIDTH_SAFETY -
    availableWidth
  if (overflow <= 0) {
    return 0
  }
  const condensePerCharacter = overflow / text.length
  if (
    condensePerCharacter >
    MAXIMUM_DATE_CONDENSE_EM * fontSize
  ) {
    return undefined
  }
  return -Math.ceil(condensePerCharacter * 10) / 10
}

/**
 * The date as the lines the rail draws.
 *
 * The rail is half the panel. A date that fits on one line at full size,
 * allowing a slight letter-spacing squeeze, stays on one line, so it costs no
 * agenda row. A longer one (`Tuesday, November
 * 10` on a 678px window) breaks at its first comma into `["Tuesday",
 * "November 10"]`: every word stays whole and the type stays large, where one
 * line would end in an ellipsis. A date with no comma stays on one line.
 */
export const splitDateLines = ({
  date,
  fontSize,
  availableWidth,
}: {
  date: string
  fontSize: number
  availableWidth: number
}) => {
  const commaIndex = date.indexOf(", ")
  const isFitOnOneLine =
    getOneLineDateLetterSpacing({
      text: date,
      fontSize,
      availableWidth,
    }) !== undefined
  if (commaIndex === -1 || isFitOnOneLine) {
    return [date]
  }
  return [
    date.slice(0, commaIndex),
    date.slice(commaIndex + 2),
  ]
}

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

  const baseDateFontSize = Math.round(height * 0.09)
  const dateLines = splitDateLines({
    date,
    fontSize: baseDateFontSize,
    availableWidth: railContentWidth,
  })
  const longestDateLine = dateLines.reduce(
    (longest, line) =>
      line.length > longest.length ? line : longest,
    "",
  )
  const oneLineLetterSpacing =
    dateLines.length === 1
      ? getOneLineDateLetterSpacing({
          text: date,
          fontSize: baseDateFontSize,
          availableWidth: railContentWidth,
        })
      : undefined
  const fittedDate =
    oneLineLetterSpacing !== undefined
      ? {
          fontSize: baseDateFontSize,
          letterSpacing: oneLineLetterSpacing,
        }
      : fitText({
          baseFontSize: baseDateFontSize,
          minimumFontSize: readableFloor,
          availableWidth: railContentWidth,
          text: longestDateLine,
        })
  const dateLineHeight = Math.ceil(
    fittedDate.fontSize * DATE_LINE_HEIGHT,
  )
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
    dateLineHeight * dateLines.length +
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
    lineHeight: `${dateLineHeight}px`,
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
        {dateLines.map((line) => (
          <div key={line} style={dateStyle}>
            {line}
          </div>
        ))}

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
