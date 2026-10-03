import { render, waitFor } from "@testing-library/preact"
import {
  afterAll,
  beforeAll,
  inject,
  test,
  vi,
} from "vitest"
import { page } from "vitest/browser"
import { prioritySnapshot } from "./__fixtures__/priorityComposition.ts"
import { DisplayComposition } from "./PlatformApp.tsx"
import "../styles.css"
import "./platform.css"

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(Date.UTC(2026, 9, 3, 15))
})
afterAll(() => vi.useRealTimers())

test.each([
  1.5, 2.5,
])("printer and usage at %s scale", async (scale) => {
  await page.viewport(1024, 600)
  document.documentElement.dataset.scheme = "dark"
  render(
    <main
      class="platform"
      style={{
        zoom: scale,
        width: `${1024 / scale}px`,
        height: `${600 / scale}px`,
        padding: "6px",
      }}
    >
      <DisplayComposition
        snapshot={prioritySnapshot}
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
    path: `${inject("vrtActualDir")}/platform/print-usage-priority-${scale}.png`,
    fullPage: false,
  })
})
