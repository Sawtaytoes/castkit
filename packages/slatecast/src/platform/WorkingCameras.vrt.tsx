import { render, waitFor } from "@testing-library/preact"
import {
  afterAll,
  beforeAll,
  inject,
  test,
  vi,
} from "vitest"
import { page } from "vitest/browser"
import { workingCameraSnapshot } from "./__fixtures__/workingCameras.ts"
import { DisplayComposition } from "./PlatformApp.tsx"
import "../styles.css"
import "./platform.css"

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(Date.UTC(2026, 9, 8, 15))
})
afterAll(() => vi.useRealTimers())

test.each([
  { width: 2024, height: 751 },
  { width: 1323, height: 789 },
  { width: 992, height: 592 },
])("working cameras at $width × $height", async ({
  width,
  height,
}) => {
  await page.viewport(width, height)
  document.documentElement.dataset.scheme = "dark"
  render(
    <main class="platform">
      <DisplayComposition
        snapshot={workingCameraSnapshot}
        isConnected
        onAction={async () => undefined}
      />
    </main>,
  )
  await document.fonts.ready
  await waitFor(() => {
    if (
      !document.querySelector(
        ".printer-card[data-orientation]",
      )
    )
      throw new Error("Layout not measured")
  })
  await new Promise((resolve) => setTimeout(resolve, 500))
  await page.screenshot({
    path: `${inject("vrtActualDir")}/platform/working-cameras-${width}x${height}.png`,
    fullPage: false,
  })
})
