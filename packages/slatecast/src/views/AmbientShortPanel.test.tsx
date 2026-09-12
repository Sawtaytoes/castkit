import type { WeatherData } from "@castkit/shared/viewData/types"
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
  buildDeviceProfile,
  buildSettings,
  buildSnapshot,
  buildWeather,
} from "../__fixtures__/buildSnapshot.ts"
import { mountSlatecast } from "../__tests__/setup/mountSlatecast.tsx"
// The sibling Ambient test loads no stylesheet: it tests behaviour. This one
// tests a media query, so it needs the real rules in the page.
import "../styles.css"

const SHORT_PANEL = { width: 480, height: 320 }
const SQUARE_PANEL = { width: 720, height: 720 }

const CHICAGO_TWELVE_HOUR = {
  timeZone: "America/Chicago",
  isTwelveHour: true,
  isNumericDate: false,
}

const mountAmbientOn = async ({
  width,
  height,
  weather,
}: {
  width: number
  height: number
  weather?: WeatherData
}) => {
  await page.viewport(width, height)
  await mountSlatecast({
    snapshot: buildSnapshot({
      view: "ambient",
      device: buildDeviceProfile({ width, height }),
      settings: buildSettings({
        clock: CHICAGO_TWELVE_HOUR,
      }),
      data: weather ? { weather } : {},
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

describe("ambient on a short landscape panel", () => {
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

  test("puts the weather beside the clock, under the condition's mark", async () => {
    await mountAmbientOn({
      ...SHORT_PANEL,
      weather: buildWeather({
        temperatureText: "79°",
        conditionText: "Sunny",
        condition: "sunny",
      }),
    })

    const time = rectOf(".ambient-time")
    const mark = rectOf(".ambient-weather .weather-mark")
    const temperature = rectOf(".ambient-temp")

    // Beside: the whole weather column starts past the time.
    expect(mark.left).toBeGreaterThan(time.right)
    expect(temperature.left).toBeGreaterThan(time.right)
    // The mark sits over the temperature.
    expect(mark.bottom).toBeLessThanOrEqual(
      temperature.top + 1,
    )
    expect(mark.width).toBe(110)
    expect(
      document
        .querySelector(".ambient-weather .weather-mark")
        ?.getAttribute("data-condition"),
    ).toBe("sunny")

    // The date sits under the time, not beside it, on two lines: the weekday
    // over the month and day, as on the Weather view.
    const dateLines = Array.from(
      document.querySelectorAll(".ambient-date"),
    ).map((line) => line.textContent)
    expect(dateLines).toHaveLength(2)
    expect(dateLines[0]).toMatch(/^\w+day$/)
    expect(dateLines[1]).toMatch(/^\w+ \d{1,2}$/)

    const date = rectOf(".ambient-date-weekday")
    expect(date.top).toBeGreaterThanOrEqual(time.bottom - 1)
    expect(date.left).toBeLessThan(mark.left)

    expect(fontSizeOf(".ambient-time")).toBe(110)
    expect(fontSizeOf(".ambient-meridiem")).toBe(40)
    expect(fontSizeOf(".ambient-date-weekday")).toBe(34)
    expect(fontSizeOf(".ambient-temp")).toBe(56)
    expect(fontSizeOf(".ambient-condition")).toBe(30)

    // Nothing leaves the glass in either direction.
    const stage = rectOf(".stage")
    expect(
      rectOf(".ambient-weather").right,
    ).toBeLessThanOrEqual(stage.right)
    expect(
      rectOf(".ambient-clock").bottom,
    ).toBeLessThanOrEqual(stage.bottom)
  })

  test("keeps the date on one line under the numeric-date setting", async () => {
    await page.viewport(
      SHORT_PANEL.width,
      SHORT_PANEL.height,
    )
    await mountSlatecast({
      snapshot: buildSnapshot({
        view: "ambient",
        device: buildDeviceProfile(SHORT_PANEL),
        settings: buildSettings({
          clock: {
            ...CHICAGO_TWELVE_HOUR,
            isNumericDate: true,
          },
        }),
        data: { weather: buildWeather() },
      }),
    })
    await document.fonts.ready

    const dateLines =
      document.querySelectorAll(".ambient-date")
    expect(dateLines).toHaveLength(1)
    expect(dateLines[0]?.textContent).toMatch(
      /^\d{1,2}\/\d{1,2}\/\d{4}$/,
    )
    // The single line takes the weekday size, not the smaller one.
    expect(fontSizeOf(".ambient-date")).toBe(34)
  })

  test("splits the meridiem out of the time", async () => {
    await mountAmbientOn(SHORT_PANEL)

    expect(
      document.querySelector(".ambient-time")?.textContent,
    ).toMatch(/^\d{1,2}:\d{2}$/)
    expect(
      document.querySelector(".ambient-meridiem")
        ?.textContent,
    ).toMatch(/^(AM|PM)$/)
  })

  test("draws no mark when the condition code is unknown", async () => {
    await mountAmbientOn({
      ...SHORT_PANEL,
      // The parser leaves `condition` unset for a code it does not know.
      weather: buildWeather({
        temperatureText: "60°",
        conditionText: "haboob",
        condition: undefined,
      }),
    })

    expect(
      document.querySelector(".weather-mark"),
    ).toBeNull()
    expect(screen.getByText("haboob")).toBeVisible()
  })

  test("keeps the clock on the glass before weather arrives", async () => {
    await mountAmbientOn(SHORT_PANEL)

    expect(
      document.querySelector(".ambient-weather"),
    ).toBeNull()
    expect(fontSizeOf(".ambient-time")).toBe(110)
    const stage = rectOf(".stage")
    expect(rectOf(".ambient-time").right).toBeLessThan(
      stage.right,
    )
  })

  test("keeps the stacked column, with no mark, on the square", async () => {
    await mountAmbientOn({
      ...SQUARE_PANEL,
      weather: buildWeather({ condition: "sunny" }),
    })

    expect(
      document.querySelector(".ambient-short"),
    ).toBeNull()
    expect(
      document.querySelector(".ambient-meridiem"),
    ).toBeNull()
    expect(
      document.querySelector(".weather-mark"),
    ).toBeNull()
    expect(
      document.querySelector(".ambient-time")?.textContent,
    ).toMatch(/^\d{1,2}:\d{2}\s(AM|PM)$/)
    expect(fontSizeOf(".ambient-time")).toBe(
      0.17 * SQUARE_PANEL.height,
    )
  })
})
