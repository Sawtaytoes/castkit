import { render, screen } from "@testing-library/preact"
import { expect, test, vi } from "vitest"
import { AiUsageView } from "./AiUsageView.tsx"
import { DisplayPropertiesContext } from "./displayProperties.ts"

const now = Date.parse("2026-01-01T12:00:00Z")

const usage = {
  providers: [
    {
      id: "claude",
      name: "Claude",
      isOk: true,
      planText: "Max",
      windows: [
        {
          id: "session_5h",
          label: "5-hour limit",
          percentUsed: 7,
          resetsAtMs: now + 10_800_000,
        },
        {
          id: "weekly_all",
          label: "7-day limit",
          percentUsed: 54,
          resetsAtMs: now + 338_400_000,
        },
      ],
    },
    {
      id: "codex",
      name: "Codex",
      isOk: true,
      windows: [
        {
          id: "weekly",
          label: "7-day limit",
          percentUsed: 93,
          resetsAtMs: now + 432_000_000,
        },
      ],
    },
  ],
}

/**
 * The view measures its own panel, and jsdom reports every element as zero
 * high. Each test states the height it is testing against.
 */
const renderInPanel = ({
  panelHeight,
  repaint,
}: {
  panelHeight: number
  repaint: "instant" | "slow" | "super-slow"
}) => {
  vi.spyOn(
    HTMLElement.prototype,
    "clientHeight",
    "get",
  ).mockReturnValue(panelHeight)
  return render(
    <DisplayPropertiesContext.Provider
      value={{
        delivery:
          repaint === "instant" ? "browser" : "image",
        repaint,
      }}
    >
      <div class="platform-panel">
        <AiUsageView data={usage} now={now} />
      </div>
    </DisplayPropertiesContext.Provider>,
  )
}

test("a tall panel draws every provider and every limit", () => {
  renderInPanel({ panelHeight: 900, repaint: "instant" })
  expect(screen.getByText("Claude")).toBeVisible()
  expect(screen.getByText("Codex")).toBeVisible()
  expect(screen.getAllByText("7-day limit")).toHaveLength(2)
  expect(screen.getByText("93% left")).toBeVisible()
  expect(screen.queryByText(/more limits?/)).toBeNull()
})

test("a short panel drops the limits it cannot finish and counts them", () => {
  /*
   * 58 for the heading and its reserved overflow line, 34 for a provider
   * heading and 70 for a limit: this panel holds Claude's heading and one of
   * its two limits, no more.
   */
  renderInPanel({ panelHeight: 162, repaint: "instant" })
  expect(screen.getByText("Claude")).toBeVisible()
  expect(screen.getByText("5-hour limit")).toBeVisible()
  expect(screen.queryByText("7-day limit")).toBeNull()
  expect(screen.queryByText("Codex")).toBeNull()
  expect(screen.getByText("2 more limits")).toBeVisible()
})

test("a panel too short for one whole limit still names the closest to spent", () => {
  renderInPanel({ panelHeight: 60, repaint: "slow" })
  expect(screen.getByText("Codex 7% left")).toBeVisible()
  expect(screen.queryByText(/more limits/)).toBeNull()
})

test("a slow panel states the reset time absolutely, never as a countdown", () => {
  renderInPanel({ panelHeight: 900, repaint: "super-slow" })
  /*
   * A countdown is wrong by the time a 28-second panel finishes drawing it.
   * The absolute form stays true until the reset itself.
   */
  expect(screen.queryByText(/Resets in/)).toBeNull()
  expect(screen.getAllByText(/^Resets /).length).toBe(3)
})

test("a live panel counts down only within the day, never in hundreds of hours", () => {
  renderInPanel({ panelHeight: 900, repaint: "instant" })
  expect(screen.getByText("Resets in 3h 0m")).toBeVisible()
  /*
   * The 7-day windows are days away. A countdown passes the freshness rule on
   * a live panel and still fails the reader, who cannot hold 94 hours.
   */
  expect(screen.getAllByText(/Resets in/)).toHaveLength(1)
})

test("an unavailable provider keeps its row and says why", () => {
  vi.spyOn(
    HTMLElement.prototype,
    "clientHeight",
    "get",
  ).mockReturnValue(900)
  render(
    <div class="platform-panel">
      <AiUsageView
        data={{
          providers: [
            {
              id: "cursor",
              name: "Cursor",
              isOk: false,
              problemText: "Sign-in expired",
              windows: [
                { id: "primary", label: "Monthly limit" },
              ],
            },
          ],
        }}
        now={now}
      />
    </div>,
  )
  expect(screen.getByText("Cursor")).toBeVisible()
  expect(screen.getByText("Sign-in expired")).toBeVisible()
  expect(screen.getByText("Monthly limit")).toBeVisible()
})
