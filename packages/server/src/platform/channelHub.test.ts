import { afterEach, expect, test, vi } from "vitest"
import { createChannelHub } from "./channelHub.ts"
import { normalizeMqttPayload } from "./sources/mqtt.ts"

afterEach(() => vi.useRealTimers())
const channel = {
  id: "points",
  name: "Points",
  sourceId: "mqtt",
  type: "points.v1",
  settings: { staleAfterSeconds: 2 },
}
test("malformed data retains the last valid snapshot and reports an error", () => {
  const hub = createChannelHub()
  hub.configure([channel])
  hub.publish({
    channelId: "points",
    data: {
      name: "Player",
      total: 12,
      privateField: "omit",
    },
  })
  expect(hub.get("points")?.data).toEqual({
    name: "Player",
    total: 12,
  })
  hub.publish({
    channelId: "points",
    data: { total: "invalid" },
  })
  expect(hub.get("points")?.status).toBe("error")
  expect(hub.get("points")?.data).toEqual({
    name: "Player",
    total: 12,
  })
  hub.dispose()
})
test("channel updates cannot be mutated by readers and unsubscribe removes listeners", () => {
  const hub = createChannelHub()
  hub.configure([channel])
  const first = vi.fn((snapshot) => {
    snapshot.data.total = 99
  })
  const second = vi.fn()
  const unsubscribe = hub.subscribe(first)
  hub.subscribe(second)
  hub.publish({
    channelId: "points",
    data: { name: "Player", total: 4 },
  })
  expect(second.mock.calls[0]?.[0].data.total).toBe(4)
  expect(hub.get("points")?.data).toEqual({
    name: "Player",
    total: 4,
  })
  unsubscribe()
  hub.publish({
    channelId: "points",
    data: { name: "Player", total: 5 },
  })
  expect(first).toHaveBeenCalledTimes(1)
  hub.dispose()
})
test("stale channels recover with a fresh update and removed channels disappear", () => {
  vi.useFakeTimers()
  const hub = createChannelHub()
  hub.configure([channel])
  hub.publish({
    channelId: "points",
    data: { name: "Player", total: 4 },
  })
  vi.advanceTimersByTime(3000)
  expect(hub.get("points")?.status).toBe("stale")
  hub.publish({
    channelId: "points",
    data: { name: "Player", total: 6 },
  })
  expect(hub.get("points")?.status).toBe("ready")
  hub.configure([])
  expect(hub.list()).toEqual([])
  hub.dispose()
})

test("points can report a daily result without inventing an account total", () => {
  const hub = createChannelHub()
  hub.configure([channel])
  hub.publish({
    channelId: "points",
    data: { name: "Player", pointsToday: 0, awarded: 0 },
  })
  expect(hub.get("points")?.status).toBe("ready")
  expect(hub.get("points")?.data).toEqual({
    name: "Player",
    pointsToday: 0,
    awarded: 0,
  })
  hub.publish({
    channelId: "points",
    data: { name: "Player", awarded: 5 },
  })
  expect(hub.get("points")?.status).toBe("error")
  hub.dispose()
})

test("an unavailable custom contract reports an error without stopping built-in channels", () => {
  const hub = createChannelHub()
  hub.configure([
    channel,
    { ...channel, id: "missing", type: "unavailable.v1" },
  ])
  expect(hub.get("missing")).toMatchObject({
    status: "error",
    data: null,
  })
  hub.publish({
    channelId: "points",
    data: { name: "Player", total: 5 },
  })
  expect(hub.get("points")?.status).toBe("ready")
  hub.publish({ channelId: "missing", data: {} })
  expect(hub.get("missing")?.status).toBe("error")
  hub.dispose()
})
test("a points board does not go stale between scans", () => {
  vi.useFakeTimers()
  const hub = createChannelHub()
  hub.configure([
    {
      id: "board",
      name: "Board",
      sourceId: "source",
      type: "kids-points.v1",
      settings: {},
    },
  ])
  hub.publish({
    channelId: "board",
    data: {
      kids: [
        { id: "robin", name: "Robin", pointsToday: 10 },
      ],
    },
  })
  vi.advanceTimersByTime(3_600_000)
  expect(hub.get("board")?.status).toBe("ready")
  hub.dispose()
})

test("a malformed AI usage mark is dropped and the usage beside it is kept, by MQTT or by a direct publish", () => {
  /*
   * A snapshot already in contract shape, with one good mark and one whose
   * zero-width view box draws nothing. It must stay canonical, so neither
   * ingress path rejects it or reads it as the producer's raw format.
   */
  const data = {
    providers: [
      {
        id: "gemini",
        name: "Gemini",
        mark: {
          viewBox: "0 0 24 24",
          paths: [{ d: "M12 0L24 12Z" }],
        },
        isOk: true,
        windows: [
          {
            id: "weekly",
            label: "Weekly",
            percentUsed: 31,
          },
        ],
      },
      {
        id: "claude",
        name: "Claude",
        mark: {
          viewBox: "0 0 0 16",
          paths: [{ d: "M1 1Z" }],
        },
        isOk: true,
        windows: [
          {
            id: "weekly",
            label: "Weekly",
            percentUsed: 54,
          },
        ],
      },
    ],
    fetchedAtMs: 1_900_000_000_000,
  }
  const usageChannel = {
    id: "usage",
    name: "Usage",
    sourceId: "mqtt",
    type: "ai-usage.v1",
    settings: {},
  }
  const viaMqtt = normalizeMqttPayload({
    type: "ai-usage.v1",
    data,
  })
  ;[viaMqtt, data].forEach((payload) => {
    const hub = createChannelHub()
    hub.configure([usageChannel])
    hub.publish({ channelId: "usage", data: payload })
    const snapshot = hub.get("usage")
    expect(snapshot?.status).toBe("ready")
    const usage = snapshot?.data as {
      providers: {
        id: string
        mark?: unknown
        windows: { percentUsed?: number }[]
      }[]
      fetchedAtMs?: number
    }
    expect(usage.fetchedAtMs).toBe(1_900_000_000_000)
    expect(
      usage.providers.map(({ id, mark, windows }) => ({
        id,
        mark,
        percentUsed: windows[0]?.percentUsed,
      })),
    ).toEqual([
      {
        id: "gemini",
        mark: {
          viewBox: "0 0 24 24",
          paths: [{ d: "M12 0L24 12Z" }],
        },
        percentUsed: 31,
      },
      { id: "claude", mark: undefined, percentUsed: 54 },
    ])
  })
})
