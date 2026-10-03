import { expect, test } from "vitest"
import { getCountdownKid } from "./kidsPointsScan.ts"

const task = {
  name: "Sitting Still",
  startedAtMs: 10_000,
  goalMinutes: 6,
  isCountdown: true,
}
const kid = {
  id: "robin",
  name: "Robin",
  pointsToday: 0,
  activeTask: task,
}
const data = {
  kids: [kid],
  lastScan: {
    kidId: "robin",
    result: "started" as const,
    points: 0,
    taskName: task.name,
    atMs: 10_000,
  },
}

test("a countdown stays active only for the accepted attempt until its target", () => {
  expect(getCountdownKid({ data, now: 70_000 })?.id).toBe(
    "robin",
  )
  expect(getCountdownKid({ data, now: 370_000 })).toBe(
    undefined,
  )
  expect(
    getCountdownKid({
      data: { ...data, lastScan: undefined },
      now: 70_000,
    }),
  ).toBe(undefined)
  expect(
    getCountdownKid({
      data: {
        ...data,
        kids: [
          {
            ...kid,
            activeTask: { ...task, startedAtMs: 80_000 },
          },
        ],
      },
      now: 90_000,
    }),
  ).toBe(undefined)
})
