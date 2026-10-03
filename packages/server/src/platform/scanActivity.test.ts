import type {
  ChannelSnapshot,
  ViewDefinition,
} from "@castkit/sdk/contracts"
import { afterEach, expect, test, vi } from "vitest"
import { createScanActivity } from "./scanActivity.ts"

const view: ViewDefinition = {
  id: "monitor",
  name: "Monitor",
  layout: "single",
  theme: "auto",
  access: "public",
  isControlEnabled: false,
  panels: [
    {
      id: "points",
      specId: "kids-points",
      bindings: { data: "points" },
      settings: { scanSeconds: 30 },
    },
  ],
}
const scan = (atMs = Date.now()): ChannelSnapshot => ({
  id: "points",
  type: "kids-points.v1",
  status: "ready",
  data: {
    kids: [{ id: "robin", name: "Robin", pointsToday: 20 }],
    lastScan: {
      kidId: "robin",
      atMs,
      result: "awarded",
      points: 20,
    },
  },
})
afterEach(() => vi.useRealTimers())

test("a quiet broker still expires each configured scan window; duplicates do not extend it", () => {
  vi.useFakeTimers()
  vi.setSystemTime(1_000_000)
  const onExpire = vi.fn()
  const activity = createScanActivity({
    getViews: () => [
      view,
      {
        ...view,
        id: "brief",
        panels: [
          {
            ...view.panels[0]!,
            settings: { scanSeconds: 15 },
          },
        ],
      },
    ],
    onExpire,
  })
  const snapshot = scan()
  activity.observe(snapshot)
  vi.advanceTimersByTime(10_000)
  activity.observe(snapshot)
  vi.advanceTimersByTime(5_000)
  expect(onExpire).toHaveBeenCalledTimes(1)
  vi.advanceTimersByTime(15_000)
  expect(onExpire).toHaveBeenCalledTimes(2)
  activity.dispose()
})

test("a newer scan replaces old expiry timers; refresh and disposal cancel pending updates", () => {
  vi.useFakeTimers()
  vi.setSystemTime(1_000_000)
  const onExpire = vi.fn()
  const activity = createScanActivity({
    getViews: () => [view],
    onExpire,
  })
  activity.observe(scan())
  vi.advanceTimersByTime(10_000)
  activity.observe(scan())
  vi.advanceTimersByTime(20_000)
  expect(onExpire).not.toHaveBeenCalled()
  vi.advanceTimersByTime(10_000)
  expect(onExpire).toHaveBeenCalledOnce()
  activity.observe(scan())
  activity.refresh([])
  vi.advanceTimersByTime(30_000)
  expect(onExpire).toHaveBeenCalledOnce()
  activity.observe(scan())
  activity.dispose()
  vi.advanceTimersByTime(30_000)
  expect(onExpire).toHaveBeenCalledOnce()
})
