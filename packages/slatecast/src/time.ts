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

/**
 * The instant's calendar day in the panel's timezone, counted in whole days
 * since the epoch.
 *
 * `Date`'s own getters read the CONTAINER's zone, and the panel's zone is the
 * one on the wall, so the day is read back out of `Intl` instead.
 */
const getClockDayNumber = (
  millis: number,
  clock: BrowserClockConfig = DEFAULT_CLOCK,
) => {
  const parts = formatPartsSafely({
    millis,
    timeZone: clock.timeZone,
    options: {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    },
  })
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value)
  return Math.round(
    Date.UTC(pick("year"), pick("month") - 1, pick("day")) /
      86_400_000,
  )
}

/**
 * Whole calendar days from one instant to another: 0 for later the same day, 1
 * for tomorrow, 2 for the day after.
 *
 * Elapsed milliseconds cannot answer this question. A time twenty-three hours
 * away can be today and a time eight hours away can be tomorrow, because the
 * boundary a person means is midnight and not a duration.
 */
export const getClockDayOffset = ({
  fromMillis,
  toMillis,
  clock = DEFAULT_CLOCK,
}: {
  fromMillis: number
  toMillis: number
  clock?: BrowserClockConfig
}) =>
  getClockDayNumber(toMillis, clock) -
  getClockDayNumber(fromMillis, clock)

/** The short weekday — "Fri" — for a time that has to name its own day. */
export const formatClockWeekdayShort = (
  millis: number,
  clock: BrowserClockConfig = DEFAULT_CLOCK,
) =>
  formatSafely({
    millis,
    timeZone: clock.timeZone,
    options: { weekday: "short" },
  })

/** The short date — "Oct 3" — for a day too far out for a weekday to name. */
export const formatClockMonthDay = (
  millis: number,
  clock: BrowserClockConfig = DEFAULT_CLOCK,
) =>
  formatSafely({
    millis,
    timeZone: clock.timeZone,
    options: { month: "short", day: "numeric" },
  })

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
