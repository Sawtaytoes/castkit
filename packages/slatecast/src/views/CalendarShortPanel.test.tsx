import type {
  AgendaEvent,
  WeatherData,
} from "@castkit/shared/viewData/types"
import { screen } from "@testing-library/preact"
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest"
import { page } from "vitest/browser"
import {
  buildAgenda,
  buildAgendaEvent,
  buildDeviceProfile,
  buildSettings,
  buildSnapshot,
  buildWeather,
} from "../__fixtures__/buildSnapshot.ts"
import { mountSlatecast } from "../__tests__/setup/mountSlatecast.tsx"
// The sibling test files load no stylesheet: they test behavior. This one
// tests a media query, so it needs the real rules in the page.
import "../styles.css"

const SHORT_PANEL = { width: 480, height: 320 }
const SQUARE_PANEL = { width: 720, height: 720 }
const MINUTE_MILLIS = 60 * 1_000

const CHICAGO_TWELVE_HOUR = {
  timeZone: "America/Chicago",
  isTwelveHour: true,
  isNumericDate: false,
}

const EIGHT_EVENTS = [
  "First event",
  "Second event",
  "Third event",
  "Fourth event",
  "Fifth event",
  "Sixth event",
  "Seventh event",
  "Eighth event",
].map((summary, index) =>
  buildAgendaEvent({
    summary,
    startMs: Date.now() + (index + 1) * 10 * MINUTE_MILLIS,
  }),
)

const mountCalendarOn = async ({
  width,
  height,
  events = buildAgenda().events,
  weather = buildWeather({
    temperatureText: "85°",
    conditionText: "Sunny",
    condition: "sunny",
  }),
}: {
  width: number
  height: number
  events?: readonly AgendaEvent[]
  weather?: WeatherData | null
}) => {
  await page.viewport(width, height)
  await mountSlatecast({
    snapshot: buildSnapshot({
      view: "calendar",
      device: buildDeviceProfile({ width, height }),
      settings: buildSettings({
        clock: CHICAGO_TWELVE_HOUR,
      }),
      data: weather
        ? { agenda: { events }, weather }
        : { agenda: { events } },
    }),
  })
  await document.fonts.ready
}

const rectOf = (selector: string) =>
  (
    document.querySelector(selector) as HTMLElement
  ).getBoundingClientRect()

const fontSizeOf = (selector: string) =>
  Number.parseFloat(
    getComputedStyle(
      document.querySelector(selector) as Element,
    ).fontSize,
  )

describe("calendar on a short landscape panel", () => {
  beforeEach(async () => {
    await page.viewport(
      SHORT_PANEL.width,
      SHORT_PANEL.height,
    )
  })

  afterEach(async () => {
    await page.viewport(
      SQUARE_PANEL.width,
      SQUARE_PANEL.height,
    )
  })

  test("lays the header out as one row, weather beside the clock, agenda under both", async () => {
    await mountCalendarOn(SHORT_PANEL)

    const header = rectOf(".calendar-header")
    const weather = rectOf(".calendar-weather")
    const mark = rectOf(".calendar-weather .weather-mark")
    const firstRow = rectOf(".calendar-event")

    // One row: the weather block starts past the clock block and overlaps it
    // vertically.
    expect(weather.left).toBeGreaterThan(header.right - 1)
    expect(weather.top).toBeLessThan(header.bottom)
    expect(weather.bottom).toBeGreaterThan(header.top)
    // The mark leads the weather block.
    expect(mark.left).toBeLessThan(
      rectOf(".calendar-temp").left,
    )
    expect(mark.width).toBe(54)
    // The agenda starts under the header row.
    expect(firstRow.top).toBeGreaterThanOrEqual(
      header.bottom,
    )
    expect(firstRow.top).toBeGreaterThanOrEqual(
      weather.bottom,
    )

    // The time is split so the meridiem can be smaller.
    expect(
      document.querySelector(".calendar-time")?.textContent,
    ).toMatch(/^\d{1,2}:\d{2}$/)
    expect(
      document.querySelector(".calendar-meridiem")
        ?.textContent,
    ).toMatch(/^(AM|PM)$/)
    expect(fontSizeOf(".calendar-time")).toBe(44)
    expect(fontSizeOf(".calendar-meridiem")).toBe(22)
    expect(fontSizeOf(".calendar-date")).toBe(22)
    expect(fontSizeOf(".calendar-temp")).toBe(30)
    expect(fontSizeOf(".calendar-event-summary")).toBe(22)
  })

  test("shows five rows, not six", async () => {
    await mountCalendarOn({
      ...SHORT_PANEL,
      events: EIGHT_EVENTS,
    })

    expect(
      document.querySelectorAll(".calendar-event").length,
    ).toBe(5)
    expect(screen.getByText("Fifth event")).toBeVisible()
    expect(screen.queryByText("Sixth event")).toBeNull()

    // The last row is still on the glass.
    const rows = document.querySelectorAll(
      ".calendar-event",
    )
    const lastRow = (
      rows[rows.length - 1] as HTMLElement
    ).getBoundingClientRect()
    expect(lastRow.bottom).toBeLessThanOrEqual(
      rectOf(".stage").bottom,
    )
  })

  test("keeps the header row on an empty day, with no weather block until it arrives", async () => {
    await mountCalendarOn({
      ...SHORT_PANEL,
      events: [],
      weather: null,
    })

    expect(
      screen.getByText("No upcoming events"),
    ).toBeVisible()
    expect(
      document.querySelector(".calendar-weather"),
    ).toBeNull()
    expect(
      document.querySelector(".calendar-meridiem"),
    ).not.toBeNull()
  })

  test("keeps the stacked header, six rows and no mark on the square", async () => {
    await mountCalendarOn({
      ...SQUARE_PANEL,
      events: EIGHT_EVENTS,
    })

    expect(
      document.querySelectorAll(".calendar-event").length,
    ).toBe(6)
    expect(
      document.querySelector(".weather-mark"),
    ).toBeNull()
    expect(
      document.querySelector(".calendar-meridiem"),
    ).toBeNull()
    expect(
      document.querySelector(".calendar-time")?.textContent,
    ).toMatch(/^\d{1,2}:\d{2}\s(AM|PM)$/)
    // The weather line sits under the header, not beside it.
    expect(
      rectOf(".calendar-weather").top,
    ).toBeGreaterThanOrEqual(
      rectOf(".calendar-header").bottom,
    )
    // The temperature and condition still share one baseline row.
    const temperature = rectOf(".calendar-temp")
    const condition = rectOf(".calendar-condition")
    expect(condition.left).toBeGreaterThan(
      temperature.right,
    )
  })
})
