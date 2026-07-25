import { describe, expect, test } from "vitest"
import {
  formatClockDate,
  formatClockTime,
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

  test("honours a zone on the other side of the date line", () => {
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
