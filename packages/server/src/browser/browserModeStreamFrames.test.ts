import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Hono } from "hono"
import { expect, test } from "vitest"
import { loadConfig } from "../config/env.ts"
import { createBrowserMode } from "./browserMode.ts"
import {
  createStreamFrameCache,
  readStreamDestinations,
} from "./streamFrames.ts"

const startPanels = () => {
  const directory = mkdtempSync(
    join(tmpdir(), "castkit-stream-frames-"),
  )
  const devicesFile = join(directory, "devices.json")
  const panel = (id: string, mac: string) => ({
    renderer: "browser",
    id,
    label: `Panel ${id}`,
    mac,
    width: 480,
    height: 480,
    hasTouch: true,
    views: ["Now Playing", "Queue", "Calendar", "Ambient"],
  })
  writeFileSync(
    devicesFile,
    JSON.stringify([
      panel("panel-one", "02:00:00:00:00:01"),
      panel("panel-two", "02:00:00:00:00:02"),
    ]),
  )
  const mode = createBrowserMode({
    config: loadConfig({
      INKCAST_DEVICES_FILE: devicesFile,
    }),
    publisher: {
      isEnabled: false,
      publish: async () => {},
      subscribe: async () => {},
      close: async () => {},
    },
    getGlobalClockConfig: () => ({
      isTwelveHour: false,
      isNumericDate: false,
    }),
  })
  const app = new Hono()
  const pages: string[] = []
  const streamFrames = createStreamFrameCache({
    readDestinations: (deviceId, nowMs) => {
      const snapshot = mode.readDeviceSnapshot(deviceId)
      return snapshot
        ? readStreamDestinations({
            snapshot,
            nowMs,
            readLearnedTarget: (requested) =>
              mode.readLearnedTarget(deviceId, requested),
            readPlatformContent: () => undefined,
          })
        : undefined
    },
    // The capture loads the page a real browser would, from this app.
    capture: async ({ deviceId, destination }) => {
      const capture = mode.openCapture({
        deviceId,
        snapshot: destination.snapshot,
      })
      try {
        const response = await app.request(
          `/d/${deviceId}?capture=${capture.token}`,
        )
        pages.push(await response.text())
        return {
          png: Buffer.from(
            `pixels of ${destination.viewId}`,
          ),
          targets: [
            {
              identity: `view-gesture:${destination.viewId}`,
              x: 0,
              y: 0,
              width: 480,
              height: 480,
              loading: false,
            },
          ],
        }
      } finally {
        capture.close()
      }
    },
    debounceMilliseconds: 1,
  })
  mode.attach(app, { streamFrames })
  return { app, mode, pages, streamFrames }
}

/** Hold index requests open, as a worker does, until `count` frames are ready. */
const waitForFrames = async ({
  app,
  deviceId,
  count,
  after,
}: {
  app: Hono
  deviceId: string
  count: number
  after?: string
}): Promise<{
  tag: string
  frames: { view: string; key: string }[]
}> => {
  const index = await (
    await app.request(
      `/d/${deviceId}/stream-frames${after ? `?after=${after}` : ""}`,
    )
  ).json()
  return index.frames.length >= count
    ? index
    : waitForFrames({
        app,
        deviceId,
        count,
        after: index.tag,
      })
}

test("the manifest names the stream-frame index", async () => {
  const { app, streamFrames } = startPanels()
  const manifest = await (
    await app.request("/d/panel-one/castkit.json")
  ).json()
  expect(manifest.stream_frames_url).toBe(
    "/d/panel-one/stream-frames",
  )
  streamFrames.dispose()
})

test("a listening worker gets every destination drawn from its own capture page", async () => {
  const { app, pages, streamFrames } = startPanels()
  const index = await waitForFrames({
    app,
    deviceId: "panel-one",
    count: 3,
  })
  // Now Playing is the first view: down opens the Queue, up the ambient clock
  // (no agenda), and the way back is Now Playing again.
  expect(
    index.frames.map(({ view }: { view: string }) => view),
  ).toEqual(["queue", "ambient", "now-playing"])
  expect(pages).toHaveLength(3)
  expect(pages[0]).toContain('"view":"queue"')
  const frame = await (
    await app.request("/d/panel-one/stream-frame/queue")
  ).json()
  expect(frame).toEqual({
    key: index.frames[0].key,
    view: "queue",
    targets: [
      {
        identity: "view-gesture:queue",
        x: 0,
        y: 0,
        width: 480,
        height: 480,
        loading: false,
      },
    ],
    png: Buffer.from("pixels of queue").toString("base64"),
  })
  streamFrames.dispose()
})

test("a second identical panel shares the first one's frames", async () => {
  const { app, pages, streamFrames } = startPanels()
  const one = await waitForFrames({
    app,
    deviceId: "panel-one",
    count: 3,
  })
  const two = await waitForFrames({
    app,
    deviceId: "panel-two",
    count: 3,
  })
  expect(pages).toHaveLength(3)
  expect(two.frames).toEqual(one.frames)
  streamFrames.dispose()
})

test("a capture token opens only its own panel's page, and only while it is open", async () => {
  const { app, mode, streamFrames } = startPanels()
  const snapshot = mode.readDeviceSnapshot("panel-one")
  if (!snapshot) throw new Error("no snapshot")
  const capture = mode.openCapture({
    deviceId: "panel-one",
    snapshot: { ...snapshot, view: "calendar" },
  })
  expect(
    (
      await app.request(
        `/d/panel-two?capture=${capture.token}`,
      )
    ).status,
  ).toBe(404)
  expect(
    await (
      await app.request(
        `/d/panel-one?capture=${capture.token}`,
      )
    ).text(),
  ).toContain('"view":"calendar"')
  capture.close()
  expect(
    (
      await app.request(
        `/d/panel-one?capture=${capture.token}`,
      )
    ).status,
  ).toBe(404)
  streamFrames.dispose()
})

test("a server that draws nothing ahead answers 404, and the worker keeps its live path", async () => {
  const directory = mkdtempSync(
    join(tmpdir(), "castkit-stream-frames-off-"),
  )
  const devicesFile = join(directory, "devices.json")
  writeFileSync(
    devicesFile,
    JSON.stringify([
      {
        renderer: "browser",
        id: "panel-one",
        label: "Panel",
        mac: "02:00:00:00:00:01",
        width: 480,
        height: 480,
      },
    ]),
  )
  const mode = createBrowserMode({
    config: loadConfig({
      INKCAST_DEVICES_FILE: devicesFile,
    }),
    publisher: {
      isEnabled: false,
      publish: async () => {},
      subscribe: async () => {},
      close: async () => {},
    },
    getGlobalClockConfig: () => ({
      isTwelveHour: false,
      isNumericDate: false,
    }),
  })
  const app = new Hono()
  mode.attach(app)
  expect(
    await (
      await app.request("/d/panel-one/castkit.json")
    ).json(),
  ).not.toHaveProperty("stream_frames_url")
  expect(
    (await app.request("/d/panel-one/stream-frames"))
      .status,
  ).toBe(404)
})
