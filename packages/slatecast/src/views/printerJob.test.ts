import { describe, expect, test } from "vitest"
import {
  formatFinishTime,
  formatRemaining,
  getFinishAtMs,
  getPrinterJobTitle,
} from "./printerJob.ts"

describe("getPrinterJobTitle", () => {
  test("joins the parts the owner typed with a middle dot", () => {
    expect(
      getPrinterJobTitle({
        jobName:
          "Touch_Display_2_-_Front_Frame_and_Stand_-_Matte_Black_-_Magi",
        name: "Magi",
      }),
    ).toBe(
      "Touch Display 2 · Front Frame and Stand · Matte Black",
    )
  })

  test("drops the printer name off the end of the last part", () => {
    expect(
      getPrinterJobTitle({
        jobName:
          "Laundry_ACD_15_Swaps_Lips_Then_Icons_Quadrahedron",
        name: "Quadrahedron",
      }),
    ).toBe("Laundry ACD 15 Swaps Lips Then Icons")
  })

  test("keeps every part that is not the printer's own name", () => {
    expect(
      getPrinterJobTitle({
        jobName:
          "AMS_2_Pro_Dry_Pods_-_Six_Large_-_Smoke_PETG_-_Foopie_-_240C",
        name: "Foopie",
      }),
    ).toBe(
      "AMS 2 Pro Dry Pods · Six Large · Smoke PETG · 240C",
    )
  })

  test("a name with nothing to shorten comes back as it went in", () => {
    expect(
      getPrinterJobTitle({
        jobName: "Benchy",
        name: "Magi",
      }),
    ).toBe("Benchy")
  })
})

describe("formatRemaining", () => {
  test.each([
    [128, "2h 08m"],
    [47, "47m"],
    [0, "0m"],
    [600, "10h 00m"],
  ])("%i minutes reads as %s", (minutes, expected) => {
    expect(formatRemaining(minutes)).toBe(expected)
  })
})

describe("getFinishAtMs", () => {
  const nowMillis = Date.parse("2026-09-23T18:00:00.000Z")

  test("prefers the end time Home Assistant pushed", () => {
    expect(
      getFinishAtMs({
        job: {
          id: "magi",
          name: "Magi",
          jobName: "Benchy",
          percent: 41,
          state: "printing",
          finishAtMs: 1234,
          remainingMinutes: 128,
        },
        nowMillis,
      }),
    ).toBe(1234)
  })

  test("falls back to the remaining minutes", () => {
    expect(
      getFinishAtMs({
        job: {
          id: "magi",
          name: "Magi",
          jobName: "Benchy",
          percent: 41,
          state: "printing",
          remainingMinutes: 30,
        },
        nowMillis,
      }),
    ).toBe(nowMillis + 30 * 60_000)
  })

  test("nothing to say means no row", () => {
    expect(
      getFinishAtMs({
        job: {
          id: "magi",
          name: "Magi",
          jobName: "Benchy",
          percent: 41,
          state: "printing",
        },
        nowMillis,
      }),
    ).toBeNull()
  })
})

describe("formatFinishTime", () => {
  /** 2026-07-24 20:05 UTC — Friday 3:05 PM in Chicago. */
  const nowMillis = Date.UTC(2026, 6, 24, 20, 5)

  const clock = {
    timeZone: "America/Chicago",
    isTwelveHour: true,
    isNumericDate: false,
  }

  /**
   * Some ICU builds separate the day period with a narrow no-break space
   * (U+202F); folding it keeps the expectations readable.
   */
  const withPlainSpaces = (text: string) =>
    text.replace(/\u202f/g, " ")

  test("a finish later today is the bare clock time", () => {
    expect(
      withPlainSpaces(
        formatFinishTime({
          clock,
          finishAtMs: Date.UTC(2026, 6, 24, 22, 47),
          nowMillis,
        }),
      ),
    ).toBe("5:47 PM")
  })

  test("a finish the next day names tomorrow", () => {
    expect(
      withPlainSpaces(
        formatFinishTime({
          clock,
          finishAtMs: Date.UTC(2026, 6, 25, 20, 47),
          nowMillis,
        }),
      ),
    ).toBe("Tomorrow 3:47 PM")
  })

  test("an overnight finish names tomorrow after eight hours", () => {
    expect(
      withPlainSpaces(
        formatFinishTime({
          clock,
          finishAtMs: Date.UTC(2026, 6, 25, 6, 0),
          nowMillis,
        }),
      ),
    ).toBe("Tomorrow 1:00 AM")
  })

  test("a finish further out names its weekday", () => {
    expect(
      withPlainSpaces(
        formatFinishTime({
          clock,
          finishAtMs: Date.UTC(2026, 6, 26, 19, 30),
          nowMillis,
        }),
      ),
    ).toBe("Sun 2:30 PM")
  })

  test("a week or more out names the date instead", () => {
    expect(
      withPlainSpaces(
        formatFinishTime({
          clock,
          finishAtMs: Date.UTC(2026, 7, 1, 19, 30),
          nowMillis,
        }),
      ),
    ).toBe("Aug 1 2:30 PM")
  })

  test("a finish already past keeps the bare time", () => {
    expect(
      withPlainSpaces(
        formatFinishTime({
          clock,
          finishAtMs: Date.UTC(2026, 6, 23, 20, 5),
          nowMillis,
        }),
      ),
    ).toBe("3:05 PM")
  })
})
