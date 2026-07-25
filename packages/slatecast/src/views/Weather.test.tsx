import type { ViewDataState } from "@castkit/shared/protocol/ws"
import { screen, waitFor } from "@testing-library/preact"
import { describe, expect, test } from "vitest"
import {
  buildSnapshot,
  buildWeather,
} from "../__fixtures__/buildSnapshot.ts"
import { mountSlatecast } from "../__tests__/setup/mountSlatecast.tsx"

/** The clock beneath the weather runs off the live tick — shape only. */
const TWELVE_HOUR_TIME = /^\d{1,2}:\d{2}\s(AM|PM)$/
const LONG_DATE = /^\w+day, \w+ \d{1,2}$/

const mountWeatherView = async (data: ViewDataState = {}) =>
  mountSlatecast({
    snapshot: buildSnapshot({ view: "weather", data }),
  })

describe("weather rendering", () => {
  test("leads with the temperature and condition", async () => {
    const { view } = await mountWeatherView({
      weather: buildWeather({
        temperatureText: "79°",
        conditionText: "Partly cloudy",
      }),
    })

    expect(screen.getByText("79°")).toBeVisible()
    expect(screen.getByText("Partly cloudy")).toBeVisible()
    expect(
      view.container.querySelector(".weather-temp")
        ?.textContent,
    ).toBe("79°")
    expect(
      view.container.querySelector(".weather-condition")
        ?.textContent,
    ).toBe("Partly cloudy")
  })

  test("keeps a smaller clock and date beneath the weather", async () => {
    const { view } = await mountWeatherView({
      weather: buildWeather(),
    })

    expect(
      view.container.querySelector(".weather-time")
        ?.textContent,
    ).toMatch(TWELVE_HOUR_TIME)
    expect(
      view.container.querySelector(".weather-date")
        ?.textContent,
    ).toMatch(LONG_DATE)
  })
})

describe("weather fallback", () => {
  test("shows the unavailable message before Home Assistant pushes weather", async () => {
    const { view } = await mountWeatherView()

    expect(
      screen.getByText("Weather unavailable"),
    ).toBeVisible()
    expect(
      view.container.querySelector(".weather-main"),
    ).toBeNull()
    // The clock must keep running even with no weather to show.
    expect(
      view.container.querySelector(".weather-time")
        ?.textContent,
    ).toMatch(TWELVE_HOUR_TIME)
  })

  test("replaces the unavailable message when a weather frame arrives", async () => {
    const { server } = await mountWeatherView()
    expect(
      screen.getByText("Weather unavailable"),
    ).toBeVisible()

    server.push({
      type: "weather",
      data: buildWeather({
        temperatureText: "41°",
        conditionText: "Snowy",
      }),
    })

    await waitFor(() => {
      expect(screen.getByText("41°")).toBeVisible()
    })
    expect(screen.getByText("Snowy")).toBeVisible()
    expect(
      screen.queryByText("Weather unavailable"),
    ).toBeNull()
  })
})
