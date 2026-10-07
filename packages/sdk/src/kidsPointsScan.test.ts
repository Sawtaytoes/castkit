import { expect, test } from "vitest"
import {
  getCountdownKid,
  getCountdownKids,
} from "./kidsPointsScan.ts"

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

const twoCountdowns = {
  kids: [
    kid,
    {
      ...kid,
      id: "sky",
      name: "Sky",
      activeTask: {
        ...task,
        startedAtMs: 20_000,
        goalMinutes: 10,
      },
    },
  ],
  lastScan: {
    ...data.lastScan,
    kidId: "sky",
    atMs: 20_000,
  },
  timerScans: [
    data.lastScan,
    { ...data.lastScan, kidId: "sky", atMs: 20_000 },
  ],
}

test("simultaneous countdowns survive another child's completion or cancellation", () => {
  expect(
    getCountdownKids({
      data: twoCountdowns,
      now: 70_000,
    }).map((entry) => entry.id),
  ).toEqual(["robin", "sky"])
  expect(
    getCountdownKids({
      data: twoCountdowns,
      now: 370_000,
    }).map((entry) => entry.id),
  ).toEqual(["sky"])
  const stopped = {
    ...twoCountdowns,
    timerScans: [data.lastScan],
    lastScan: {
      ...twoCountdowns.lastScan,
      result: "stopped" as const,
      atMs: 70_000,
    },
  }
  expect(
    getCountdownKid({ data: stopped, now: 90_000 })?.id,
  ).toBe("robin")
  expect(
    getCountdownKids({ data: stopped, now: 370_000 }),
  ).toEqual([])
})

test("a later unaccepted start does not activate an older channel scan", () => {
  expect(
    getCountdownKids({
      data: {
        ...twoCountdowns,
        lastScan: data.lastScan,
        timerScans: [data.lastScan],
      },
      now: 70_000,
    }).map((entry) => entry.id),
  ).toEqual(["robin"])
})
