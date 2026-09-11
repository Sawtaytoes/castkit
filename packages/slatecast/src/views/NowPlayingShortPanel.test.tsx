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
  buildSnapshot,
} from "../__fixtures__/buildSnapshot.ts"
import { mountSlatecast } from "../__tests__/setup/mountSlatecast.tsx"
// The sibling test files load no stylesheet: they test behaviour. This one
// tests a media query, so it needs the real rules in the page.
import "../styles.css"

/**
 * The 480×320 WT32 panel: wider than tall by a clear margin and short. The
 * square (720×720) and the round porthole (480×480) must not match.
 */
const SHORT_PANEL = { width: 480, height: 320 }
const SQUARE_PANEL = { width: 720, height: 720 }

const mountOnPanel = async ({
  width,
  height,
}: {
  width: number
  height: number
}) => {
  await page.viewport(width, height)
  await mountSlatecast({
    snapshot: buildSnapshot({
      view: "now-playing",
      device: buildDeviceProfile({ width, height }),
    }),
  })
}

const fontSizeOf = (selector: string) =>
  Number.parseFloat(
    getComputedStyle(
      document.querySelector(selector) as Element,
    ).fontSize,
  )

describe("now playing on a short landscape panel", () => {
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

  test("sets the art beside the text and drops the transport row", async () => {
    await mountOnPanel(SHORT_PANEL)

    const artwork = screen.getByRole("button", {
      name: /^Pause/,
    })
    const title = document.querySelector(
      ".title",
    ) as HTMLElement
    // Side by side: the text starts to the right of the art, not under it.
    expect(
      title.getBoundingClientRect().left,
    ).toBeGreaterThan(artwork.getBoundingClientRect().right)
    expect(artwork.getBoundingClientRect().width).toBe(232)
    // The art is the transport now; the three buttons are gone from view
    // (and from the accessibility tree, hence `hidden`).
    expect(
      screen.getByRole("button", {
        name: "Next track",
        hidden: true,
      }),
    ).not.toBeVisible()
    expect(
      screen.getByRole("slider", { name: "Volume" }),
    ).toBeVisible()
  })

  test("uses the fixed readable sizes, not vmin", async () => {
    await mountOnPanel(SHORT_PANEL)

    expect(fontSizeOf(".title")).toBe(27)
    expect(fontSizeOf(".artist")).toBe(21)
    expect(fontSizeOf(".seek-time")).toBe(16)
  })

  test("leaves the square panel on the vmin layout", async () => {
    await mountOnPanel(SQUARE_PANEL)

    // 5vmin of 720.
    expect(fontSizeOf(".title")).toBe(36)
    expect(
      screen.getByRole("button", { name: "Next track" }),
    ).toBeVisible()
  })
})
