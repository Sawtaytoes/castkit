import type { ChannelSnapshot } from "@castkit/sdk/contracts"
import { describe, expect, test } from "vitest"
import { readRequestFrameKey } from "./requestFrameKey.ts"

const NOW = Date.UTC(2026, 9, 23, 15, 0, 0)
const MINUTE = 60_000

/** One watch showing one platform view, with the channels the test supplies. */
const createWatchPlatform = ({
  specId,
  settings = {},
  channel,
  size = { width: 200, height: 200 },
  hasTarget = true,
}: {
  specId: string
  settings?: Record<string, unknown>
  channel: ChannelSnapshot
  size?: { width: number; height: number }
  hasTarget?: boolean
}) => {
  const channels = { value: { [channel.id]: channel } }
  const platform = {
    getDeviceTarget: () =>
      hasTarget
        ? { kind: "screen" as const, id: "watch" }
        : undefined,
    getTarget: () => ({
      view: {
        id: "watch-view",
        name: "Watch",
        panels: [
          {
            id: "panel",
            specId,
            bindings: { data: channel.id },
            settings,
          },
        ],
      },
      screen: undefined,
    }),
    getDeviceProperties: () => ({
      ...size,
      repaint: "slow" as const,
    }),
    channelsForView: () => channels.value,
  }
  return {
    channels,
    read: (now: number) =>
      readRequestFrameKey({
        platform: platform as never,
        deviceId: "watch",
        now,
      }),
  }
}

const kidsPoints = (data: unknown): ChannelSnapshot => ({
  id: "kids-points/watch",
  type: "kids-points.v1",
  status: "ready",
  data,
})

const KID = {
  id: "kid",
  name: "Kid",
  pointsToday: 12,
}

describe("readRequestFrameKey — kids points", () => {
  test("a totals list is the same frame until the points change", () => {
    const watch = createWatchPlatform({
      specId: "kids-points",
      settings: { isTotalsOnly: true },
      channel: kidsPoints({ kids: [KID] }),
    })
    const firstKey = watch.read(NOW)

    expect(firstKey).toBeDefined()
    expect(watch.read(NOW + 6 * 60 * MINUTE)).toBe(firstKey)

    watch.channels.value = {
      "kids-points/watch": kidsPoints({
        kids: [{ ...KID, pointsToday: 13 }],
      }),
    }
    expect(watch.read(NOW)).not.toBe(firstKey)
  })

  test("a scan banner keeps nothing until it has expired", () => {
    const watch = createWatchPlatform({
      specId: "kids-points",
      settings: { scanSeconds: 30 },
      channel: kidsPoints({
        kids: [KID],
        lastScan: {
          kidId: "kid",
          result: "awarded",
          points: 1,
          atMs: NOW,
        },
      }),
    })

    expect(watch.read(NOW + 10_000)).toBeUndefined()
    expect(watch.read(NOW + 5 * MINUTE)).toBeDefined()
  })

  test("a running timer keeps nothing, because it counts minutes", () => {
    const watch = createWatchPlatform({
      specId: "kids-points",
      channel: kidsPoints({
        kids: [
          {
            ...KID,
            activeTask: {
              name: "Reading",
              startedAtMs: NOW - 5 * MINUTE,
              reader: "desk",
            },
          },
        ],
      }),
    })

    expect(watch.read(NOW)).toBeUndefined()
  })
})

describe("readRequestFrameKey — agenda", () => {
  const agenda = createWatchPlatform({
    specId: "calendar",
    channel: {
      id: "watch/agenda",
      type: "agenda.v1",
      status: "ready",
      data: {
        events: [
          {
            startMs: NOW,
            summary: "Dentist",
            isAllDay: false,
          },
          {
            startMs: NOW + 120 * MINUTE,
            summary: "Practice",
            isAllDay: false,
          },
        ],
      },
    },
  })

  test("the frame holds while every event stays listed", () => {
    expect(agenda.read(NOW + 30 * MINUTE)).toBe(
      agenda.read(NOW),
    )
  })

  test("the frame changes when an event leaves the list an hour after it starts", () => {
    expect(agenda.read(NOW + 61 * MINUTE)).not.toBe(
      agenda.read(NOW),
    )
  })

  test("the short landscape panel draws a clock face, so it keeps nothing", () => {
    const shortPanel = createWatchPlatform({
      specId: "calendar",
      size: { width: 480, height: 320 },
      channel: {
        id: "watch/agenda",
        type: "agenda.v1",
        status: "ready",
        data: { events: [] },
      },
    })

    expect(shortPanel.read(NOW)).toBeUndefined()
  })
})

describe("readRequestFrameKey — nothing to keep", () => {
  test("a panel without a written-down time rule is treated as time-driven", () => {
    const watch = createWatchPlatform({
      specId: "clock",
      channel: kidsPoints({ kids: [KID] }),
    })

    expect(watch.read(NOW)).toBeUndefined()
  })

  test("a bound time channel is time-driven", () => {
    const watch = createWatchPlatform({
      specId: "kids-points",
      settings: { isTotalsOnly: true },
      channel: {
        id: "clock/time",
        type: "time.v1",
        status: "ready",
        data: { nowMs: NOW },
      },
    })

    expect(watch.read(NOW)).toBeUndefined()
  })

  test("a display on its own views has no platform frame", () => {
    const watch = createWatchPlatform({
      specId: "kids-points",
      settings: { isTotalsOnly: true },
      channel: kidsPoints({ kids: [KID] }),
      hasTarget: false,
    })

    expect(watch.read(NOW)).toBeUndefined()
  })
})
