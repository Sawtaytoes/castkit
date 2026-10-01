import { render } from "@testing-library/preact"
import {
  afterAll,
  afterEach,
  beforeAll,
  expect,
  inject,
  test,
  vi,
} from "vitest"
import { page } from "vitest/browser"
import { SCREENSHOT_EPOCH_MILLIS } from "../stories/freezeClockUnderAutomation.ts"
import { kidsPointsFixture } from "./fixtures.ts"
import { DisplayComposition } from "./PlatformApp.tsx"
import type { DisplaySnapshot } from "./protocol.ts"
import "../styles.css"
import "./platform.css"

/**
 * Visual-regression shots of Tally Marks at the sizes where it changes shape.
 *
 * The view picks a board or rows from its own box, and Storybook stages only
 * the canvas it is given, so the small panel's single-child result and its
 * rows are shot here. Run by `yarn vrt:capture` only. The clock is fixed and
 * the fixture's times are relative to it, so a shot changes only when the
 * rendering does. The file names are the baseline keys.
 */

const shotPath = (name: string) =>
  `${inject("vrtActualDir")}/platform/${name}.png`

const renderDevicePage = (snapshot: DisplaySnapshot) => {
  document.documentElement.dataset.scheme =
    snapshot.view.theme
  return render(
    <main
      class="platform"
      data-device="true"
      data-scheme={snapshot.view.theme}
    >
      <DisplayComposition
        snapshot={snapshot}
        isConnected
        onAction={async () => undefined}
      />
    </main>,
  )
}

const capture = async (name: string) => {
  await document.fonts.ready
  await new Promise((onFrame) =>
    requestAnimationFrame(() => onFrame(undefined)),
  )
  await page.screenshot({
    path: shotPath(name),
    element: document.body,
  })
}

beforeAll(() => {
  vi.useFakeTimers({
    now: SCREENSHOT_EPOCH_MILLIS,
    toFake: ["Date"],
  })
})

afterAll(() => {
  vi.useRealTimers()
})

afterEach(() => page.viewport(414, 896))

test("a scan on a small square panel is that child alone", async () => {
  await page.viewport(480, 480)
  renderDevicePage(kidsPointsFixture({ hasScan: true }))
  expect(
    document.querySelector(".kids-points-focus"),
  ).not.toBeNull()
  await capture("kids-points-scan-480x480")
})

test("a short panel with no scan lists the children as rows", async () => {
  await page.viewport(480, 320)
  renderDevicePage(kidsPointsFixture({ hasScan: false }))
  expect(
    document.querySelector(".kids-points-rows"),
  ).not.toBeNull()
  await capture("kids-points-rows-480x320")
})

test("a scan on a wide panel marks that child on the board", async () => {
  await page.viewport(1280, 720)
  renderDevicePage(kidsPointsFixture({ hasScan: true }))
  expect(
    document.querySelector(
      '.kids-points-card[data-scanned="true"]',
    ),
  ).not.toBeNull()
  await capture("kids-points-scan-1280x720")
})
