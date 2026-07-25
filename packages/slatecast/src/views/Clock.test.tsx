import type { BrowserClockConfig } from "@castkit/shared/protocol/ws"
import { waitFor } from "@testing-library/preact"
import { describe, expect, test } from "vitest"
import {
  buildSettings,
  buildSnapshot,
} from "../__fixtures__/buildSnapshot.ts"
import { mountSlatecast } from "../__tests__/setup/mountSlatecast.tsx"

/**
 * The clock renders the live 1 Hz tick, so no exact wall-clock string can be
 * asserted — the tests check the *shape* each config produces, and compare two
 * timezones against each other for the offset the config asked for.
 */
const TWELVE_HOUR_TIME = /^\d{1,2}:\d{2}\s(AM|PM)$/
const TWENTY_FOUR_HOUR_TIME = /^\d{1,2}:\d{2}$/
const LONG_DATE = /^\w+day, \w+ \d{1,2}$/
const NUMERIC_DATE = /^\d{1,2}\/\d{1,2}\/\d{4}$/

const mountClockView = async (clock?: BrowserClockConfig) =>
  mountSlatecast({
    snapshot: buildSnapshot({
      view: "clock",
      settings: buildSettings({ clock }),
      data: {},
    }),
  })

const timeTextIn = (container: Element) =>
  container.querySelector(".ambient-time")?.textContent ??
  ""

const dateTextIn = (container: Element) =>
  container.querySelector(".ambient-date")?.textContent ??
  ""

/** The hour the clock is showing, normalised past the h24 midnight quirk. */
const hourIn = (container: Element) =>
  Number(timeTextIn(container).split(":")[0]) % 24

describe("clock rendering", () => {
  test("renders a twelve-hour time and a long date by default", async () => {
    const { view } = await mountClockView()

    expect(timeTextIn(view.container)).toMatch(
      TWELVE_HOUR_TIME,
    )
    expect(dateTextIn(view.container)).toMatch(LONG_DATE)
  })
})

describe("clock config", () => {
  test("drops the meridiem when the config asks for twenty-four hour time", async () => {
    const { view } = await mountClockView({
      isTwelveHour: false,
      isNumericDate: false,
    })

    expect(timeTextIn(view.container)).toMatch(
      TWENTY_FOUR_HOUR_TIME,
    )
    expect(timeTextIn(view.container)).not.toMatch(/AM|PM/)
    expect(dateTextIn(view.container)).toMatch(LONG_DATE)
  })

  test("renders a numeric date when the config asks for one", async () => {
    const { view } = await mountClockView({
      isTwelveHour: true,
      isNumericDate: true,
    })

    expect(dateTextIn(view.container)).toMatch(NUMERIC_DATE)
    expect(timeTextIn(view.container)).toMatch(
      TWELVE_HOUR_TIME,
    )
  })

  test("re-formats in the new timezone when the server pushes fresh settings", async () => {
    const { server, view } = await mountClockView({
      timeZone: "UTC",
      isTwelveHour: false,
      isNumericDate: false,
    })
    const utcHour = hourIn(view.container)

    server.push({
      type: "settings",
      settings: buildSettings({
        clock: {
          timeZone: "Australia/Sydney",
          isTwelveHour: false,
          isNumericDate: false,
        },
      }),
    })

    await waitFor(() => {
      expect(hourIn(view.container)).not.toBe(utcHour)
    })
    // Sydney is UTC+10, or UTC+11 while daylight saving is in force.
    expect([10, 11]).toContain(
      (hourIn(view.container) - utcHour + 24) % 24,
    )
  })

  test("still renders a time when the configured timezone is unknown", async () => {
    const { view } = await mountClockView({
      timeZone: "Not/AZone",
      isTwelveHour: false,
      isNumericDate: false,
    })

    expect(timeTextIn(view.container)).toMatch(
      TWENTY_FOUR_HOUR_TIME,
    )
    expect(dateTextIn(view.container)).toMatch(LONG_DATE)
  })
})
