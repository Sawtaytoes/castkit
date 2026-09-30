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
}: {
  width: number
  height: number
  repaint?: "instant" | "slow" | "super-slow"
  value?: ContractData["kids-points.v1"]
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
      <KidsPointsView data={value} now={now} />
    </DisplayPropertiesContext.Provider>,
  )
}

afterEach(() => {
  vi.restoreAllMocks()
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
