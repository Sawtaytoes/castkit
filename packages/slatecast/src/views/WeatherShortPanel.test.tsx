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
// The sibling test files load no stylesheet: they test behaviour. This one
// tests a media query, so it needs the real rules in the page.
import "../styles.css"

const SHORT_PANEL = { width: 480, height: 320 }
const SQUARE_PANEL = { width: 720, height: 720 }

const CHICAGO_TWELVE_HOUR = {
  timeZone: "America/Chicago",
  isTwelveHour: true,
  isNumericDate: false,
}

const mountWeatherOn = async ({
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
      view: "weather",
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

describe("weather on a short landscape panel", () => {
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

  test("puts the clock beside the weather, under the condition's mark", async () => {
    await mountWeatherOn({
      ...SHORT_PANEL,
      weather: buildWeather({
        temperatureText: "85°",
        conditionText: "Sunny",
        condition: "sunny",
      }),
    })

    const temperature = rectOf(".weather-temp")
    const mark = rectOf(".weather-mark")
    const time = rectOf(".weather-side .weather-time")

    // Beside: the whole right column starts past the temperature.
    expect(mark.left).toBeGreaterThan(temperature.right)
    expect(time.left).toBeGreaterThan(temperature.right)
    // The mark sits over the time.
    expect(mark.bottom).toBeLessThanOrEqual(time.top + 1)
    expect(mark.width).toBe(96)
    expect(
      document
        .querySelector(".weather-mark")
        ?.getAttribute("data-condition"),
    ).toBe("sunny")

    expect(fontSizeOf(".weather-temp")).toBe(148)
    expect(fontSizeOf(".weather-condition")).toBe(36)
    expect(fontSizeOf(".weather-side .weather-time")).toBe(
      48,
    )

    // The date is two lines: the weekday over the month and day.
    const dateLines = Array.from(
      document.querySelectorAll(
        ".weather-side .weather-date",
      ),
    ).map((line) => line.textContent)
    expect(dateLines).toHaveLength(2)
    expect(dateLines[0]).toMatch(/^\w+day$/)
    expect(dateLines[1]).toMatch(/^\w+ \d{1,2}$/)
    expect(fontSizeOf(".weather-date-weekday")).toBe(30)

    const stage = rectOf(".stage")
    expect(
      rectOf(".weather-side").right,
    ).toBeLessThanOrEqual(stage.right)
  })

  test("steps a four-character temperature and a long condition down a size", async () => {
    await mountWeatherOn({
      ...SHORT_PANEL,
      weather: buildWeather({
        temperatureText: "-12°",
        conditionText: "Thunderstorms",
        condition: "lightning-rainy",
      }),
    })

    expect(fontSizeOf(".weather-temp")).toBe(112)
    expect(fontSizeOf(".weather-condition")).toBe(28)
    // Stepped down, it stays clear of the right column.
    expect(rectOf(".weather-main").right).toBeLessThan(
      rectOf(".weather-side").left,
    )
  })

  test("draws no mark when the condition code is unknown", async () => {
    await mountWeatherOn({
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

  test("keeps the clock beside the placeholder before weather arrives", async () => {
    await mountWeatherOn(SHORT_PANEL)
    expect(
      document.querySelector(".weather-mark"),
    ).toBeNull()
    expect(
      screen.getByText("Weather unavailable"),
    ).toBeVisible()
    // The clock still runs beside it.
    expect(
      document.querySelector(".weather-side .weather-time")
        ?.textContent,
    ).toMatch(/^\d{1,2}:\d{2}\s(AM|PM)$/)
  })

  test("keeps the stacked column, with no mark, on the square", async () => {
    await mountWeatherOn({
      ...SQUARE_PANEL,
      weather: buildWeather({ condition: "sunny" }),
    })

    expect(
      document.querySelector(".weather-side"),
    ).toBeNull()
    expect(
      document.querySelector(".weather-mark"),
    ).toBeNull()
    expect(
      document.querySelector(".weather-date")?.textContent,
    ).toMatch(/^\w+day, \w+ \d{1,2}$/)
    expect(fontSizeOf(".weather-temp")).toBe(
      0.22 * SQUARE_PANEL.height,
    )
  })
})
