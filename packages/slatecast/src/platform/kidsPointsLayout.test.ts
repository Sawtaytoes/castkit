import { expect, test } from "vitest"
import {
  ALL_CHILDREN_FINISHING_ROW_HEIGHT,
  ALL_CHILDREN_ROW_HEIGHT,
  DEFAULT_SCAN_SECONDS,
  getConfettiPieces,
  getGoalPercent,
  getIsScanShowing,
  getKidsPointsLayout,
  getScanMotion,
  getScanText,
  getStarBurst,
  readScanSeconds,
} from "./kidsPointsLayout.ts"

const scan = {
  kidId: "robin",
  result: "awarded" as const,
  points: 10,
  taskName: "Feed the Cat",
  atMs: 100_000,
}

test("a panel wide enough for every child side by side is a board", () => {
  expect(
    getKidsPointsLayout({
      width: 760,
      height: 420,
      kidCount: 3,
    }).isBoard,
  ).toBe(true)
  expect(
    getKidsPointsLayout({
      width: 440,
      height: 440,
      kidCount: 3,
    }).isBoard,
  ).toBe(false)
  expect(
    getKidsPointsLayout({
      width: 760,
      height: 150,
      kidCount: 3,
    }).isBoard,
  ).toBe(false)
})

test("a phone stacks complete cards across its available height", () => {
  const layout = getKidsPointsLayout({
    width: 348,
    height: 802,
    kidCount: 3,
  })
  expect(layout.isBoard).toBe(true)
  expect(layout.columnCount).toBe(1)
})

test("a landscape panel uses columns while an intermediate box uses a grid", () => {
  expect(
    getKidsPointsLayout({
      width: 1200,
      height: 640,
      kidCount: 3,
    }).columnCount,
  ).toBe(3)
  expect(
    getKidsPointsLayout({
      width: 700,
      height: 640,
      kidCount: 4,
    }).columnCount,
  ).toBe(2)
})

test("equally readable grids prefer complete rows rather than empty cells", () => {
  expect(
    getKidsPointsLayout({
      width: 1200,
      height: 640,
      kidCount: 4,
    }).columnCount,
  ).toBe(2)
})

test("rows are drawn only when they finish, with room kept to say what was dropped", () => {
  expect(
    getKidsPointsLayout({
      width: 440,
      height: 440,
      kidCount: 3,
    }).rowCount,
  ).toBe(3)
  expect(
    getKidsPointsLayout({
      width: 226,
      height: 98,
      kidCount: 3,
    }).rowCount,
  ).toBe(1)
  expect(
    getKidsPointsLayout({
      width: 226,
      height: 50,
      kidCount: 3,
    }).rowCount,
  ).toBe(0)
})

const allChildrenRows = (height: number) =>
  getKidsPointsLayout({
    width: 659,
    height,
    kidCount: 3,
    minimumRowHeight: ALL_CHILDREN_ROW_HEIGHT,
    finishingRowHeight: ALL_CHILDREN_FINISHING_ROW_HEIGHT,
  }).rowCount

test("an all-children box with room for a child draws one, whichever scheme rounded it", () => {
  // The 1024 x 600 desk at 1.5x zoom: 154 px in the dark scheme, 156 px in the light.
  expect(allChildrenRows(154)).toBe(1)
  expect(allChildrenRows(156)).toBe(1)
})

test("only the first row gives the overflow line its room, and only while that row still finishes", () => {
  expect(allChildrenRows(139)).toBe(0)
  expect(allChildrenRows(140)).toBe(1)
  // A second row is dropped rather than shrink every row's initial and total.
  expect(allChildrenRows(295)).toBe(1)
  expect(allChildrenRows(296)).toBe(2)
  expect(allChildrenRows(407)).toBe(2)
  expect(allChildrenRows(408)).toBe(3)
})

test("rows without a separate finishing height keep the line outside them", () => {
  const defaultRows = (height: number) =>
    getKidsPointsLayout({
      width: 226,
      height,
      kidCount: 3,
    }).rowCount
  expect(defaultRows(91)).toBe(0)
  expect(defaultRows(92)).toBe(1)
  expect(defaultRows(167)).toBe(1)
  expect(defaultRows(168)).toBe(2)
})

test("a scan shows for its window, and never on a panel too slow to draw it in time", () => {
  const showing = (now: number) =>
    getIsScanShowing({
      lastScan: scan,
      now,
      scanSeconds: 15,
      repaint: "instant",
    })
  expect(showing(110_000)).toBe(true)
  expect(showing(115_000)).toBe(false)
  expect(showing(97_000)).toBe(true)
  expect(
    getIsScanShowing({
      lastScan: scan,
      now: 110_000,
      scanSeconds: 15,
      repaint: "super-slow",
    }),
  ).toBe(false)
})

test("a slow panel shows the scan for ten repaints", () => {
  expect(
    getIsScanShowing({
      lastScan: scan,
      now: 125_000,
      scanSeconds: 15,
      repaint: "slow",
    }),
  ).toBe(true)
  expect(
    getIsScanShowing({
      lastScan: scan,
      now: 130_000,
      scanSeconds: 15,
      repaint: "slow",
    }),
  ).toBe(false)
})

test("a scan that earns points counts up, reaches the goal, or earns a bonus", () => {
  const kid = {
    id: "robin",
    name: "Robin",
    pointsToday: 400,
    goal: 400,
  }
  expect(
    getScanMotion({ kid, scan: { ...scan, points: 20 } }),
  ).toBe("goal")
  expect(
    getScanMotion({
      kid: { ...kid, pointsToday: 380 },
      scan: { ...scan, points: 20 },
    }),
  ).toBe("count")
  expect(
    getScanMotion({
      kid: { ...kid, pointsToday: 420 },
      scan: { ...scan, points: 20 },
    }),
  ).toBe("bonus")
  expect(
    getScanMotion({
      kid: { ...kid, goal: undefined },
      scan,
    }),
  ).toBe("count")
  expect(
    getScanMotion({
      kid,
      scan: { ...scan, result: "refused", points: 0 },
    }),
  ).toBe("none")
})

test("confetti and stars are the same pattern every time", () => {
  expect(getConfettiPieces(36)).toEqual(
    getConfettiPieces(36),
  )
  expect(getConfettiPieces(36)).toHaveLength(36)
  expect(
    new Set(
      getConfettiPieces(36).map((piece) => piece.color),
    ).size,
  ).toBe(6)
  expect(getStarBurst(10)).toHaveLength(10)
})

test("the scan window setting falls back when it is missing or out of range", () => {
  expect(readScanSeconds({ scanSeconds: "30" })).toBe(30)
  expect(readScanSeconds({ scanSeconds: -1 })).toBe(
    DEFAULT_SCAN_SECONDS,
  )
  expect(readScanSeconds(undefined)).toBe(
    DEFAULT_SCAN_SECONDS,
  )
})

test("each scan result has its own headline", () => {
  expect(getScanText(scan)).toEqual({
    headline: "+10",
    detail: "Feed the Cat",
  })
  expect(
    getScanText({
      ...scan,
      result: "refused",
      points: 0,
      message: "Try again after lunch.",
    }),
  ).toEqual({
    headline: "Not counted",
    detail: "Try again after lunch.",
  })
  expect(
    getScanText({ ...scan, result: "started", points: 0 }),
  ).toEqual({
    headline: "Timer started",
    detail: "Feed the Cat",
  })
  expect(
    getScanText({ ...scan, result: "stopped", points: 0 })
      .headline,
  ).toBe("Timer stopped")
})

test("the goal bar stops at full and is absent without a goal", () => {
  expect(
    getGoalPercent({
      id: "robin",
      name: "Robin",
      pointsToday: 600,
      goal: 500,
    }),
  ).toBe(100)
  expect(
    getGoalPercent({
      id: "robin",
      name: "Robin",
      pointsToday: 125,
      goal: 500,
    }),
  ).toBe(25)
  expect(
    getGoalPercent({
      id: "robin",
      name: "Robin",
      pointsToday: 125,
    }),
  ).toBe(undefined)
})
