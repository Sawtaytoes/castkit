import type { ContractData } from "@castkit/sdk/contracts"
import { render, screen } from "@testing-library/preact"
import { afterEach, expect, test, vi } from "vitest"
import { DisplayPropertiesContext } from "./displayProperties.ts"
import { KidsPointsView } from "./KidsPointsView.tsx"

const now = Date.parse("2026-01-15T16:00:00Z")

const data: ContractData["kids-points.v1"] = {
  kids: [
    {
      id: "robin",
      name: "Robin",
      color: "#336699",
      pointsToday: 130,
      goal: 500,
      lastTask: "Feed the Cat",
    },
    {
      id: "sky",
      name: "Sky",
      pointsToday: 520,
      goal: 500,
    },
    {
      id: "quinn",
      name: "Quinn",
      pointsToday: 0,
      goal: 500,
    },
    {
      id: "wren",
      name: "Wren",
      pointsToday: 40,
      goal: 500,
      activeTask: {
        name: "Reading",
        startedAtMs: Date.parse("2026-01-15T15:30:00Z"),
      },
    },
  ],
}

const scanned: ContractData["kids-points.v1"] = {
  ...data,
  lastScan: {
    kidId: "robin",
    result: "awarded",
    points: 10,
    taskName: "Feed the Cat",
    atMs: now - 3_000,
  },
}

/** The view measures its own box; each test states the panel it is on. */
const renderInPanel = ({
  width,
  height,
  repaint = "instant",
  value = data,
  settings,
}: {
  width: number
  height: number
  repaint?: "instant" | "slow" | "super-slow"
  value?: ContractData["kids-points.v1"]
  settings?: Record<string, unknown>
}) => {
  vi.spyOn(
    HTMLElement.prototype,
    "clientWidth",
    "get",
  ).mockReturnValue(width)
  vi.spyOn(
    HTMLElement.prototype,
    "clientHeight",
    "get",
  ).mockReturnValue(height)
  return render(
    <DisplayPropertiesContext.Provider
      value={{
        delivery:
          repaint === "instant" ? "browser" : "image",
        repaint,
      }}
    >
      <KidsPointsView
        data={value}
        now={now}
        settings={settings}
      />
    </DisplayPropertiesContext.Provider>,
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

test("a tall phone keeps every child's task and shows earned points before a smaller goal", () => {
  const { container } = renderInPanel({
    width: 348,
    height: 802,
    value: { kids: data.kids.slice(0, 3) },
  })
  expect(
    container.querySelector(".kids-points-board"),
  ).toHaveAttribute("data-stacked", "true")
  expect(
    container.querySelectorAll(".kids-points-card"),
  ).toHaveLength(3)
  expect(
    screen.getByText("Last: Feed the Cat"),
  ).toBeVisible()
  expect(
    container.querySelector(
      ".kids-points-card-head .kids-points-total strong",
    ),
  ).toHaveTextContent("130")
  expect(
    container.querySelector(
      ".kids-points-card-head .kids-points-total-label",
    ),
  ).toHaveTextContent("/ 500")
})

test("a large panel keeps every child on the board", () => {
  renderInPanel({ width: 1200, height: 640 })
  expect(
    screen.getByRole("heading", { name: "Robin" }),
  ).toBeVisible()
  expect(
    screen.getByRole("heading", { name: "Sky" }),
  ).toBeVisible()
  expect(
    screen.getByRole("heading", { name: "Wren" }),
  ).toBeVisible()
  expect(screen.getByText("Goal reached")).toBeVisible()
  expect(
    screen.getByText("Last: Feed the Cat"),
  ).toBeVisible()
  expect(screen.getByText(/^Reading since/)).toBeVisible()
})

test("a scan on a large panel marks that child and keeps the others", () => {
  const { container } = renderInPanel({
    width: 1200,
    height: 640,
    value: scanned,
  })
  expect(screen.getByRole("status")).toHaveTextContent(
    "+10Feed the Cat",
  )
  expect(
    container.querySelector('[data-scanned="true"] h3'),
  ).toHaveTextContent("Robin")
  expect(
    container.querySelectorAll('[data-dimmed="true"]'),
  ).toHaveLength(3)
})

test("a scan on a small panel gives the whole panel to that child", () => {
  renderInPanel({ width: 440, height: 440, value: scanned })
  expect(
    screen.getByRole("heading", { name: "Robin" }),
  ).toBeVisible()
  expect(
    screen.queryByRole("heading", { name: "Sky" }),
  ).toBe(null)
  expect(screen.getByRole("status")).toHaveTextContent(
    "+10Feed the Cat",
  )
  expect(screen.getByText("of 500 today")).toBeVisible()
})

test("an instant panel merges the scan's points into the old total", () => {
  const { container } = renderInPanel({
    width: 440,
    height: 440,
    value: scanned,
  })
  expect(
    container.querySelector(".kids-points-number"),
  ).toHaveAttribute("data-motion", "count")
  expect(
    container.querySelector(".kids-points-number-before"),
  ).toHaveTextContent("120")
  expect(
    container.querySelector(".kids-points-number-after"),
  ).toHaveTextContent("130")
  expect(
    container.querySelector(".kids-points-chip"),
  ).toHaveTextContent("+10")
})

test("the scan that reaches the goal throws confetti, and a later one a ring of stars", () => {
  const atGoal = {
    ...scanned,
    kids: scanned.kids.map((kid) =>
      kid.id === "robin"
        ? { ...kid, pointsToday: 500 }
        : kid,
    ),
  }
  const first = renderInPanel({
    width: 440,
    height: 440,
    value: atGoal,
  })
  expect(
    first.container.querySelectorAll(
      ".kids-points-confetti i",
    ).length,
  ).toBeGreaterThan(0)
  expect(
    first.container.querySelector(".kids-points-stars"),
  ).toBe(null)
  first.unmount()
  const afterGoal = renderInPanel({
    width: 440,
    height: 440,
    value: {
      ...atGoal,
      kids: atGoal.kids.map((kid) =>
        kid.id === "robin"
          ? { ...kid, pointsToday: 600 }
          : kid,
      ),
    },
  })
  expect(
    afterGoal.container.querySelector(".kids-points-stars"),
  ).not.toBe(null)
  expect(
    afterGoal.container.querySelector(
      ".kids-points-confetti",
    ),
  ).toBe(null)
})

test("a refused scan does not move the total", () => {
  const { container } = renderInPanel({
    width: 440,
    height: 440,
    value: {
      ...scanned,
      lastScan: {
        kidId: "robin",
        result: "refused",
        points: 0,
        message: "Already done today",
        atMs: now - 3_000,
      },
    },
  })
  expect(
    container.querySelector(".kids-points-number"),
  ).toBe(null)
  expect(screen.getByRole("status")).toHaveTextContent(
    "Not counted",
  )
})

test("a slow panel shows the points and the new total, without motion", () => {
  const { container } = renderInPanel({
    width: 440,
    height: 440,
    repaint: "slow",
    value: {
      ...scanned,
      lastScan: {
        kidId: "robin",
        result: "awarded",
        points: 10,
        taskName: "Feed the Cat",
        atMs: now - 20_000,
      },
    },
  })
  expect(screen.getByRole("status")).toHaveTextContent(
    "+10Feed the Cat",
  )
  expect(screen.getByText("130")).toBeVisible()
  expect(
    container.querySelector(".kids-points-number"),
  ).toBe(null)
})

test("a small panel with no scan lists the rows that fit and counts the rest", () => {
  renderInPanel({ width: 226, height: 98 })
  expect(
    screen.getByRole("heading", { name: "Robin" }),
  ).toBeVisible()
  expect(
    screen.queryByRole("heading", { name: "Sky" }),
  ).toBe(null)
  expect(screen.getByText("3 more")).toBeVisible()
})

test("a panel too slow for a fifteen-second result shows the totals instead", () => {
  renderInPanel({
    width: 440,
    height: 440,
    repaint: "super-slow",
    value: scanned,
  })
  expect(screen.queryByRole("status")).toBe(null)
  expect(
    screen.getByRole("heading", { name: "Sky" }),
  ).toBeVisible()
})

test("no children yet says so instead of drawing an empty board", () => {
  renderInPanel({
    width: 1200,
    height: 640,
    value: { kids: [] },
  })
  expect(
    screen.getByRole("heading", { name: "No points yet" }),
  ).toBeVisible()
})

const countdown: ContractData["kids-points.v1"] = {
  kids: data.kids.map((kid) =>
    kid.id === "robin"
      ? {
          ...kid,
          activeTask: {
            name: "Sitting Still",
            startedAtMs: now - 204_000,
            goalMinutes: 6,
            isCountdown: true,
          },
        }
      : kid,
  ),
  lastScan: {
    kidId: "robin",
    result: "started",
    points: 0,
    taskName: "Sitting Still",
    atMs: now - 204_000,
  },
}

test("a countdown stays focused past scan expiry with only remaining time", () => {
  renderInPanel({
    width: 440,
    height: 280,
    value: countdown,
  })
  expect(screen.queryByText("3:24")).toBe(null)
  expect(screen.getByText("2:36")).toBeVisible()
  expect(
    screen.getByRole("progressbar", {
      name: "Robin Sitting Still timed progress",
    }),
  ).toHaveAttribute("aria-valuenow", "204")
  expect(screen.queryByText("Not counted")).toBe(null)
  expect(screen.queryByText("130")).toBe(null)
})

test("a progress notification uses the saved countdown rather than a refusal banner", () => {
  renderInPanel({
    width: 1200,
    height: 640,
    value: {
      ...countdown,
      lastScan: {
        ...countdown.lastScan!,
        result: "progress",
        atMs: now - 3000,
      },
    },
  })
  expect(screen.queryByText("3:24")).toBe(null)
  expect(screen.queryByText("Not counted")).toBe(null)
  expect(
    screen.getByRole("heading", { name: "Sky" }),
  ).toBeVisible()
})

test("a slow panel states the deadline instead of a ticking countdown", () => {
  renderInPanel({
    width: 440,
    height: 280,
    repaint: "slow",
    value: countdown,
  })
  expect(screen.getByText(/^6 min · ends/)).toBeVisible()
  expect(screen.queryByText("2:36")).toBe(null)
})

test("a canceled countdown returns to the scan result", () => {
  renderInPanel({
    width: 440,
    height: 280,
    value: {
      ...countdown,
      kids: countdown.kids.map((kid) => ({
        ...kid,
        activeTask: undefined,
      })),
      lastScan: {
        ...countdown.lastScan!,
        result: "stopped",
        atMs: now - 3000,
      },
    },
  })
  expect(screen.getByText("Timer stopped")).toBeVisible()
  expect(screen.queryByText("2:36")).toBe(null)
})

test("the live clock advances countdown metrics without a new producer payload", () => {
  const rendered = renderInPanel({
    width: 440,
    height: 280,
    value: countdown,
  })
  rendered.rerender(
    <DisplayPropertiesContext.Provider
      value={{ delivery: "browser", repaint: "instant" }}
    >
      <KidsPointsView data={countdown} now={now + 1000} />
    </DisplayPropertiesContext.Provider>,
  )
  expect(screen.queryByText("done")).toBe(null)
  expect(screen.getByText("2:35")).toBeVisible()
  expect(screen.getByRole("progressbar")).toHaveAttribute(
    "aria-valuetext",
    "2:35 left",
  )
})

test("a 200px totals board keeps all initials and totals visible in source order during a scan", () => {
  const { container } = renderInPanel({
    width: 200,
    height: 200,
    value: { ...scanned, kids: scanned.kids.slice(0, 3) },
    settings: { isTotalsOnly: true, nameStyle: "initial" },
  })
  const rows = Array.from(
    container.querySelectorAll(".kids-points-simple-row"),
  )
  expect(
    rows.map((row) => row.querySelector("h3")?.textContent),
  ).toEqual(["R", "S", "Q"])
  expect(
    rows.map(
      (row) => row.querySelector("strong")?.textContent,
    ),
  ).toEqual(["130", "520", "0"])
  expect(
    container.querySelector(".kids-points-focus"),
  ).toBeNull()
  expect(
    container.querySelector(".kids-points-bar"),
  ).toBeNull()
})

test("the totals board defaults to full names and preserves negative scores", () => {
  const { container } = renderInPanel({
    width: 200,
    height: 200,
    value: {
      kids: [{ ...data.kids[0]!, pointsToday: -25 }],
    },
    settings: { isTotalsOnly: true },
  })
  expect(
    screen.getByRole("heading", { name: "Robin" }),
  ).toBeVisible()
  expect(
    container.querySelector(
      ".kids-points-simple-row strong",
    ),
  ).toHaveTextContent("-25")
})

const simultaneousCountdowns: ContractData["kids-points.v1"] =
  {
    ...countdown,
    timerScans: [
      countdown.lastScan!,
      {
        ...countdown.lastScan!,
        kidId: "sky",
        atMs: now - 60_000,
      },
    ],
    kids: countdown.kids.map((kid) =>
      kid.id === "sky"
        ? {
            ...kid,
            activeTask: {
              name: "Sitting Still",
              startedAtMs: now - 60_000,
              goalMinutes: 10,
              isCountdown: true,
            },
          }
        : kid,
    ),
    lastScan: {
      ...countdown.lastScan!,
      kidId: "sky",
      atMs: now - 60_000,
    },
  }

test.each([
  { width: 480, height: 320 },
  { width: 384, height: 824 },
  { width: 200, height: 200 },
])("a $width by $height panel shows both independent countdowns", (size) => {
  renderInPanel({ ...size, value: simultaneousCountdowns })
  expect(screen.getByText("2:36")).toBeVisible()
  expect(screen.getByText("9:00")).toBeVisible()
  expect(
    screen.getByRole("heading", { name: "Robin" }),
  ).toBeVisible()
  expect(
    screen.getByRole("heading", { name: "Sky" }),
  ).toBeVisible()
  expect(
    screen.getByRole("progressbar", {
      name: "Robin Sitting Still timed progress",
    }),
  ).toHaveAttribute("aria-valuenow", "204")
  expect(
    screen.getByRole("progressbar", {
      name: "Sky Sitting Still timed progress",
    }),
  ).toHaveAttribute("aria-valuenow", "60")
})

test("stopping the latest timer leaves the other countdown visible past scan expiry", () => {
  renderInPanel({
    width: 480,
    height: 320,
    value: {
      ...simultaneousCountdowns,
      kids: simultaneousCountdowns.kids.map((kid) =>
        kid.id === "sky"
          ? { ...kid, activeTask: undefined }
          : kid,
      ),
      lastScan: {
        ...simultaneousCountdowns.lastScan!,
        result: "stopped",
        atMs: now - 30_000,
      },
    },
  })
  expect(screen.getByText("2:36")).toBeVisible()
  expect(screen.queryByText("9:00")).toBe(null)
})

test("a slow compact panel shows both absolute timer deadlines", () => {
  renderInPanel({
    width: 480,
    height: 320,
    repaint: "slow",
    value: simultaneousCountdowns,
  })
  expect(screen.getByText(/^6 min · ends/)).toBeVisible()
  expect(screen.getByText(/^10 min · ends/)).toBeVisible()
  expect(screen.queryByText("9:00")).toBe(null)
})

test("a compact board keeps three children visible through scan feedback", () => {
  const value = {
    ...scanned,
    kids: scanned.kids.slice(0, 3),
  }
  const { container } = renderInPanel({
    width: 440,
    height: 440,
    value,
    settings: {
      isAllChildrenVisible: true,
      scanSeconds: 30,
    },
  })
  expect(
    container.querySelectorAll(".kids-points-row"),
  ).toHaveLength(3)
  for (const kid of value.kids)
    expect(
      screen.getByRole("heading", { name: kid.name }),
    ).toBeVisible()
  expect(
    container.querySelector(".kids-points-focus"),
  ).toBeNull()
  expect(screen.getByText("Feed the Cat")).toBeVisible()
})

test("a compact board shows simultaneous countdown and count-up activities after feedback ends", () => {
  const value: ContractData["kids-points.v1"] = {
    kids: [
      {
        ...data.kids[0],
        activeTask: {
          name: "Reading",
          startedAtMs: now - 120000,
          isCountdown: false,
        },
      },
      {
        ...data.kids[1],
        activeTask: {
          name: "Sitting",
          startedAtMs: now - 60000,
          isCountdown: true,
          goalMinutes: 5,
        },
      },
      data.kids[2],
    ],
  }
  const { container } = renderInPanel({
    width: 440,
    height: 440,
    value,
    settings: { isAllChildrenVisible: true },
  })
  expect(
    container.querySelectorAll(".kids-points-row"),
  ).toHaveLength(3)
  expect(
    screen.getByText("Reading · 2:00 elapsed"),
  ).toBeVisible()
  expect(
    screen.getByText("Sitting · 4:00 left"),
  ).toBeVisible()
})

test("count-up scans lead with accumulated minutes and advance the session independently", () => {
  const task = {
    name: "Instrument Practice",
    startedAtMs: now,
    bankedMinutes: 27,
    goalMinutes: 30,
    isCountdown: false,
    reader: "Practice Reader",
  }
  const running = {
    kids: [{ ...data.kids[0]!, activeTask: task }],
    lastScan: {
      kidId: "robin",
      result: "started" as const,
      taskName: task.name,
      points: 0,
      atMs: now,
    },
  }
  const { container, rerender } = renderInPanel({
    width: 480,
    height: 480,
    value: running,
  })
  expect(screen.queryByText("Timer started")).toBeNull()
  expect(
    container.querySelector(".kids-points-countup-total"),
  ).toHaveTextContent("27min total")
  expect(
    screen.getByText("0 min this session"),
  ).toBeVisible()
  rerender(
    <KidsPointsView
      data={running}
      now={now + 3 * 60_000}
    />,
  )
  expect(
    container.querySelector(".kids-points-countup-total"),
  ).toHaveTextContent("30min total")
  expect(
    screen.getByText("3 min this session"),
  ).toBeVisible()
  rerender(
    <KidsPointsView
      data={running}
      now={now + 40 * 60_000}
    />,
  )
  expect(
    container.querySelector(".kids-points-countup-total"),
  ).toHaveTextContent("67min total")
  expect(
    screen.getByText("40 min this session"),
  ).toBeVisible()
})

test("the all-child square board gives a running count-up its total instead of start feedback", () => {
  const kids = data.kids.slice(0, 3).map((kid, index) =>
    index === 0
      ? {
          ...kid,
          activeTask: {
            name: "Instrument Practice",
            startedAtMs: now,
            bankedMinutes: 27,
            isCountdown: false,
            reader: "Practice Reader",
          },
        }
      : kid,
  )
  const { container } = renderInPanel({
    width: 480,
    height: 480,
    settings: { isAllChildrenVisible: true },
    value: {
      kids,
      lastScan: {
        kidId: "robin",
        taskName: "Instrument Practice",
        points: 0,
        result: "started",
        atMs: now,
      },
    },
  })
  expect(
    container.querySelectorAll(".kids-points-card"),
  ).toHaveLength(3)
  expect(
    container.querySelector(
      ".kids-points-countup-total strong",
    ),
  ).toHaveTextContent("27")
  expect(
    screen.getByText("0 min this session"),
  ).toBeVisible()
})

test("a slow count-up states the banked baseline and start instead of a stale running duration", () => {
  const { container } = renderInPanel({
    width: 480,
    height: 480,
    repaint: "slow",
    value: {
      kids: [
        {
          ...data.kids[0]!,
          activeTask: {
            name: "Instrument Practice",
            reader: "Practice Reader",
            startedAtMs: now,
            bankedMinutes: 27,
            isCountdown: false,
          },
        },
      ],
    },
  })
  expect(
    container.querySelector(".kids-points-countup-total"),
  ).toHaveTextContent("27min before this session")
  expect(screen.getByText(/^Started /)).toBeVisible()
  expect(
    screen.queryByText("0 min this session"),
  ).toBeNull()
})
