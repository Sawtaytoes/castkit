import type { WeatherData } from "@castkit/shared/viewData/types"
import { render } from "@testing-library/preact"
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
import { AmbientFace } from "./Ambient.tsx"
// The sibling Ambient test loads no stylesheet: it tests behavior. This one
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

  test("stacks the time, the date and the weather in one centered column", async () => {
    await mountAmbientOn({
      ...SHORT_PANEL,
      weather: buildWeather({
        temperatureText: "72°",
        conditionText: "Partly cloudy",
        condition: "partlycloudy",
      }),
    })

    const time = rectOf(".ambient-time")
    const date = rectOf(".ambient-date")
    const weatherRow = rectOf(".ambient-weather")
    const stage = rectOf(".stage")
    const stageCenter = stage.left + stage.width / 2

    // One column, top to bottom.
    expect(date.top).toBeGreaterThanOrEqual(time.bottom - 1)
    expect(weatherRow.top).toBeGreaterThanOrEqual(
      date.bottom - 1,
    )
    // Each row is centered on the glass.
    ;[time, date, weatherRow].forEach((row) => {
      expect(
        Math.abs(row.left + row.width / 2 - stageCenter),
      ).toBeLessThanOrEqual(1)
    })

    // The time keeps its meridiem on the same line, and the date is one line.
    expect(
      document.querySelector(".ambient-time")?.textContent,
    ).toMatch(/^\d{1,2}:\d{2}\s(AM|PM)$/)
    expect(
      document.querySelectorAll(".ambient-date"),
    ).toHaveLength(1)
    // No mark: the column carries the words alone.
    expect(
      document.querySelector(".weather-mark"),
    ).toBeNull()

    expect(fontSizeOf(".ambient-time")).toBe(104)
    expect(fontSizeOf(".ambient-date")).toBe(30)
    expect(fontSizeOf(".ambient-temp")).toBe(49)
    expect(fontSizeOf(".ambient-condition")).toBe(30)

    expect(weatherRow.bottom).toBeLessThanOrEqual(
      stage.bottom,
    )
    expect(time.top).toBeGreaterThanOrEqual(stage.top)
  })

  test("keeps the widest date on the glass", async () => {
    // Wednesday, September 30, 2026, 12:45 PM in Chicago: the longest
    // weekday, the longest month and the widest time the view can draw. The
    // face is drawn directly so the app's 1 Hz tick cannot move the time.
    render(
      <div class="stage">
        <AmbientFace
          currentMillis={Date.parse("2026-09-30T17:45:00Z")}
          clock={CHICAGO_TWELVE_HOUR}
          weather={buildWeather({
            temperatureText: "-12°",
            conditionText: "Thunderstorms",
          })}
        />
      </div>,
    )
    await document.fonts.ready

    expect(
      document.querySelector(".ambient-date")?.textContent,
    ).toBe("Wednesday, September 30")
    expect(
      document.querySelector(".ambient-time")?.textContent,
    ).toBe("12:45 PM")
    ;[
      ".ambient-time",
      ".ambient-date",
      ".ambient-weather",
    ].forEach((selector) => {
      const row = rectOf(selector)
      expect(row.left).toBeGreaterThanOrEqual(0)
      expect(row.right).toBeLessThanOrEqual(
        SHORT_PANEL.width,
      )
    })
  })

  test("keeps the clock on the glass before weather arrives", async () => {
    await mountAmbientOn(SHORT_PANEL)

    expect(
      document.querySelector(".ambient-weather"),
    ).toBeNull()
    expect(fontSizeOf(".ambient-time")).toBe(104)
    const stage = rectOf(".stage")
    expect(rectOf(".ambient-time").right).toBeLessThan(
      stage.right,
    )
  })

  test("keeps the vmin column on the square", async () => {
    await mountAmbientOn({
      ...SQUARE_PANEL,
      weather: buildWeather({ condition: "sunny" }),
    })

    expect(
      document.querySelector(".ambient-short"),
    ).toBeNull()
    expect(
      document.querySelector(".ambient-time")?.textContent,
    ).toMatch(/^\d{1,2}:\d{2}\s(AM|PM)$/)
    expect(fontSizeOf(".ambient-time")).toBe(
      0.17 * SQUARE_PANEL.height,
    )
  })
})
