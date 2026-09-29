import { expect, test } from "vitest"
import {
  DEFAULT_SCAN_SECONDS,
  getGoalPercent,
  getIsScanShowing,
  getKidsPointsLayout,
  getScanText,
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

test("a scan shows for its window, and never on a panel too slow to draw it in time", () => {
  const isValueFresh = () => true
  expect(
    getIsScanShowing({
      lastScan: scan,
      now: 110_000,
      scanSeconds: 15,
      isValueFresh,
    }),
  ).toBe(true)
  expect(
    getIsScanShowing({
      lastScan: scan,
      now: 115_000,
      scanSeconds: 15,
      isValueFresh,
    }),
  ).toBe(false)
  expect(
    getIsScanShowing({
      lastScan: scan,
      now: 97_000,
      scanSeconds: 15,
      isValueFresh,
    }),
  ).toBe(true)
  expect(
    getIsScanShowing({
      lastScan: scan,
      now: 110_000,
      scanSeconds: 15,
      isValueFresh: (lifetime) => lifetime >= 280_000,
    }),
  ).toBe(false)
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
