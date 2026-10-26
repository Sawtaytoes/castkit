import { describe, expect, test } from "vitest"
import {
  getHasRemainingAgenda,
  getSwipeDestination,
  listSwipeDestinations,
} from "./swipeDestinations.ts"

const squarePanel = {
  views: [
    "touch-test",
    "ambient",
    "now-playing",
    "calendar",
    "queue",
  ].map((clientId) => ({ clientId })),
  leftSwipeViewId: "kids-points",
}

const printerPanel = {
  views: [
    "now-playing",
    "queue",
    "calendar",
    "ambient",
    "printer-status",
    "print-queue",
  ].map((clientId) => ({ clientId })),
  hasPrinterNavigation: true,
}

describe("getSwipeDestination", () => {
  test("down cycles Now Playing and Queue", () => {
    expect(
      getSwipeDestination({
        direction: "down",
        currentView: "now-playing",
        hasAgenda: false,
        device: squarePanel,
      }),
    ).toBe("queue")
    expect(
      getSwipeDestination({
        direction: "down",
        currentView: "calendar",
        hasAgenda: false,
        device: squarePanel,
      }),
    ).toBe("now-playing")
  })

  test("up opens the calendar only while an agenda remains", () => {
    expect(
      getSwipeDestination({
        direction: "up",
        currentView: "now-playing",
        hasAgenda: true,
        device: squarePanel,
      }),
    ).toBe("calendar")
    expect(
      getSwipeDestination({
        direction: "up",
        currentView: "now-playing",
        hasAgenda: false,
        device: squarePanel,
      }),
    ).toBe("ambient")
  })

  test("right reaches the printer views only on a printer panel", () => {
    expect(
      getSwipeDestination({
        direction: "right",
        currentView: "now-playing",
        hasAgenda: false,
        device: squarePanel,
      }),
    ).toBeUndefined()
    expect(
      getSwipeDestination({
        direction: "right",
        currentView: "printer-status",
        hasAgenda: false,
        device: printerPanel,
      }),
    ).toBe("print-queue")
  })

  test("left names the device's own view even when the device does not offer it", () => {
    expect(
      getSwipeDestination({
        direction: "left",
        currentView: "queue",
        hasAgenda: false,
        device: squarePanel,
      }),
    ).toBe("kids-points")
  })

  test("a view the device does not offer is never a destination", () => {
    expect(
      getSwipeDestination({
        direction: "down",
        currentView: "calendar",
        hasAgenda: false,
        device: { views: [{ clientId: "calendar" }] },
      }),
    ).toBeUndefined()
  })
})

describe("listSwipeDestinations", () => {
  test("lists the nearest destinations first, then the way back", () => {
    expect(
      listSwipeDestinations({
        currentView: "now-playing",
        hasAgenda: true,
        device: squarePanel,
        limit: 6,
      }),
    ).toEqual([
      "queue",
      "calendar",
      "kids-points",
      "now-playing",
    ])
  })

  test("stops at the limit", () => {
    expect(
      listSwipeDestinations({
        currentView: "now-playing",
        hasAgenda: false,
        device: printerPanel,
        limit: 3,
      }),
    ).toEqual(["queue", "ambient", "printer-status"])
  })
})

test("an event an hour past its start no longer counts as agenda", () => {
  const nowMs = Date.UTC(2026, 9, 26, 15)
  expect(
    getHasRemainingAgenda({
      events: [{ startMs: nowMs - 61 * 60 * 1000 }],
      nowMs,
    }),
  ).toBe(false)
  expect(
    getHasRemainingAgenda({
      events: [{ startMs: nowMs - 59 * 60 * 1000 }],
      nowMs,
    }),
  ).toBe(true)
  expect(
    getHasRemainingAgenda({
      events: [{ isAllDay: true, startMs: 0 }],
      nowMs,
    }),
  ).toBe(true)
})
