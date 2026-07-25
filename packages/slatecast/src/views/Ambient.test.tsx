import type { ViewDataState } from "@castkit/shared/protocol/ws"
import { screen, waitFor } from "@testing-library/preact"
import { describe, expect, test } from "vitest"
import {
  buildSnapshot,
  buildWeather,
} from "../__fixtures__/buildSnapshot.ts"
import { mountSlatecast } from "../__tests__/setup/mountSlatecast.tsx"

/**
 * The clock runs off the live 1 Hz tick, so its text can't be asserted
 * exactly — these match the shape the default config produces (12-hour time,
 * long date) instead.
 */
const TWELVE_HOUR_TIME = /^\d{1,2}:\d{2}\s(AM|PM)$/
const LONG_DATE = /^\w+day, \w+ \d{1,2}$/

const mountAmbientView = async (data: ViewDataState = {}) =>
  mountSlatecast({
    snapshot: buildSnapshot({ view: "ambient", data }),
  })

describe("ambient clock", () => {
  test("renders the time over today's date", async () => {
    const { view } = await mountAmbientView()

    expect(screen.getByText(TWELVE_HOUR_TIME)).toBeVisible()
    expect(screen.getByText(LONG_DATE)).toBeVisible()
    expect(
      view.container.querySelector(".ambient-time")
        ?.textContent,
    ).toMatch(TWELVE_HOUR_TIME)
  })
})

describe("ambient weather", () => {
  test("shows the temperature and condition when weather data exists", async () => {
    await mountAmbientView({
      weather: buildWeather({
        temperatureText: "79°",
        conditionText: "Partly cloudy",
      }),
    })

    expect(screen.getByText("79°")).toBeVisible()
    expect(screen.getByText("Partly cloudy")).toBeVisible()
  })

  test("omits the weather line entirely until Home Assistant pushes weather", async () => {
    const { view } = await mountAmbientView()

    expect(
      view.container.querySelector(".ambient-weather"),
    ).toBeNull()
    expect(screen.getByText(LONG_DATE)).toBeVisible()
  })

  test("adds the weather line when a weather frame arrives", async () => {
    const { server, view } = await mountAmbientView()

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
      view.container.querySelector(".ambient-weather"),
    ).not.toBeNull()
  })
})
