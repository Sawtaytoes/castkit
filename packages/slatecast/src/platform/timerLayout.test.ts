import { expect, test } from "vitest"
import {
  assignTimerHues,
  chooseTimerLayout,
  getTimerFraction,
  keepCancelingPlaces,
  rankTimers,
} from "./timerLayout.ts"

test("nearest running deadline wins ahead of paused timers", () => {
  const timer = (
    id: string,
    seconds: number,
    state = "active",
  ) => ({
    id,
    domain: "timer",
    name: id,
    state,
    attributes: {
      finishes_at: new Date(seconds * 1000).toISOString(),
    },
    actions: [],
  })
  expect(
    rankTimers([
      timer("paused", 1, "paused"),
      timer("later", 90),
      timer("first", 30),
    ]).map((entity) => entity.id),
  ).toEqual(["first", "later", "paused"])
})
test("small panels retain the first timer while large panels retain all", () => {
  expect(
    chooseTimerLayout({
      count: 4,
      width: 200,
      height: 200,
      hasControls: true,
    })?.visibleCount,
  ).toBe(1)
  expect(
    chooseTimerLayout({
      count: 4,
      width: 1024,
      height: 600,
      hasControls: true,
    })?.visibleCount,
  ).toBe(4)
})

test("a crowded source still keeps only the earliest timer on a tiny panel", () => {
  expect(
    chooseTimerLayout({
      count: 1000,
      width: 200,
      height: 200,
      hasControls: true,
    })?.visibleCount,
  ).toBe(1)
})

test("timers on screen get different colors that survive a revision change", () => {
  const ids = ["timer.a.r1", "timer.b.r1", "timer.c.r4"]
  const hues = assignTimerHues(ids)
  expect(new Set(hues.values()).size).toBe(3)
  const after = assignTimerHues([
    "timer.c.r4",
    "timer.a.r2",
    "timer.b.r1",
  ])
  expect(after.get("timer.a.r2")).toBe(
    hues.get("timer.a.r1"),
  )
  expect(after.get("timer.b.r1")).toBe(
    hues.get("timer.b.r1"),
  )
})
test("the fill follows the time left, and an unknown duration stays full", () => {
  const base = {
    id: "timer.a.r1",
    domain: "timer",
    name: "Tea",
    actions: [],
  }
  expect(
    getTimerFraction(
      {
        ...base,
        state: "active",
        attributes: {
          duration: "0:25:00",
          finishes_at: new Date(400_000).toISOString(),
        },
      },
      0,
    ),
  ).toBeCloseTo(400 / 1500)
  expect(
    getTimerFraction(
      {
        ...base,
        state: "paused",
        attributes: {
          duration: "0:20:00",
          remaining: "0:05:00",
        },
      },
      0,
    ),
  ).toBe(0.25)
  expect(
    getTimerFraction(
      {
        ...base,
        state: "active",
        attributes: {
          finishes_at: new Date(1000).toISOString(),
        },
      },
      0,
    ),
  ).toBe(1)
})
test("a timer being cancelled keeps its deadline's place", () => {
  const timer = (
    id: string,
    seconds: number,
    state: string,
  ) => ({
    id,
    domain: "timer",
    name: id,
    state,
    attributes: {
      finishes_at: new Date(seconds * 1000).toISOString(),
    },
    actions: [],
  })
  expect(
    rankTimers([
      timer("later", 90, "active"),
      timer("cancelled", 30, "canceling"),
    ]).map((entity) => entity.id),
  ).toEqual(["cancelled", "later"])
})

test("two timers with buttons sit side by side on square and landscape panels", () => {
  expect(
    chooseTimerLayout({
      count: 2,
      width: 480,
      height: 480,
      hasControls: true,
    })?.columns,
  ).toBe(2)
  expect(
    chooseTimerLayout({
      count: 2,
      width: 1024,
      height: 600,
      hasControls: true,
    })?.columns,
  ).toBe(2)
})

test("a cancelled timer keeps its place on screen whatever deadline it reports", () => {
  const timer = (
    id: string,
    state: string,
    finishesAt: number | null,
  ) => ({
    id,
    domain: "timer",
    name: id,
    state,
    attributes: {
      finishes_at:
        finishesAt === null
          ? null
          : new Date(finishesAt * 1000).toISOString(),
    },
    actions: [],
  })
  const place = (
    entities: ReturnType<typeof timer>[],
    previous: string[],
  ) =>
    keepCancelingPlaces(rankTimers(entities), previous).map(
      (entity) => entity.id,
    )
  // The first timer is cancelled and the source clears its deadline.
  expect(
    place(
      [
        timer("timer.first.r2", "canceling", null),
        timer("timer.second.r1", "active", 60),
        timer("timer.third.r1", "active", 90),
      ],
      ["timer.first", "timer.second", "timer.third"],
    ),
  ).toEqual([
    "timer.first.r2",
    "timer.second.r1",
    "timer.third.r1",
  ])
  // A paused timer keeps an old deadline that would rank it first.
  expect(
    place(
      [
        timer("timer.second.r1", "active", 60),
        timer("timer.third.r1", "active", 90),
        timer("timer.paused.r4", "canceling", 5),
      ],
      ["timer.second", "timer.third", "timer.paused"],
    ),
  ).toEqual([
    "timer.second.r1",
    "timer.third.r1",
    "timer.paused.r4",
  ])
  // A timer the screen has not shown yet keeps its ranked place.
  expect(
    place(
      [
        timer("timer.new.r3", "canceling", 30),
        timer("timer.second.r1", "active", 60),
      ],
      ["timer.second"],
    ),
  ).toEqual(["timer.new.r3", "timer.second.r1"])
})
