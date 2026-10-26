import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import type { ServerToClientMessage } from "@castkit/shared/protocol/ws"
import { describe, expect, test } from "vitest"
import {
  createStreamFrameCache,
  readStreamDestinations,
  STREAM_TARGETS_SCRIPT,
  type StreamDestination,
} from "./streamFrames.ts"

type DeviceSnapshot = Extract<
  ServerToClientMessage,
  { type: "snapshot" }
>

const MINUTE = 60_000
const NOW = Date.UTC(2026, 9, 26, 15, 30, 10)

const buildPanelSnapshot = ({
  deviceId = "panel-one",
  view = "now-playing",
  title = "First Song",
  positionSeconds = 12,
}: {
  deviceId?: string
  view?: string
  title?: string
  positionSeconds?: number
} = {}) =>
  ({
    type: "snapshot",
    device: {
      id: deviceId,
      label: `Label of ${deviceId}`,
      width: 480,
      height: 480,
      shape: "square",
      hasTouch: true,
      color: "full",
      leftSwipeViewId: "kids-points",
      preloadViewIds: [deviceId],
      views: [
        "now-playing",
        "queue",
        "calendar",
        "ambient",
      ].map((clientId) => ({ name: clientId, clientId })),
    },
    settings: { theme: "dark" },
    view,
    displayTarget: null,
    data: {
      nowPlaying: {
        artist: "Artist",
        title,
        isPlaying: true,
        artworkPath: `/d/${deviceId}/artwork/abc`,
        positionSeconds,
        positionUpdatedAtMs: NOW - positionSeconds * 1000,
        durationSeconds: 200,
      },
      agenda: {
        events: [
          {
            title: "Later",
            startMs: NOW + 60 * MINUTE,
            isAllDay: false,
          },
        ],
      },
    },
    buildId: "build-1",
  }) as unknown as DeviceSnapshot

const readContents = ({
  snapshot,
  nowMs = NOW,
  learned,
}: {
  snapshot: DeviceSnapshot
  nowMs?: number
  learned?: { kind: "view"; id: string }
}) =>
  Object.fromEntries(
    readStreamDestinations({
      snapshot,
      nowMs,
      readLearnedTarget: () => learned,
      readPlatformContent: (target) => ({
        content: `points:${target.id}`,
        isTimeDriven: false,
        channelIds: ["points-channel"],
      }),
    }).map((destination) => [
      destination.viewId,
      destination.content,
    ]),
  )

describe("readStreamDestinations", () => {
  test("lists each swipe destination with the view it renders", () => {
    const destinations = readStreamDestinations({
      snapshot: buildPanelSnapshot(),
      nowMs: NOW,
      readLearnedTarget: () => undefined,
      readPlatformContent: () => undefined,
    })
    expect(
      destinations.map(({ viewId, snapshot }) => [
        viewId,
        snapshot.view,
        snapshot.displayTarget,
      ]),
    ).toEqual([
      ["queue", "queue", null],
      ["calendar", "calendar", null],
      ["now-playing", "now-playing", null],
    ])
  })

  test("two panels that differ only in name share every key", () => {
    expect(
      readContents({
        snapshot: buildPanelSnapshot({
          deviceId: "panel-one",
        }),
      }),
    ).toEqual(
      readContents({
        snapshot: buildPanelSnapshot({
          deviceId: "panel-two",
        }),
      }),
    )
  })

  test("Now Playing's progress does not change a key, and its track does", () => {
    const playing = readContents({
      snapshot: buildPanelSnapshot(),
    })
    expect(
      readContents({
        snapshot: buildPanelSnapshot({
          positionSeconds: 95,
        }),
      }),
    ).toEqual(playing)
    expect(
      readContents({
        snapshot: buildPanelSnapshot({
          title: "Second Song",
        }),
      })["now-playing"],
    ).not.toBe(playing["now-playing"])
  })

  test("a clock view's key moves with the minute and the queue's does not", () => {
    const now = readContents({
      snapshot: buildPanelSnapshot(),
    })
    const nextMinute = readContents({
      snapshot: buildPanelSnapshot(),
      nowMs: NOW + MINUTE,
    })
    expect(nextMinute.calendar).not.toBe(now.calendar)
    expect(nextMinute.queue).toBe(now.queue)
    expect(nextMinute["now-playing"]).toBe(
      now["now-playing"],
    )
  })

  test("the left-swipe view is drawn only once the house showed which target it opens", () => {
    expect(
      readContents({ snapshot: buildPanelSnapshot() }),
    ).not.toHaveProperty("kids-points")
    const [points] = readStreamDestinations({
      snapshot: buildPanelSnapshot(),
      nowMs: NOW,
      readLearnedTarget: (requested) =>
        requested === "kids-points"
          ? { kind: "view", id: "points-for-this-room" }
          : undefined,
      readPlatformContent: () => ({
        content: "points",
        isTimeDriven: false,
        channelIds: ["points-channel"],
      }),
    }).filter(({ viewId }) => viewId === "kids-points")
    expect(points?.snapshot.displayTarget).toEqual({
      kind: "view",
      id: "points-for-this-room",
    })
    expect(points?.channelIds).toEqual(["points-channel"])
  })
})

const buildDestination = (
  viewId: string,
  content: string,
): StreamDestination => ({
  viewId,
  content,
  snapshot: buildPanelSnapshot({ view: viewId }),
})

const startCache = ({
  destinationsByDevice,
  captureMilliseconds = 0,
  failures = new Set<string>(),
}: {
  destinationsByDevice: Map<string, StreamDestination[]>
  captureMilliseconds?: number
  failures?: Set<string>
}) => {
  const clock = { now: NOW }
  const captures: string[] = []
  const cache = createStreamFrameCache({
    readDestinations: (deviceId) =>
      destinationsByDevice.get(deviceId),
    capture: async ({ destination }) => {
      captures.push(destination.content)
      await new Promise((resolve) =>
        setTimeout(resolve, captureMilliseconds),
      )
      if (failures.has(destination.content)) {
        throw new Error("page never settled")
      }
      return {
        png: Buffer.from(destination.content),
        targets: [],
      }
    },
    now: () => clock.now,
    debounceMilliseconds: 1,
    retryMilliseconds: MINUTE,
  })
  return { cache, captures, clock }
}

const settle = () =>
  new Promise((resolve) => setTimeout(resolve, 20))

describe("createStreamFrameCache", () => {
  test("identical panels share one render and one buffer", async () => {
    const shared = [
      buildDestination("queue", "queue-a"),
      buildDestination("calendar", "calendar-a"),
    ]
    const { cache, captures } = startCache({
      destinationsByDevice: new Map([
        ["panel-one", shared],
        ["panel-two", shared],
      ]),
    })
    cache.subscribe("panel-one")
    cache.subscribe("panel-two")
    await settle()
    expect(captures).toEqual(["queue-a", "calendar-a"])
    expect(cache.read("panel-one", "queue")?.png).toBe(
      cache.read("panel-two", "queue")?.png,
    )
    expect(cache.readIndex("panel-one")).toEqual(
      cache.readIndex("panel-two"),
    )
    cache.dispose()
  })

  test("only a changed key renders again, and the old frame is released", async () => {
    const destinationsByDevice = new Map([
      [
        "panel-one",
        [
          buildDestination("queue", "queue-a"),
          buildDestination("now-playing", "song-a"),
        ],
      ],
    ])
    const { cache, captures } = startCache({
      destinationsByDevice,
    })
    cache.subscribe("panel-one")
    await settle()
    const firstTag = cache.readIndex("panel-one").tag
    destinationsByDevice.set("panel-one", [
      buildDestination("queue", "queue-a"),
      buildDestination("now-playing", "song-b"),
    ])
    cache.markChanged("panel-one")
    await settle()
    expect(captures).toEqual([
      "queue-a",
      "song-a",
      "song-b",
    ])
    expect(cache.getStats().entries).toBe(2)
    expect(
      cache
        .read("panel-one", "now-playing")
        ?.png.toString(),
    ).toBe("song-b")
    expect(cache.readIndex("panel-one").tag).not.toBe(
      firstTag,
    )
    cache.dispose()
  })

  test("a held index request answers when a frame is drawn", async () => {
    const { cache } = startCache({
      destinationsByDevice: new Map([
        [
          "panel-one",
          [buildDestination("queue", "queue-a")],
        ],
      ]),
      captureMilliseconds: 30,
    })
    const empty = await cache.waitForIndex({
      deviceId: "panel-one",
      after: undefined,
      timeoutMilliseconds: 1000,
    })
    expect(empty.frames).toEqual([])
    const index = await cache.waitForIndex({
      deviceId: "panel-one",
      after: empty.tag,
      timeoutMilliseconds: 1000,
    })
    expect(index.frames.map(({ view }) => view)).toEqual([
      "queue",
    ])
    const unchanged = await cache.waitForIndex({
      deviceId: "panel-one",
      after: index.tag,
      timeoutMilliseconds: 20,
    })
    expect(unchanged.tag).toBe(index.tag)
    cache.dispose()
  })

  test("an aborted index request stops waiting", async () => {
    const { cache } = startCache({
      destinationsByDevice: new Map([["panel-one", []]]),
    })
    const { tag } = cache.readIndex("panel-one")
    const controller = new AbortController()
    const waiting = cache.waitForIndex({
      deviceId: "panel-one",
      after: tag,
      timeoutMilliseconds: 60_000,
      signal: controller.signal,
    })
    controller.abort()
    expect((await waiting).tag).toBe(tag)
    cache.dispose()
  })

  test("a failed render is not retried within the retry window", async () => {
    const { cache, captures, clock } = startCache({
      destinationsByDevice: new Map([
        [
          "panel-one",
          [buildDestination("queue", "broken")],
        ],
      ]),
      failures: new Set(["broken"]),
    })
    cache.subscribe("panel-one")
    await settle()
    cache.markChanged("panel-one")
    await settle()
    expect(captures).toEqual(["broken"])
    clock.now += MINUTE
    cache.markChanged("panel-one")
    await settle()
    expect(captures).toEqual(["broken", "broken"])
    expect(cache.read("panel-one", "queue")).toBeUndefined()
    cache.dispose()
  })

  test("a panel nobody listens for costs nothing", async () => {
    const { cache, captures } = startCache({
      destinationsByDevice: new Map([
        [
          "panel-one",
          [buildDestination("queue", "queue-a")],
        ],
      ]),
    })
    cache.markChanged("panel-one")
    await settle()
    expect(captures).toEqual([])
    expect(cache.getStats()).toEqual({
      devices: 0,
      entries: 0,
      bytes: 0,
      queued: 0,
    })
    cache.dispose()
  })
})

test("the capture reads touch targets with the worker's own script", () => {
  const worker = readFileSync(
    fileURLToPath(
      new URL(
        "../../../../device-client/remote-display/worker.py",
        import.meta.url,
      ),
    ),
    "utf8",
  )
  const [, script] =
    /TARGETS_SCRIPT = """([\s\S]*?)"""/.exec(worker) ?? []
  expect(script).toBe(STREAM_TARGETS_SCRIPT)
})
