import { describe, expect, test } from "vitest"
import {
  formatClockDate,
  formatClockDateLines,
  formatClockTime,
  formatClockTimeParts,
  formatDateTile,
  formatEventTime,
} from "./time.ts"

/**
 * A fixed instant — 2026-07-24 20:05 UTC — so every expectation below is a
 * literal string rather than a re-derivation of the code under test. In
 * America/Chicago (UTC-5 in July) that reads 3:05 PM on Friday the 24th.
 */
const AFTERNOON_MILLIS = Date.UTC(2026, 6, 24, 20, 5)

const CHICAGO = "America/Chicago"

/**
 * Some ICU versions separate the day period with a narrow no-break space
 * (U+202F); folding it to a plain space keeps the expectations readable and
 * the assertions stable across Chromium builds.
 */
const withPlainSpaces = (text: string) =>
  text.replace(/\u202f/g, " ")

describe("formatClockTime", () => {
  test("renders a twelve-hour time in the configured zone", () => {
    expect(
      withPlainSpaces(
        formatClockTime(AFTERNOON_MILLIS, {
          timeZone: CHICAGO,
          isTwelveHour: true,
          isNumericDate: false,
        }),
      ),
    ).toBe("3:05 PM")
  })

  test("renders a twenty-four-hour time in the configured zone", () => {
    expect(
      formatClockTime(AFTERNOON_MILLIS, {
        timeZone: CHICAGO,
        isTwelveHour: false,
        isNumericDate: false,
      }),
    ).toBe("15:05")
  })

  test("honors a zone on the other side of the date line", () => {
    expect(
      withPlainSpaces(
        formatClockTime(AFTERNOON_MILLIS, {
          timeZone: "Asia/Tokyo",
          isTwelveHour: true,
          isNumericDate: false,
        }),
      ),
    ).toBe("5:05 AM")
  })

  test("defaults to twelve-hour device-local time with no config", () => {
    expect(
      withPlainSpaces(formatClockTime(AFTERNOON_MILLIS)),
    ).toMatch(/^\d{1,2}:\d{2} (AM|PM)$/)
  })

  test("falls back to device-local time when the zone is unknown", () => {
    // Intl throws a RangeError on a bad zone — the clock must still render.
    const deviceLocal = formatClockTime(AFTERNOON_MILLIS, {
      isTwelveHour: true,
      isNumericDate: false,
    })

    const withBadZone = formatClockTime(AFTERNOON_MILLIS, {
      timeZone: "Nowhere/AtAll",
      isTwelveHour: true,
      isNumericDate: false,
    })

    expect(withPlainSpaces(withBadZone)).toMatch(
      /^\d{1,2}:\d{2} (AM|PM)$/,
    )
    expect(withBadZone).toBe(deviceLocal)
  })
})

describe("formatClockDate", () => {
  test("renders a long date with the weekday", () => {
    expect(
      formatClockDate(AFTERNOON_MILLIS, {
        timeZone: CHICAGO,
        isTwelveHour: true,
        isNumericDate: false,
      }),
    ).toBe("Friday, July 24")
  })

  test("renders a numeric date with the year", () => {
    expect(
      formatClockDate(AFTERNOON_MILLIS, {
        timeZone: CHICAGO,
        isTwelveHour: true,
        isNumericDate: true,
      }),
    ).toBe("7/24/2026")
  })

  test("falls back to the device-local date when the zone is unknown", () => {
    const deviceLocal = formatClockDate(AFTERNOON_MILLIS, {
      isTwelveHour: true,
      isNumericDate: false,
    })

    const withBadZone = formatClockDate(AFTERNOON_MILLIS, {
      timeZone: "Nowhere/AtAll",
      isTwelveHour: true,
      isNumericDate: false,
    })

    expect(withBadZone).toMatch(/^\w+, \w+ \d{1,2}$/)
    expect(withBadZone).toBe(deviceLocal)
  })
})

describe("formatEventTime", () => {
  test("labels an all-day event instead of timing it", () => {
    expect(
      formatEventTime({
        startMillis: AFTERNOON_MILLIS,
        isAllDay: true,
        clock: {
          timeZone: CHICAGO,
          isTwelveHour: true,
          isNumericDate: false,
        },
      }),
    ).toBe("All day")
  })

  test("renders a timed event as twelve-hour wall-clock time", () => {
    expect(
      withPlainSpaces(
        formatEventTime({
          startMillis: AFTERNOON_MILLIS,
          isAllDay: false,
          clock: {
            timeZone: CHICAGO,
            isTwelveHour: true,
            isNumericDate: false,
          },
        }),
      ),
    ).toBe("3:05 PM")
  })

  test("renders a timed event as twenty-four-hour time", () => {
    expect(
      formatEventTime({
        startMillis: AFTERNOON_MILLIS,
        isAllDay: false,
        clock: {
          timeZone: CHICAGO,
          isTwelveHour: false,
          isNumericDate: false,
        },
      }),
    ).toBe("15:05")
  })

  test("falls back to device-local time when the zone is unknown", () => {
    const deviceLocal = formatEventTime({
      startMillis: AFTERNOON_MILLIS,
      isAllDay: false,
      clock: {
        isTwelveHour: true,
        isNumericDate: false,
      },
    })

    const withBadZone = formatEventTime({
      startMillis: AFTERNOON_MILLIS,
      isAllDay: false,
      clock: {
        timeZone: "Nowhere/AtAll",
        isTwelveHour: true,
        isNumericDate: false,
      },
    })

    expect(withPlainSpaces(withBadZone)).toMatch(
      /^\d{1,2}:\d{2} (AM|PM)$/,
    )
    expect(withBadZone).toBe(deviceLocal)
  })
})

describe("formatClockTimeParts", () => {
  test("splits a twelve-hour time into the digits and the meridiem", () => {
    expect(
      formatClockTimeParts(AFTERNOON_MILLIS, {
        timeZone: CHICAGO,
        isTwelveHour: true,
        isNumericDate: false,
      }),
    ).toEqual({ time: "3:05", meridiem: "PM" })
  })

  test("has no meridiem in twenty-four-hour mode", () => {
    expect(
      formatClockTimeParts(AFTERNOON_MILLIS, {
        timeZone: CHICAGO,
        isTwelveHour: false,
        isNumericDate: false,
      }),
    ).toEqual({ time: "15:05", meridiem: "" })
  })

  test("falls back to the device zone when the configured one is unknown", () => {
    const { time, meridiem } = formatClockTimeParts(
      AFTERNOON_MILLIS,
      {
        timeZone: "Not/AZone",
        isTwelveHour: true,
        isNumericDate: false,
      },
    )
    expect(time).toMatch(/^\d{1,2}:\d{2}$/)
    expect(["AM", "PM"]).toContain(meridiem)
  })
})

describe("formatDateTile", () => {
  test("renders the weekday, day and month as a three-line tile", () => {
    expect(
      formatDateTile(AFTERNOON_MILLIS, {
        timeZone: CHICAGO,
        isTwelveHour: true,
        isNumericDate: false,
      }),
    ).toEqual({ weekday: "FRI", day: "24", month: "JUL" })
  })

  test("keeps the tile shape when the config asks for a numeric date", () => {
    expect(
      formatDateTile(AFTERNOON_MILLIS, {
        timeZone: CHICAGO,
        isTwelveHour: true,
        isNumericDate: true,
      }),
    ).toEqual({ weekday: "FRI", day: "24", month: "JUL" })
  })

  test("crosses the date line with the zone", () => {
    expect(
      formatDateTile(AFTERNOON_MILLIS, {
        timeZone: "Australia/Sydney",
        isTwelveHour: true,
        isNumericDate: false,
      }),
    ).toEqual({ weekday: "SAT", day: "25", month: "JUL" })
  })
})

describe("formatClockDateLines", () => {
  test("splits the long date into the weekday and the month-day", () => {
    expect(
      formatClockDateLines(AFTERNOON_MILLIS, {
        timeZone: CHICAGO,
        isTwelveHour: true,
        isNumericDate: false,
      }),
    ).toEqual(["Friday", "July 24"])
  })

  test("keeps a numeric date as one line", () => {
    expect(
      formatClockDateLines(AFTERNOON_MILLIS, {
        timeZone: CHICAGO,
        isTwelveHour: true,
        isNumericDate: true,
      }),
    ).toEqual(["7/24/2026"])
  })
})
