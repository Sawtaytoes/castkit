import type { ChannelDefinition } from "@castkit/sdk/contracts"
import { expect, test, vi } from "vitest"
import { sourceContext } from "./__fixtures__/sourceContext.ts"
import {
  createKidsPointsSource,
  isTopicMatch,
  normalizeKidScan,
  normalizeKidState,
} from "./kidsPoints.ts"

const channel = (
  id: string,
  settings: Record<string, unknown> = {},
): ChannelDefinition => ({
  id,
  name: id,
  sourceId: "source",
  type: "kids-points.v1",
  settings,
})

const producerState = (
  kid: string,
  kidName: string,
  pointsToday: number,
) =>
  JSON.stringify({
    kid,
    kidName,
    kidColor: "#336699",
    day: "2026-01-15",
    pointsToday,
    goal: 500,
    lastTask: null,
    runningSession: null,
    tasksDone: [],
    minutesToday: {},
    ts: 1_000,
  })

test("topic filters match one level for + and the rest for #", () => {
  expect(
    isTopicMatch({
      filter: "points/state/+",
      topic: "points/state/robin",
    }),
  ).toBe(true)
  expect(
    isTopicMatch({
      filter: "points/state/+",
      topic: "points/state/robin/extra",
    }),
  ).toBe(false)
  expect(
    isTopicMatch({
      filter: "points/#",
      topic: "points/state/robin",
    }),
  ).toBe(true)
  expect(
    isTopicMatch({
      filter: "points/resp/scan",
      topic: "points/resp/other",
    }),
  ).toBe(false)
})

test("a producer's state document becomes one child on the board", () => {
  expect(
    normalizeKidState({
      kid: "robin",
      kidName: "Robin",
      kidColor: "#336699",
      pointsToday: 120,
      goal: 500,
      lastTask: "Feed the Cat",
      runningSession: {
        task: "reading",
        taskName: "Reading",
        startedMs: 5_000,
      },
    }),
  ).toEqual({
    id: "robin",
    name: "Robin",
    color: "#336699",
    pointsToday: 120,
    goal: 500,
    lastTask: "Feed the Cat",
    activeTask: { name: "Reading", startedAtMs: 5_000 },
  })
  expect(normalizeKidState({ kid: "robin" })).toBe(
    undefined,
  )
})

test("a scan outcome is reduced to what a display draws differently", () => {
  expect(
    normalizeKidScan({
      kid: "robin",
      outcome: "award",
      points: 10,
      pointsToday: 130,
      goal: 500,
      taskName: "Feed the Cat",
      reader: "Hall Reader",
      ts: 9_000,
    })?.scan,
  ).toEqual({
    kidId: "robin",
    result: "awarded",
    points: 10,
    taskName: "Feed the Cat",
    reader: "Hall Reader",
    atMs: 9_000,
  })
  expect(
    normalizeKidScan({
      kid: "robin",
      outcome: "already-done",
      ts: 9_000,
    })?.scan.result,
  ).toBe("refused")
  expect(
    normalizeKidScan({
      kid: "robin",
      outcome: "session-start",
      ts: 9_000,
    })?.scan.result,
  ).toBe("started")
})

test("every child's retained state fills the board in name order", async () => {
  const context = sourceContext({
    channels: [channel("board")],
  })
  const source = createKidsPointsSource(context)
  await source.start?.()
  expect(context.mqtt.subscribe).toHaveBeenCalledWith(
    "points/state/+",
  )
  expect(context.mqtt.subscribe).toHaveBeenCalledWith(
    "points/resp/scan",
  )
  source.handleMqttMessage?.({
    topic: "points/state/sky",
    payload: producerState("sky", "Sky", 80),
  })
  source.handleMqttMessage?.({
    topic: "points/state/robin",
    payload: producerState("robin", "Robin", 120),
  })
  expect(context.publish).toHaveBeenLastCalledWith({
    channelId: "board",
    data: {
      kids: [
        {
          id: "robin",
          name: "Robin",
          color: "#336699",
          pointsToday: 120,
          goal: 500,
        },
        {
          id: "sky",
          name: "Sky",
          color: "#336699",
          pointsToday: 80,
          goal: 500,
        },
      ],
    },
  })
})

test("a room channel hears only its own reader, and the scan moves the total at once", async () => {
  const context = sourceContext({
    channels: [
      channel("hall", { readers: ["Hall Reader"] }),
      channel("kitchen", { readers: ["Kitchen Reader"] }),
    ],
  })
  const source = createKidsPointsSource(context)
  await source.start?.()
  source.handleMqttMessage?.({
    topic: "points/state/robin",
    payload: producerState("robin", "Robin", 120),
  })
  source.handleMqttMessage?.({
    topic: "points/resp/scan",
    payload: JSON.stringify({
      kid: "robin",
      kidName: "Robin",
      outcome: "award",
      points: 10,
      pointsToday: 130,
      goal: 500,
      taskName: "Feed the Cat",
      message: "Robin fed the cat.",
      reader: "Hall Reader",
      ts: 9_000,
    }),
  })
  const published = vi
    .mocked(context.publish)
    .mock.calls.map(([request]) => request)
  const hall = published.findLast(
    (request) => request.channelId === "hall",
  )
  const kitchen = published.findLast(
    (request) => request.channelId === "kitchen",
  )
  expect(hall?.data).toEqual({
    kids: [
      {
        id: "robin",
        name: "Robin",
        color: "#336699",
        pointsToday: 130,
        goal: 500,
        lastTask: "Feed the Cat",
      },
    ],
    lastScan: {
      kidId: "robin",
      result: "awarded",
      points: 10,
      taskName: "Feed the Cat",
      message: "Robin fed the cat.",
      reader: "Hall Reader",
      atMs: 9_000,
    },
  })
  expect(kitchen?.data).toEqual({
    kids: [
      {
        id: "robin",
        name: "Robin",
        color: "#336699",
        pointsToday: 130,
        goal: 500,
        lastTask: "Feed the Cat",
      },
    ],
  })
  expect(await source.discover?.()).toEqual({
    kids: [{ id: "robin", name: "Robin" }],
    readers: [{ id: "Hall Reader", name: "Hall Reader" }],
  })
})

test("a channel can narrow the board to some children", async () => {
  const context = sourceContext({
    channels: [channel("one", { kidIds: ["sky"] })],
  })
  const source = createKidsPointsSource(context)
  source.handleMqttMessage?.({
    topic: "points/state/robin",
    payload: producerState("robin", "Robin", 120),
  })
  source.handleMqttMessage?.({
    topic: "points/state/sky",
    payload: producerState("sky", "Sky", 80),
  })
  expect(context.publish).toHaveBeenLastCalledWith({
    channelId: "one",
    data: {
      kids: [
        {
          id: "sky",
          name: "Sky",
          color: "#336699",
          pointsToday: 80,
          goal: 500,
        },
      ],
    },
  })
})

test("unrelated topics and cleared retained topics are ignored, bad JSON is reported", () => {
  const context = sourceContext({
    channels: [channel("board")],
  })
  const source = createKidsPointsSource(context)
  source.handleMqttMessage?.({
    topic: "castkit/channels/other/set",
    payload: "not json",
  })
  source.handleMqttMessage?.({
    topic: "points/state/robin",
    payload: "",
  })
  expect(context.reportError).not.toHaveBeenCalled()
  source.handleMqttMessage?.({
    topic: "points/state/robin",
    payload: "not json",
  })
  expect(context.reportError).toHaveBeenCalledWith({
    channelId: "board",
    error: "The points payload is not valid JSON.",
  })
  expect(context.publish).not.toHaveBeenCalled()
})
