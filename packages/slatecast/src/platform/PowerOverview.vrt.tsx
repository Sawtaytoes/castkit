import { render, waitFor } from "@testing-library/preact"
import {
  afterAll,
  beforeAll,
  expect,
  inject,
  test,
  vi,
} from "vitest"
import { page } from "vitest/browser"
import { SCREENSHOT_EPOCH_MILLIS } from "../stories/freezeClockUnderAutomation.ts"
import { powerOverviewFixture } from "./__fixtures__/powerOverview.ts"
import { DisplayComposition } from "./PlatformApp.tsx"
import "../styles.css"
import "./platform.css"

beforeAll(() =>
  vi.useFakeTimers({
    now: SCREENSHOT_EPOCH_MILLIS,
    toFake: ["Date"],
  }),
)
afterAll(() => vi.useRealTimers())

test.each([
  false,
  true,
])("power overview compact history: %s", async (isCompactHistory) => {
  await page.viewport(2000, 668)
  document.documentElement.dataset.scheme = "dark"
  render(
    <main
      class="platform"
      data-device="true"
      data-scheme="dark"
    >
      <DisplayComposition
        snapshot={powerOverviewFixture({
          isCompactHistory,
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
    { timeout: 10000 },
  )
  await waitFor(
    () =>
      expect(
        document.querySelectorAll('[role="status"]'),
      ).toHaveLength(0),
    { timeout: 10000 },
  )
  await document.fonts.ready
  await page.screenshot({
    path: `${inject("vrtActualDir")}/platform/power-overview-${isCompactHistory ? "compact" : "full"}.png`,
    element: document.body,
  })
})
