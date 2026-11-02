import {
  cleanup,
  render,
  screen,
  waitFor,
} from "@testing-library/preact"
import { afterEach, expect, test, vi } from "vitest"
import { page, userEvent } from "vitest/browser"
import { powerOverviewFixture } from "./__fixtures__/powerOverview.ts"
import { DisplayPropertiesContext } from "./displayProperties.ts"
import { EntitiesView } from "./EntitiesView.tsx"
import { formatSensorValue } from "./formatSensorValue.ts"
import { DisplayComposition } from "./PlatformApp.tsx"
import "../styles.css"
import "./platform.css"

afterEach(cleanup)

const sensor = (
  state: string,
  unit: string,
  deviceClass = "duration",
) => ({
  id: "sensor.runtime",
  name: "Runtime",
  state,
  domain: "sensor",
  attributes: {
    unit_of_measurement: unit,
    device_class: deviceClass,
  },
  actions: [],
})

test.each([
  ["unavailable", "min", "duration", "Unavailable"],
  ["unknown", "s", "duration", "Unknown"],
  ["11425", "s", "duration", "3h 10m"],
  ["190.416666666667", "min", "duration", "3h 10m"],
  ["63.75", "min", "duration", "1h 4m"],
  ["6.66666666667", "min", "duration", "7 min"],
  ["0", "s", "duration", "0 min"],
  ["20", "s", "duration", "<1 min"],
  ["480.0", "W", "power", "480 W"],
  ["0", "W", "power", "0 W"],
  ["0.123456", "W", "power", "0.12 W"],
  ["0.00123456", "W", "power", "0.00123 W"],
  ["1.1", "h", "duration", "1h 6m"],
  ["-1", "min", "duration", "-1 min"],
  ["ready", "", "", "ready"],
])("formats sensor %s %s", (state, unit, deviceClass, expected) => {
  expect(
    formatSensorValue(sensor(state, unit, deviceClass)),
  ).toBe(expected)
})

test("all five groups and thirty-three values fit the compact desktop overview", async () => {
  await page.viewport(2000, 668)
  document.documentElement.dataset.scheme = "dark"
  render(
    <main class="platform" data-device="true">
      <DisplayComposition
        snapshot={powerOverviewFixture({
          isCompactHistory: true,
        })}
        isConnected
        onAction={async () => undefined}
      />
    </main>,
  )
  await waitFor(
    () =>
      expect(
        document.querySelectorAll(".platform-entity"),
      ).toHaveLength(33),
    { timeout: 5000 },
  )
  await waitFor(
    () =>
      expect(
        document.querySelectorAll(
          ".home-chart-preview svg",
        ),
      ).toHaveLength(29),
    { timeout: 5000 },
  )
  await document.fonts.ready
  const viewport = document.querySelector(
    ".platform-layout",
  )
  if (!viewport)
    throw new Error("The composition must have a viewport")
  expect(viewport.scrollHeight).toBeLessThanOrEqual(
    viewport.clientHeight + 1,
  )
  const bounds = viewport.getBoundingClientRect()
  document
    .querySelectorAll(".platform-entity-value")
    .forEach((value) => {
      const rect = value.getBoundingClientRect()
      expect(rect.bottom).toBeLessThanOrEqual(
        bounds.bottom + 1,
      )
      const range = document.createRange()
      range.selectNodeContents(value)
      expect(
        range.getBoundingClientRect().bottom,
      ).toBeLessThanOrEqual(rect.bottom + 1)
      const chart = value.parentElement?.querySelector(
        ".home-chart-preview",
      )
      if (chart)
        expect(
          chart.getBoundingClientRect().top,
        ).toBeGreaterThanOrEqual(rect.bottom)
    })
  expect(screen.queryByText("Unavailable min")).toBeNull()
  expect(
    document.querySelectorAll(
      ".home-chart-preview svg text",
    ),
  ).toHaveLength(0)
})

test("narrow overviews scroll vertically without losing values or horizontal fit", async () => {
  await page.viewport(390, 844)
  render(
    <main class="platform" data-device="true">
      <DisplayComposition
        snapshot={powerOverviewFixture({
          isCompactHistory: true,
        })}
        isConnected
        onAction={async () => undefined}
      />
    </main>,
  )
  await waitFor(
    () =>
      expect(
        document.querySelectorAll(
          ".home-chart-preview svg",
        ),
      ).toHaveLength(29),
    { timeout: 5000 },
  )
  await document.fonts.ready
  const viewport = document.querySelector(
    ".platform-layout",
  )
  if (!viewport) throw new Error("Missing overview")
  expect(viewport.scrollWidth).toBeLessThanOrEqual(
    viewport.clientWidth + 1,
  )
  document
    .querySelectorAll(".platform-entity-value")
    .forEach((value) => {
      expect(value.scrollWidth).toBeLessThanOrEqual(
        value.clientWidth + 1,
      )
    })
})

const historySensor = () => {
  const entity = sensor("11425", "s")
  return {
    ...entity,
    attributes: {
      ...entity.attributes,
      history: [
        { time: 0, value: 100 },
        { time: 1000, value: 200 },
      ],
    },
  }
}

test("keyboard history exploration keeps the visible trend and cannot send a source action", async () => {
  const onAction = vi.fn(async () => undefined)
  render(
    <main class="platform">
      <EntitiesView
        data={{ entities: [historySensor()] }}
        mode="charts"
        now={1000}
        settings={{
          presentation: "home",
          isCompactHistory: true,
        }}
        isControlEnabled={false}
        onAction={onAction}
      />
    </main>,
  )
  await waitFor(
    () =>
      expect(
        screen.getByLabelText("Explore Runtime history"),
      ).toBeVisible(),
    { timeout: 5000 },
  )
  const user = userEvent.setup()
  await user.tab()
  const summary = screen.getByLabelText(
    "Explore Runtime history",
  )
  expect(document.activeElement === summary).toBe(true)
  await user.keyboard("{Enter}")
  await waitFor(() =>
    expect(summary.closest("details")?.open).toBe(true),
  )
  expect(
    document.querySelector(".home-chart-preview svg"),
  ).toBeVisible()
  expect(screen.getByText("3h 10m")).toBeVisible()
  await user.keyboard("{Enter}")
  await waitFor(() =>
    expect(summary.closest("details")?.open).toBe(false),
  )
  expect(onAction).not.toHaveBeenCalled()
})

test("displays without touch retain compact trends and omit the history control", async () => {
  render(
    <DisplayPropertiesContext.Provider
      value={{
        delivery: "image",
        repaint: "slow",
        hasTouch: false,
      }}
    >
      <EntitiesView
        data={{ entities: [historySensor()] }}
        mode="charts"
        now={1000}
        settings={{
          presentation: "home",
          isCompactHistory: true,
        }}
        isControlEnabled={false}
        onAction={async () => undefined}
      />
    </DisplayPropertiesContext.Provider>,
  )
  await waitFor(
    () =>
      expect(
        document.querySelector(".home-chart-preview svg"),
      ).toBeVisible(),
    { timeout: 5000 },
  )
  expect(
    screen.queryByLabelText("Explore Runtime history"),
  ).toBeNull()
})
