import type { BrowserClockConfig } from "@castkit/shared/protocol/ws"

/**
 * Client-side clock formatting shared by every browser view that shows a clock
 * (Ambient, Clock, Weather, Calendar). Formatting is pure `Intl`
 * (`toLocaleTimeString`/`toLocaleDateString`), honoring the server-stamped
 * global clock config: `timeZone` (IANA), 12/24-hour, and long/numeric date —
 * the same Home Assistant Clock:* knobs the ePaper devices respect. Absent
 * config falls back to the device's own timezone in 12-hour / long form.
 */

const DEFAULT_CLOCK: BrowserClockConfig = {
  isTwelveHour: true,
  isNumericDate: false,
}

/**
 * `Intl` throws a RangeError on an unknown `timeZone` string. Retry once
 * without it so a stray value can never blank the clock — it just renders in
 * the device-local zone instead.
 */
const formatSafely = ({
  millis,
  options,
  timeZone,
}: {
  millis: number
  options: Intl.DateTimeFormatOptions
  timeZone?: string
}) => {
  const date = new Date(millis)
  if (!timeZone) {
    return date.toLocaleString("en-US", options)
  }
  try {
    return date.toLocaleString("en-US", {
      ...options,
      timeZone,
    })
  } catch {
    return date.toLocaleString("en-US", options)
  }
}

/**
 * `Intl.formatToParts` with the same unknown-timezone fallback as
 * `formatSafely`, for the callers that need the pieces rather than the string.
 */
const formatPartsSafely = ({
  millis,
  options,
  timeZone,
}: {
  millis: number
  options: Intl.DateTimeFormatOptions
  timeZone?: string
}) => {
  const date = new Date(millis)
  if (!timeZone) {
    return new Intl.DateTimeFormat(
      "en-US",
      options,
    ).formatToParts(date)
  }
  try {
    return new Intl.DateTimeFormat("en-US", {
      ...options,
      timeZone,
    }).formatToParts(date)
  } catch {
    return new Intl.DateTimeFormat(
      "en-US",
      options,
    ).formatToParts(date)
  }
}

/**
 * The clock time as two pieces — "12:45" and "PM" — so a panel can set the
 * meridiem in its own size. The meridiem is "" in twenty-four-hour mode.
 */
export const formatClockTimeParts = (
  millis: number,
  clock: BrowserClockConfig = DEFAULT_CLOCK,
) => {
  const parts = formatPartsSafely({
    millis,
    timeZone: clock.timeZone,
    options: {
      hour: "numeric",
      minute: "2-digit",
      hour12: clock.isTwelveHour,
    },
  })
  const meridiem =
    parts.find((part) => part.type === "dayPeriod")
      ?.value ?? ""
  const time = parts
    .filter((part) => part.type !== "dayPeriod")
    .map((part) => part.value)
    .join("")
    .trim()
  return { time, meridiem }
}

/**
 * The date as a wall-calendar tile: "FRI", "11", "SEP". Always this shape —
 * the tile is a fixed frame, so the numeric-date setting does not reach it.
 */
export const formatDateTile = (
  millis: number,
  clock: BrowserClockConfig = DEFAULT_CLOCK,
) => {
  const parts = formatPartsSafely({
    millis,
    timeZone: clock.timeZone,
    options: {
      weekday: "short",
      month: "short",
      day: "numeric",
    },
  })
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ""
  return {
    weekday: pick("weekday").toUpperCase(),
    day: pick("day"),
    month: pick("month").toUpperCase(),
  }
}

/**
 * The long date as two lines — "Friday" and "September 11" — for a panel that
 * has the height for the weekday but not the width for the whole string. A
 * numeric date has no weekday and comes back as one line.
 */
export const formatClockDateLines = (
  millis: number,
  clock: BrowserClockConfig = DEFAULT_CLOCK,
) => {
  if (clock.isNumericDate) {
    return [formatClockDate(millis, clock)]
  }
  const parts = formatPartsSafely({
    millis,
    timeZone: clock.timeZone,
    options: {
      weekday: "long",
      month: "long",
      day: "numeric",
    },
  })
  const weekday =
    parts.find((part) => part.type === "weekday")?.value ??
    ""
  const monthDay = parts
    .filter(
      (part) =>
        part.type === "month" ||
        part.type === "day" ||
        (part.type === "literal" &&
          part.value.trim() === ""),
    )
    .map((part) => part.value)
    .join("")
    .trim()
  return [weekday, monthDay]
}

export const formatClockTime = (
  millis: number,
  clock: BrowserClockConfig = DEFAULT_CLOCK,
) =>
  formatSafely({
    millis,
    timeZone: clock.timeZone,
    options: {
      hour: "numeric",
      minute: "2-digit",
      hour12: clock.isTwelveHour,
    },
  })

export const formatClockDate = (
  millis: number,
  clock: BrowserClockConfig = DEFAULT_CLOCK,
) =>
  formatSafely({
    millis,
    timeZone: clock.timeZone,
    options: clock.isNumericDate
      ? {
          month: "numeric",
          day: "numeric",
          year: "numeric",
        }
      : { weekday: "long", month: "long", day: "numeric" },
  })

/** Short wall-clock time for a calendar row (all-day events show "All day"). */
export const formatEventTime = ({
  startMillis,
  isAllDay,
  clock = DEFAULT_CLOCK,
}: {
  startMillis: number
  isAllDay: boolean
  clock?: BrowserClockConfig
}) =>
  isAllDay
    ? "All day"
    : formatSafely({
        millis: startMillis,
        timeZone: clock.timeZone,
        options: {
          hour: "numeric",
          minute: "2-digit",
          hour12: clock.isTwelveHour,
        },
      })
