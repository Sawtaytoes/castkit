import { expect, test } from "vitest"
import {
  chooseTimerLayout,
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
