import type { ViewDefinition } from "@castkit/sdk/contracts"
import { Hono } from "hono"
import { expect, test, vi } from "vitest"
import {
  readMediaAsset,
  sendCameraFrame,
} from "./cameraFrameRoute.ts"
import type { CameraFrameService } from "./cameraFrameService.ts"

const view = {
  id: "door",
  name: "Door",
  layout: "single",
  panels: [
    {
      id: "camera",
      specId: "camera-alert",
      bindings: {
        data: "door/video",
        snapshots: "door/still",
      },
      settings: { label: "Door" },
    },
  ],
} as unknown as ViewDefinition

const channelData: Record<string, unknown> = {
  "door/video": {
    cameras: [
      {
        name: "Door camera",
        url: "/api/platform/channels/door%2Fvideo/media/camera.door?kind=hls",
        format: "hls",
      },
    ],
  },
  "door/still": {
    cameras: [
      {
        name: "Door still",
        url: "/api/platform/channels/door%2Fstill/media/camera.still?kind=camera",
      },
    ],
  },
}

const createApp = (service: CameraFrameService) => {
  const app = new Hono()
  app.get("/frames/:channelId/:assetId", (context) =>
    sendCameraFrame({
      context,
      view,
      channelId: context.req.param("channelId"),
      assetId: context.req.param("assetId"),
      readChannelData: (id) => channelData[id],
      service,
    }),
  )
  return app
}

test("a media URL names its channel and asset", () => {
  expect(
    readMediaAsset(
      "/api/display/view/door/media/door%2Fstill/camera.still?kind=camera",
    ),
  ).toEqual({
    channelId: "door/still",
    assetId: "camera.still",
  })
  expect(
    readMediaAsset(
      "/api/platform/channels/door%2Fstill/media/camera.still?kind=camera",
    ),
  ).toEqual({
    channelId: "door/still",
    assetId: "camera.still",
  })
  expect(readMediaAsset(42)).toBeUndefined()
})

test("the panel's video and still channels and label feed the frame; the body is frame then patch", async () => {
  const waitForFrame = vi.fn(async () => ({
    sequence: 7,
    pixels: Buffer.alloc(8, 1),
    patch: { x: 0, y: 60, width: 480, height: 360 },
    body: Buffer.from([9, 9]),
    codec: "zlib" as const,
    layout: "abc",
    origin: "video" as const,
    receivedAt: 1000,
  }))
  const app = createApp({
    waitForFrame,
  } as unknown as CameraFrameService)
  const response = await app.request(
    "/frames/door%2Fvideo/camera.door?width=480&height=480&after=6",
  )
  expect(response.status).toBe(200)
  expect(waitForFrame).toHaveBeenCalledWith(
    expect.objectContaining({
      source: {
        video: {
          channelId: "door/video",
          assetId: "camera.door",
        },
        still: {
          channelId: "door/still",
          assetId: "camera.still",
        },
      },
      width: 480,
      height: 480,
      label: "Door",
      codec: "zlib",
      after: 6,
    }),
  )
  expect(
    response.headers.get("x-castkit-frame-codec"),
  ).toBe("zlib")
  expect(
    response.headers.get("x-castkit-frame-patch"),
  ).toBe("0,60,480,360")
  expect(
    response.headers.get("x-castkit-frame-pixels"),
  ).toBe("8")
  expect([
    ...new Uint8Array(await response.arrayBuffer()),
  ]).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 9, 9])
})

test("a board that decodes JPEG asks for it; any other codec name gets zlib", async () => {
  const waitForFrame = vi.fn(
    async ({ codec }: { codec: "zlib" | "jpeg" }) => ({
      sequence: 8,
      pixels: Buffer.alloc(8, 1),
      patch: { x: 0, y: 60, width: 480, height: 360 },
      body: Buffer.from([0xff, 0xd8]),
      codec,
      layout: "abc",
      origin: "video" as const,
      receivedAt: 1000,
    }),
  )
  const app = createApp({
    waitForFrame,
  } as unknown as CameraFrameService)
  const jpeg = await app.request(
    "/frames/door%2Fvideo/camera.door?width=480&height=480&codec=jpeg",
  )
  expect(jpeg.headers.get("x-castkit-frame-codec")).toBe(
    "jpeg",
  )
  const unknown = await app.request(
    "/frames/door%2Fvideo/camera.door?width=480&height=480&codec=webp",
  )
  expect(unknown.headers.get("x-castkit-frame-codec")).toBe(
    "zlib",
  )
})

test("no newer picture answers 204, and an unbounded size is refused", async () => {
  const app = createApp({
    waitForFrame: async () => undefined,
  } as unknown as CameraFrameService)
  expect(
    (
      await app.request(
        "/frames/door%2Fvideo/camera.door?width=480&height=480",
      )
    ).status,
  ).toBe(204)
  expect(
    (
      await app.request(
        "/frames/door%2Fvideo/camera.door?width=99999&height=480",
      )
    ).status,
  ).toBe(404)
  expect(
    (
      await app.request(
        "/frames/door%2Fstill/camera.still?width=480&height=480",
      )
    ).status,
  ).toBe(404)
})
