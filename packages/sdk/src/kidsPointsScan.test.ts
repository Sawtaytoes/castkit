import { expect, test } from "vitest"
import {
  getCountdownKid,
  getCountdownKids,
  getRunningKids,
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

test("count-up timers survive their goal and restart, but stop at the matching terminal scan", () => {
  const running = {
    kids: [
      {
        id: "robin",
        name: "Robin",
        pointsToday: 100,
        activeTask: {
          name: "Instrument Practice",
          startedAtMs: 1000,
          reader: "Practice Reader",
          isCountdown: false,
          goalMinutes: 30,
          bankedMinutes: 27,
        },
      },
    ],
  }
  expect(
    getRunningKids({ data: running, now: 61_000 }).map(
      (child) => child.id,
    ),
  ).toEqual(["robin"])
  expect(
    getRunningKids({ data: running, now: 3_601_000 }),
  ).toHaveLength(1)
  expect(
    getCountdownKids({ data: running, now: 61_000 }),
  ).toEqual([])
  const stopped = {
    ...running,
    lastScan: {
      kidId: "robin",
      result: "stopped" as const,
      taskName: "Instrument Practice",
      points: 0,
      atMs: 61_000,
    },
  }
  expect(
    getRunningKids({ data: stopped, now: 62_000 }),
  ).toEqual([])
  expect(
    getRunningKids({
      data: {
        ...stopped,
        lastScan: {
          ...stopped.lastScan,
          result: "awarded",
          taskName: "Feed the Cat",
        },
      },
      now: 62_000,
    }),
  ).toHaveLength(1)
  expect(
    getRunningKids({
      data: {
        ...running,
        kids: [
          {
            ...running.kids[0]!,
            activeTask: {
              ...running.kids[0]?.activeTask,
              startedAtMs: 100_000,
            },
          },
        ],
      },
      now: 61_000,
    }),
  ).toEqual([])
})
