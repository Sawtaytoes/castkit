import type { ChannelDefinition } from "@castkit/sdk/contracts"
import { afterEach, expect, test, vi } from "vitest"
import { sourceContext } from "./__fixtures__/sourceContext.ts"
import { createPointsHistorySource } from "./pointsHistory.ts"

const channel: ChannelDefinition = {
  id: "history",
  name: "History",
  sourceId: "source",
  type: "points-history.v1",
  settings: { days: 7, kidIds: ["robin"] },
}
const report = {
  version: 1,
  generatedAtMs: 1000,
  range: {
    fromDay: "2026-09-25",
    toDay: "2026-10-01",
    dayCount: 7,
    timezone: "America/Chicago",
    isPartial: true,
  },
  source: {
    name: "sqlite",
    isFallback: true,
    message: "Local ledger",
  },
  children: ["robin", "sky"].map((id) => ({
    id,
    name: id,
    color: "#336699",
    pointsToday: 10,
    goalToday: 100,
    lifetimeEarned: 400,
    spendable: 350,
    totals: {
      net: 10,
      previousNet: 20,
      averagePerCalendarDay: 10 / 7,
      averagePerActiveDay: 10,
      activeDays: 1,
      qualifyingDays: 0,
      bonusPercent: 0,
      pointsToPenaltyRatio: null,
    },
    days: [
      {
        day: "2026-10-01",
        goal: 100,
        net: 10,
        chores: 10,
        bonus: 0,
        penalty: 0,
        reversals: 0,
        cumulative: 10,
        minutes: {},
      },
    ],
    tasks: [],
    recordedTotals: [{ eventId: "private" }],
    overlaps: [{ awardId: "private" }],
    reason: "Private note",
  })),
}
afterEach(() => vi.useRealTimers())
test("subscribes before requesting producer-calculated history, filters children, and strips parent fields", async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-10-01T20:00:00Z"))
  const context = sourceContext({ channels: [channel] })
  const source = createPointsHistorySource(context)
  await source.start?.()
  expect(context.mqtt.subscribe).toHaveBeenCalledWith(
    "tally-marks/resp/reports/points",
  )
  const request = vi.mocked(context.mqtt.publish).mock
    .calls[0][0]
  const payload = JSON.parse(request.payload)
  expect(payload).toMatchObject({
    from: "2026-09-25",
    to: "2026-10-01",
  })
  expect(request.isRetained).toBe(false)
  source.handleMqttMessage?.({
    topic: "tally-marks/resp/reports/points",
    payload: JSON.stringify({ requestId: "other", report }),
  })
  expect(context.publish).not.toHaveBeenCalled()
  source.handleMqttMessage?.({
    topic: "tally-marks/resp/reports/points",
    payload: JSON.stringify({
      requestId: payload.requestId,
      report,
    }),
  })
  expect(context.publish).toHaveBeenCalledTimes(1)
  const value = vi.mocked(context.publish).mock.calls[0][0]
  expect(value.channelId).toBe("history")
  expect(JSON.stringify(value.data)).not.toContain(
    "private",
  )
  expect(JSON.stringify(value.data)).not.toContain(
    "Private note",
  )
  expect(
    (value.data as typeof report).children.map(
      (child) => child.id,
    ),
  ).toEqual(["robin"])
  source.dispose()
  expect(context.mqtt.unsubscribe).toHaveBeenCalledWith(
    "points/state/+",
  )
})
test("debounces ledger changes, reports unanswered requests, and clears timers on disposal", async () => {
  vi.useFakeTimers()
  const context = sourceContext({ channels: [channel] })
  const source = createPointsHistorySource(context)
  await source.start?.()
  await vi.advanceTimersByTimeAsync(12000)
  expect(context.reportError).toHaveBeenCalledWith({
    channelId: "history",
    error: expect.stringContaining("did not answer"),
  })
  source.handleMqttMessage?.({
    topic: "points/ledger",
    payload: "{}",
  })
  source.handleMqttMessage?.({
    topic: "points/ledger",
    payload: "{}",
  })
  await vi.advanceTimersByTimeAsync(500)
  expect(context.mqtt.publish).toHaveBeenCalledTimes(2)
  source.dispose()
  await vi.advanceTimersByTimeAsync(60000)
  expect(context.mqtt.publish).toHaveBeenCalledTimes(2)
})
test("invalid report replies become a source error rather than zero history", async () => {
  vi.useFakeTimers()
  const context = sourceContext({ channels: [channel] })
  const source = createPointsHistorySource(context)
  await source.start?.()
  const payload = JSON.parse(
    vi.mocked(context.mqtt.publish).mock.calls[0][0]
      .payload,
  )
  source.handleMqttMessage?.({
    topic: "tally-marks/resp/reports/points",
    payload: JSON.stringify({
      requestId: payload.requestId,
      report: {},
    }),
  })
  expect(context.publish).not.toHaveBeenCalled()
  expect(context.reportError).toHaveBeenCalledWith({
    channelId: "history",
    error: expect.stringContaining("valid history report"),
  })
  source.dispose()
})
