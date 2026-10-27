import {
  render,
  screen,
  within,
} from "@testing-library/preact"
import userEvent from "@testing-library/user-event"
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
 *
 * The WIDTH is pinned too. The view picks its column count from the panel's
 * width, and an unpinned width is the test window's: a 162px panel in a
 * 1920px window fits both providers side by side, which is a different panel
 * from the one a test names. 414 is the width every test here was written
 * against.
 */
const renderInPanel = ({
  data = usage,
  panelHeight,
  panelWidth = 414,
  repaint,
  settings,
}: {
  data?: Parameters<typeof AiUsageView>[0]["data"]
  panelHeight: number
  panelWidth?: number
  repaint: "instant" | "slow" | "super-slow"
  settings?: Record<string, unknown>
}) => {
  vi.spyOn(
    HTMLElement.prototype,
    "clientHeight",
    "get",
  ).mockReturnValue(panelHeight)
  vi.spyOn(
    HTMLElement.prototype,
    "clientWidth",
    "get",
  ).mockReturnValue(panelWidth)
  const panel = (
    currentData: Parameters<typeof AiUsageView>[0]["data"],
  ) => (
    <DisplayPropertiesContext.Provider
      value={{
        delivery:
          repaint === "instant" ? "browser" : "image",
        repaint,
      }}
    >
      <div class="platform-panel">
        <AiUsageView
          data={currentData}
          now={now}
          settings={settings}
        />
      </div>
    </DisplayPropertiesContext.Provider>
  )
  const rendered = render(panel(data))
  return {
    ...rendered,
    rerenderData: (
      currentData: Parameters<
        typeof AiUsageView
      >[0]["data"],
    ) => rendered.rerender(panel(currentData)),
  }
}

test("each provider is represented by its weekly limit alone", () => {
  const { container } = renderInPanel({
    panelHeight: 900,
    repaint: "instant",
  })
  expect(
    container.querySelectorAll(".ai-usage-provider-icon"),
  ).toHaveLength(2)
  expect(screen.queryByText("Max")).toBeNull()
  expect(screen.getByText("Claude")).toBeVisible()
  expect(screen.getByText("Codex")).toBeVisible()
  expect(screen.queryByText("7-day limit")).toBeNull()
  /*
   * The five-hour limit is real and is deliberately not drawn. A quiet
   * short window is noise on a panel read from across a desk.
   */
  expect(screen.queryByText("5-hour limit")).toBeNull()
  expect(screen.getByText("46%")).toBeVisible()
  expect(
    screen
      .getByText("46%")
      .closest(".ai-usage-provider-head")?.textContent,
  ).toContain("Claude")
  expect(screen.queryByText(/% left/)).toBeNull()
  expect(screen.getByText("7%")).toBeVisible()
  expect(screen.queryByText(/more limits?/)).toBeNull()
})

test("a nearly-spent session limit earns a second row", () => {
  renderInPanel({
    data: usageWithSpentSession,
    panelHeight: 900,
    repaint: "instant",
  })
  expect(screen.getByText("5-hour limit")).toBeVisible()
  expect(screen.getByText("10%")).toBeVisible()
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
   * heading and 48 for a limit: this panel holds the fullest provider's
   * heading and one row, no more.
   */
  renderInPanel({ panelHeight: 162, repaint: "instant" })
  expect(screen.getByText("Codex")).toBeVisible()
  expect(screen.getByText("7%")).toBeVisible()
  expect(screen.queryByText("7-day limit")).toBeNull()
  expect(screen.queryByText("Claude")).toBeNull()
  /*
   * One, not two. The five-hour limit was withheld by the rule, not lost to
   * the glass, so counting it here would send the reader looking for a row
   * the view decided was not worth their attention.
   */
  expect(screen.getByText("1 more limit")).toBeVisible()
})

test("a panel too short for one whole row still names the closest to spent", async () => {
  renderInPanel({ panelHeight: 60, repaint: "slow" })
  expect(screen.getByText("Codex 7%")).toBeVisible()
  expect(screen.queryByText(/more limits?/)).toBeNull()
  await userEvent.setup().click(
    screen.getByRole("button", {
      name: "Show Codex usage details",
    }),
  )
  expect(
    screen.getByRole("dialog", {
      name: "Codex usage details",
    }),
  ).toBeVisible()
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

test("a letterbox panel lays its providers out in columns and grows its type", () => {
  const fiveProviders = {
    providers: [
      "Claude",
      "Codex",
      "Codex 2",
      "Grok",
      "Cursor",
    ].map((name) => ({
      id: name.toLowerCase().replace(" ", "_"),
      name,
      isOk: true,
      windows: [
        {
          id: "weekly",
          label: "Weekly",
          periodHours: 168,
          percentUsed: 40,
        },
      ],
    })),
  }
  const { container } = renderInPanel({
    data: fiveProviders,
    panelHeight: 480,
    panelWidth: 1360,
    repaint: "slow",
  })
  expect(
    container.querySelectorAll(".ai-usage-column"),
  ).toHaveLength(3)
  expect(
    container.querySelectorAll(".ai-usage-provider-icon"),
  ).toHaveLength(3)
  fiveProviders.providers.forEach((provider) => {
    expect(screen.getByText(provider.name)).toBeVisible()
  })
  expect(screen.queryByText(/more limits?/)).toBeNull()
  const root =
    container.querySelector<HTMLElement>(".ai-usage")
  expect(
    Number(
      root?.style.getPropertyValue("--ai-usage-scale"),
    ),
  ).toBeGreaterThan(1.5)
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
  expect(screen.queryByText("Monthly limit")).toBeNull()
})

test("a combined usage panel starts with account names without a redundant view heading", () => {
  renderInPanel({
    panelHeight: 900,
    repaint: "instant",
    settings: { isAdaptiveLayout: true },
  })
  expect(
    screen.queryByRole("heading", { name: "AI Usage" }),
  ).toBeNull()
  expect(
    screen.getByRole("heading", { name: "Claude" }),
  ).toBeVisible()
  expect(
    screen.getByRole("heading", { name: "Codex" }),
  ).toBeVisible()
  expect(screen.getByText("46%")).toBeVisible()
})

const detailedUsage = {
  providers: usage.providers.map((provider) => ({
    ...provider,
    windows: provider.windows.concat(
      provider.id === "claude"
        ? [
            {
              id: "weekly_fable",
              label: "Weekly Fable",
              periodHours: 168,
              percentUsed: 12,
              resetsAtMs: now + 94 * HOUR_MILLISECONDS,
            },
          ]
        : [
            {
              id: "session",
              label: "5-hour limit",
              periodHours: 5,
              percentUsed: 25,
              resetsAtMs: now + HOUR_MILLISECONDS,
            },
          ],
    ),
  })),
}

test("clicking a provider reveals every limit and reset, then restores focus on close", async () => {
  const user = userEvent.setup()
  renderInPanel({
    data: detailedUsage,
    panelHeight: 900,
    repaint: "instant",
  })
  const trigger = screen.getByRole("button", {
    name: "Show Claude usage details",
  })
  await user.click(trigger)
  const details = within(
    screen.getByRole("dialog", {
      name: "Claude usage details",
    }),
  )
  expect(details.getByText("7-day limit")).toBeVisible()
  expect(details.getByText("5-hour limit")).toBeVisible()
  expect(details.getByText("Weekly Fable")).toBeVisible()
  expect(details.getByText("88%")).toBeVisible()
  expect(details.getAllByText(/^Resets /)).toHaveLength(3)
  await user.click(
    details.getByRole("button", {
      name: "Close usage details",
    }),
  )
  expect(screen.queryByRole("dialog")).toBeNull()
  expect(trigger).toHaveFocus()
  await user.keyboard("{Enter}")
  expect(screen.getByRole("dialog")).toBeVisible()
  await user.keyboard("{Escape}")
  expect(screen.queryByRole("dialog")).toBeNull()
  await user.click(
    screen.getByRole("button", {
      name: "Show Codex usage details",
    }),
  )
  const codex = within(
    screen.getByRole("dialog", {
      name: "Codex usage details",
    }),
  )
  expect(codex.getByText("7-day limit")).toBeVisible()
  expect(codex.getByText("5-hour limit")).toBeVisible()
  expect(codex.queryByText("Weekly Fable")).toBeNull()
  expect(codex.getAllByText(/^Resets /)).toHaveLength(2)
})

test("details read updated data and close if the account disappears", async () => {
  const user = userEvent.setup()
  const rendered = renderInPanel({
    data: detailedUsage,
    panelHeight: 900,
    repaint: "instant",
  })
  await user.click(
    screen.getByRole("button", {
      name: "Show Claude usage details",
    }),
  )
  rendered.rerenderData({
    providers: [
      {
        ...detailedUsage.providers[0],
        isCached: true,
        isOk: false,
        problemText: "Sign-in expired",
        windows: [
          {
            id: "unknown",
            label: "Additional quota",
            usedText: "10 / 100 credits",
          },
        ],
      },
    ],
  })
  const details = within(screen.getByRole("dialog"))
  expect(
    details.getByText("Additional quota"),
  ).toBeVisible()
  expect(
    details.getByText("10 / 100 credits"),
  ).toBeVisible()
  expect(
    details.getByText("Reset time unavailable"),
  ).toBeVisible()
  expect(
    details.getByText("Last known usage"),
  ).toBeVisible()
  expect(details.getByText("Sign-in expired")).toBeVisible()
  rendered.rerenderData({ providers: [] })
  expect(screen.queryByRole("dialog")).toBeNull()
})

test("a display without touch keeps the static summary", () => {
  render(
    <DisplayPropertiesContext.Provider
      value={{ repaint: "slow", hasTouch: false }}
    >
      <AiUsageView data={detailedUsage} now={now} />
    </DisplayPropertiesContext.Provider>,
  )
  expect(
    screen.queryByRole("button", { name: /usage details/ }),
  ).toBeNull()
})
