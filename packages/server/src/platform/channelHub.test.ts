import { afterEach, expect, test, vi } from "vitest"
import { createChannelHub } from "./channelHub.ts"

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
