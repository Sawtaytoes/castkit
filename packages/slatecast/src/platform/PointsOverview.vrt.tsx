import { render } from "@testing-library/preact"
import { afterEach, inject, test, vi } from "vitest"
import { page } from "vitest/browser"
import { SCREENSHOT_EPOCH_MILLIS } from "../stories/freezeClockUnderAutomation.ts"
import { pointsOverviewFixture } from "./__fixtures__/pointsOverview.ts"
import { DisplayComposition } from "./PlatformApp.tsx"
import "../styles.css"
import "./platform.css"

afterEach(() => vi.useRealTimers())

test.each([
  ["idle", false, false, false],
  ["piano", false, true, false],
  ["printing", true, false, false],
  ["printing-piano", true, true, false],
  ["ripping-piano", true, true, true],
] as const)("desk overview: %s", async (name, isBusy, isRunning, isRipOnly) => {
  vi.useFakeTimers({
    now: SCREENSHOT_EPOCH_MILLIS,
    toFake: ["Date"],
  })
  await page.viewport(1024, 600)
  document.documentElement.dataset.scheme = "dark"
  render(
    <main class="platform" data-device="true">
      <DisplayComposition
        snapshot={pointsOverviewFixture({
          isBusy,
          isRunning,
          isRipOnly,
        })}
        isConnected
        onAction={async () => undefined}
      />
    </main>,
  )
  await document.fonts.ready
  await new Promise((resolve) => setTimeout(resolve, 500))
  await page.screenshot({
    element: document.body,
    path: `${inject("vrtActualDir")}/platform/points-overview-${name}.png`,
  })
})

test("desk overview: printing, child opened", async () => {
  vi.useFakeTimers({
    now: SCREENSHOT_EPOCH_MILLIS,
    toFake: ["Date"],
  })
  await page.viewport(1024, 600)
  document.documentElement.dataset.scheme = "dark"
  const { container } = render(
    <main class="platform" data-device="true">
      <DisplayComposition
        snapshot={pointsOverviewFixture({ isBusy: true })}
        isConnected
        onAction={async () => undefined}
      />
    </main>,
  )
  await document.fonts.ready
  await new Promise((resolve) => setTimeout(resolve, 500))
  container
    .querySelector<HTMLButtonElement>(
      '[aria-label="View Robin\'s tasks today"]',
    )
    ?.click()
  await new Promise((resolve) => setTimeout(resolve, 500))
  await page.screenshot({
    element: document.body,
    path: `${inject("vrtActualDir")}/platform/points-overview-printing-child-open.png`,
  })
})

test.each([
  false,
  true,
])("desk overview: compact music, busy %s", async (isBusy) => {
  vi.useFakeTimers({
    now: SCREENSHOT_EPOCH_MILLIS,
    toFake: ["Date"],
  })
  await page.viewport(1024, 600)
  document.documentElement.dataset.scheme = "dark"
  render(
    <main class="platform" data-device="true">
      <DisplayComposition
        snapshot={pointsOverviewFixture({
          isBusy,
          hasMusic: true,
        })}
        isConnected
        onAction={async () => undefined}
      />
    </main>,
  )
  await document.fonts.ready
  await new Promise((resolve) => setTimeout(resolve, 500))
  await page.screenshot({
    element: document.body,
    path: `${inject("vrtActualDir")}/platform/points-overview-music-${isBusy ? "busy" : "idle"}.png`,
  })
})

test("desk overview: complete queue rows use spare height", async () => {
  vi.useFakeTimers({
    now: SCREENSHOT_EPOCH_MILLIS,
    toFake: ["Date"],
  })
  await page.viewport(720, 900)
  document.documentElement.dataset.scheme = "dark"
  render(
    <main class="platform" data-device="true">
      <DisplayComposition
        snapshot={pointsOverviewFixture({ hasMusic: true })}
        isConnected
        onAction={async () => undefined}
      />
    </main>,
  )
  await document.fonts.ready
  await new Promise((resolve) => setTimeout(resolve, 500))
  await page.screenshot({
    element: document.body,
    path: `${inject("vrtActualDir")}/platform/points-overview-music-spare-queue.png`,
  })
})
