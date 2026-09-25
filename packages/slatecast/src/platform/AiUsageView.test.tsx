import { render, screen } from "@testing-library/preact"
import { expect, test, vi } from "vitest"
import { AiUsageView } from "./AiUsageView.tsx"
import { DisplayPropertiesContext } from "./displayProperties.ts"

const now = Date.parse("2026-01-01T12:00:00Z")

const HOUR_MILLISECONDS = 3_600_000

const buildUsage = (sessionPercentUsed: number) => ({
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
          periodHours: 5,
          percentUsed: sessionPercentUsed,
          resetsAtMs: now + 3 * HOUR_MILLISECONDS,
        },
        {
          id: "weekly_all",
          label: "7-day limit",
          periodHours: 168,
          percentUsed: 54,
          resetsAtMs: now + 94 * HOUR_MILLISECONDS,
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
          periodHours: 168,
          percentUsed: 93,
          resetsAtMs: now + 120 * HOUR_MILLISECONDS,
        },
      ],
    },
  ],
})

/** A quiet session limit, well under any sensible alert threshold. */
const usage = buildUsage(7)

/** The same snapshot with the session limit nearly spent. */
const usageWithSpentSession = buildUsage(90)

/**
 * The view measures its own panel, and jsdom reports every element as zero
 * high. Each test states the height it is testing against.
 */
const renderInPanel = ({
  data = usage,
  panelHeight,
  repaint,
  settings,
}: {
  data?: ReturnType<typeof buildUsage>
  panelHeight: number
  repaint: "instant" | "slow" | "super-slow"
  settings?: Record<string, unknown>
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
        <AiUsageView
          data={data}
          now={now}
          settings={settings}
        />
      </div>
    </DisplayPropertiesContext.Provider>,
  )
}

test("each provider is represented by its weekly limit alone", () => {
  renderInPanel({ panelHeight: 900, repaint: "instant" })
  expect(screen.getByText("Claude")).toBeVisible()
  expect(screen.getByText("Codex")).toBeVisible()
  expect(screen.getAllByText("7-day limit")).toHaveLength(2)
  /*
   * The five-hour limit is real and is deliberately not drawn. A quiet
   * short window is noise on a panel read from across a desk.
   */
  expect(screen.queryByText("5-hour limit")).toBeNull()
  expect(screen.getByText("46% left")).toBeVisible()
  expect(screen.getByText("7% left")).toBeVisible()
  expect(screen.queryByText(/more limits?/)).toBeNull()
})

test("a nearly-spent session limit earns a second row", () => {
  renderInPanel({
    data: usageWithSpentSession,
    panelHeight: 900,
    repaint: "instant",
  })
  expect(screen.getByText("5-hour limit")).toBeVisible()
  expect(screen.getByText("10% left")).toBeVisible()
})

test("the escalated row is marked, so a 1-bit panel can show it without color", () => {
  const { container } = renderInPanel({
    data: usageWithSpentSession,
    panelHeight: 900,
    repaint: "slow",
  })
  const escalated = container.querySelectorAll(
    '.ai-usage-window[data-escalated="true"]',
  )
  expect(escalated).toHaveLength(1)
  expect(escalated[0].textContent).toContain("5-hour limit")
})

test("the panel owns the threshold", () => {
  renderInPanel({
    panelHeight: 900,
    repaint: "instant",
    settings: { alertPercent: 5 },
  })
  expect(screen.getByText("5-hour limit")).toBeVisible()
})

test("a threshold outside 0-100 falls back to the default", () => {
  renderInPanel({
    panelHeight: 900,
    repaint: "instant",
    settings: { alertPercent: -4 },
  })
  expect(screen.queryByText("5-hour limit")).toBeNull()
})

test("a short panel drops the rows it cannot finish and counts them", () => {
  /*
   * 58 for the heading and its reserved overflow line, 34 for a provider
   * heading and 70 for a limit: this panel holds Claude's heading and its
   * one row, no more.
   */
  renderInPanel({ panelHeight: 162, repaint: "instant" })
  expect(screen.getByText("Claude")).toBeVisible()
  expect(screen.getByText("7-day limit")).toBeVisible()
  expect(screen.queryByText("Codex")).toBeNull()
  /*
   * One, not two. The five-hour limit was withheld by the rule, not lost to
   * the glass, so counting it here would send the reader looking for a row
   * the view decided was not worth their attention.
   */
  expect(screen.getByText("1 more limit")).toBeVisible()
})

test("a panel too short for one whole row still names the closest to spent", () => {
  renderInPanel({ panelHeight: 60, repaint: "slow" })
  expect(screen.getByText("Codex 7% left")).toBeVisible()
  expect(screen.queryByText(/more limits?/)).toBeNull()
})

test("a super-slow panel states the reset time absolutely, never as a countdown", () => {
  renderInPanel({
    data: usageWithSpentSession,
    panelHeight: 900,
    repaint: "super-slow",
  })
  /*
   * A countdown is wrong by the time a 28-second panel finishes drawing it.
   * The absolute form stays true until the reset itself.
   */
  expect(screen.queryByText(/Resets in/)).toBeNull()
  expect(screen.getAllByText(/^Resets /)).toHaveLength(3)
})

test("a live panel counts down only within the day, never in hundreds of hours", () => {
  renderInPanel({
    data: usageWithSpentSession,
    panelHeight: 900,
    repaint: "instant",
  })
  expect(screen.getByText("Resets in 3h 0m")).toBeVisible()
  /*
   * Both weekly windows are days away. A countdown passes the freshness rule
   * on a live panel and still fails the reader, who cannot hold 94 hours.
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
                {
                  id: "primary",
                  label: "Monthly limit",
                  periodHours: 720,
                },
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
  /*
   * A monthly allowance is longer than a week and is the only window this
   * provider has, so it leads rather than being ruled out for being too long.
   */
  expect(screen.getByText("Monthly limit")).toBeVisible()
})
