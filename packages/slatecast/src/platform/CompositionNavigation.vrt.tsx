import {
  render,
  screen,
  waitFor,
} from "@testing-library/preact"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, inject, test, vi } from "vitest"
import { page } from "vitest/browser"
import { SCREENSHOT_EPOCH_MILLIS } from "../stories/freezeClockUnderAutomation.ts"
import { pointsOverviewFixture } from "./__fixtures__/pointsOverview.ts"
import { DisplayComposition } from "./PlatformApp.tsx"
import "../styles.css"
import "./platform.css"

afterEach(() => vi.useRealTimers())
test.each([
  { width: 1024, height: 600 },
  { width: 1024, height: 547 },
  { width: 480, height: 480 },
  { width: 384, height: 824 },
])("priority navigation at $width × $height", async ({
  width,
  height,
}) => {
  vi.useFakeTimers({
    now: SCREENSHOT_EPOCH_MILLIS,
    toFake: ["Date"],
  })
  await page.viewport(width, height)
  document.documentElement.dataset.scheme = "dark"
  render(
    <main class="platform" data-device="true">
      <DisplayComposition
        snapshot={pointsOverviewFixture()}
        isConnected
        onAction={async () => undefined}
      />
    </main>,
  )
  await document.fonts.ready
  await userEvent.click(
    screen.getByRole("button", {
      name: "View Robin's tasks today",
    }),
  )
  await waitFor(() =>
    expect(
      document.querySelector("[data-navigation-focus]"),
    ).not.toBeNull(),
  )
  await new Promise((resolve) => setTimeout(resolve, 500))
  await page.screenshot({
    element: document.body,
    path: `${inject("vrtActualDir")}/platform/priority-detail-${width}x${height}.png`,
  })
})
