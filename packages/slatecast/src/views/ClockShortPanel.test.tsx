import { screen } from "@testing-library/preact"
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
} from "../__fixtures__/buildSnapshot.ts"
import { mountSlatecast } from "../__tests__/setup/mountSlatecast.tsx"
// The sibling test files load no stylesheet: they test behavior. This one
// tests a media query, so it needs the real rules in the page.
import "../styles.css"

const SHORT_PANEL = { width: 480, height: 320 }
const SQUARE_PANEL = { width: 720, height: 720 }

const CHICAGO_TWELVE_HOUR = {
  timeZone: "America/Chicago",
  isTwelveHour: true,
  isNumericDate: false,
}

const mountClockOn = async ({
  width,
  height,
  clock = CHICAGO_TWELVE_HOUR,
}: {
  width: number
  height: number
  clock?: typeof CHICAGO_TWELVE_HOUR
}) => {
  await page.viewport(width, height)
  await mountSlatecast({
    snapshot: buildSnapshot({
      view: "clock",
      device: buildDeviceProfile({ width, height }),
      settings: buildSettings({ clock }),
      data: {},
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

describe("clock on a short landscape panel", () => {
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

  test("draws a date tile beside the time, with the meridiem under the last digit", async () => {
    await mountClockOn(SHORT_PANEL)

    const tile = rectOf(".date-tile")
    const hours = rectOf(".clock-short-hours")
    const meridiem = rectOf(".clock-short-meridiem")

    // Beside, not stacked: the time starts to the right of the tile.
    expect(hours.left).toBeGreaterThan(tile.right)
    expect(tile.width).toBe(144)
    expect(tile.height).toBe(196)

    // The meridiem sits under the time and shares its right edge.
    expect(meridiem.top).toBeGreaterThanOrEqual(
      hours.bottom,
    )
    expect(
      Math.abs(meridiem.right - hours.right),
    ).toBeLessThanOrEqual(1)

    expect(fontSizeOf(".clock-short-hours")).toBe(110)
    expect(fontSizeOf(".clock-short-meridiem")).toBe(40)
    expect(fontSizeOf(".date-tile-day")).toBe(90)

    // Everything stays on the glass.
    const stage = rectOf(".stage")
    expect(hours.right).toBeLessThanOrEqual(stage.right)
    expect(tile.left).toBeGreaterThanOrEqual(stage.left)
  })

  test("spells the tile as a three-letter weekday, the day, and a three-letter month", async () => {
    await mountClockOn(SHORT_PANEL)

    expect(
      document.querySelector(".date-tile-weekday")
        ?.textContent,
    ).toMatch(/^[A-Z]{3}$/)
    expect(
      document.querySelector(".date-tile-day")?.textContent,
    ).toMatch(/^\d{1,2}$/)
    expect(
      document.querySelector(".date-tile-month")
        ?.textContent,
    ).toMatch(/^[A-Z]{3}$/)
    expect(
      document.querySelector(".clock-short-hours")
        ?.textContent,
    ).toMatch(/^\d{1,2}:\d{2}$/)
    expect(screen.getByText(/^(AM|PM)$/)).toBeVisible()
  })

  test("drops the meridiem line in twenty-four-hour mode", async () => {
    await mountClockOn({
      ...SHORT_PANEL,
      clock: {
        ...CHICAGO_TWELVE_HOUR,
        isTwelveHour: false,
      },
    })

    expect(
      document.querySelector(".clock-short-meridiem"),
    ).toBeNull()
    expect(
      document.querySelector(".clock-short-hours")
        ?.textContent,
    ).toMatch(/^\d{1,2}:\d{2}$/)
  })

  test("keeps the centered stack on the square", async () => {
    await mountClockOn(SQUARE_PANEL)

    expect(document.querySelector(".date-tile")).toBeNull()
    expect(
      document.querySelector(".ambient-time")?.textContent,
    ).toMatch(/^\d{1,2}:\d{2}\s(AM|PM)$/)
    expect(
      document.querySelector(".ambient-date")?.textContent,
    ).toMatch(/^\w+day, \w+ \d{1,2}$/)
  })
})
