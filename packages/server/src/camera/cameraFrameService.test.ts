import sharp from "sharp"
import { afterEach, expect, test, vi } from "vitest"
import type { startCameraDecoder } from "./cameraDecoder.ts"
import type { RenderTextMask } from "./cameraFrameLayout.ts"
import { createCameraFrameService } from "./cameraFrameService.ts"
import type { DecodedPicture } from "./pamStream.ts"

const blankText: RenderTextMask = ({ width, height }) => ({
  width,
  height,
  coverage: new Uint8Array(width * height),
})

/** A synthetic 4:3 picture, one flat shade; never a camera frame. */
const syntheticPicture = (
  shade: number,
): DecodedPicture => ({
  width: 480,
  height: 360,
  rgb: Buffer.alloc(480 * 360 * 3, shade),
})

const videoSource = {
  video: {
    channelId: "door/video",
    assetId: "camera.door",
  },
}

/** A decoder the test drives by hand, standing in for ffmpeg. */
const createFakeDecoder = () => {
  const handle: {
    emit: (picture: DecodedPicture) => void
    end: (error?: Error) => void
    starts: number
    stop: ReturnType<typeof vi.fn>
  } = {
    emit: () => undefined,
    end: () => undefined,
    starts: 0,
    stop: vi.fn(),
  }
  const startDecoder = ((request) => {
    handle.starts += 1
    handle.emit = request.onPicture
    handle.end = request.onEnd
    return { stop: handle.stop }
  }) as typeof startCameraDecoder
  return { handle, startDecoder }
}

const videoMedia = vi.fn(
  async () =>
    new Response(new ReadableStream<Uint8Array>(), {
      headers: { "content-type": "video/mp4" },
    }),
)

const services: {
  dispose: () => void
}[] = []
afterEach(() => {
  services.forEach((service) => {
    service.dispose()
  })
  services.splice(0)
  vi.useRealTimers()
})

const createService = (
  options: Partial<
    Parameters<typeof createCameraFrameService>[0]
  > = {},
) => {
  const service = createCameraFrameService({
    getMedia: videoMedia,
    renderText: blankText,
    log: { log: () => undefined, warn: () => undefined },
    ...options,
  })
  services.push(service)
  return service
}

test("panels of one profile share one render; another profile gets its own", async () => {
  const { handle, startDecoder } = createFakeDecoder()
  const service = createService({ startDecoder })
  const first = service.waitForFrame({
    source: videoSource,
    width: 480,
    height: 480,
    label: "Door",
  })
  const second = service.waitForFrame({
    source: videoSource,
    width: 480,
    height: 480,
    label: "Door",
  })
  const landscape = service.waitForFrame({
    source: videoSource,
    width: 480,
    height: 320,
    label: "Door",
  })
  await vi.waitFor(() => expect(handle.starts).toBe(1))
  handle.emit(syntheticPicture(90))
  const [square, sameSquare, wide] = await Promise.all([
    first,
    second,
    landscape,
  ])
  // One decode, one render per profile: the same bytes, not an equal copy.
  expect(square?.pixels).toBe(sameSquare?.pixels)
  expect(square?.pixels.length).toBe(480 * 480 * 2)
  expect(square?.patch).toEqual({
    x: 0,
    y: 60,
    width: 480,
    height: 360,
  })
  expect(wide?.pixels.length).toBe(480 * 320 * 2)
  expect(wide?.patch).toEqual({
    x: 0,
    y: 0,
    width: 480,
    height: 320,
  })
  expect(square?.origin).toBe("video")
  expect(handle.starts).toBe(1)
})

test("a slow panel skips to the newest picture instead of queueing old ones", async () => {
  const { handle, startDecoder } = createFakeDecoder()
  const service = createService({ startDecoder })
  const opening = service.waitForFrame({
    source: videoSource,
    width: 480,
    height: 480,
    label: "Door",
  })
  await vi.waitFor(() => expect(handle.starts).toBe(1))
  handle.emit(syntheticPicture(10))
  const firstFrame = await opening
  handle.emit(syntheticPicture(20))
  handle.emit(syntheticPicture(30))
  handle.emit(syntheticPicture(40))
  const next = await service.waitForFrame({
    source: videoSource,
    width: 480,
    height: 480,
    label: "Door",
    after: firstFrame?.sequence,
  })
  expect(next?.sequence).toBe(
    (firstFrame?.sequence ?? 0) + 3,
  )
  // The camera rectangle carries the newest shade.
  expect(
    next?.pixels.readUInt16BE((240 * 480 + 10) * 2),
  ).toBe(((40 >> 3) << 11) | ((40 >> 2) << 5) | (40 >> 3))
})

test("a reader with nothing newer waits for the next picture or times out empty", async () => {
  const { handle, startDecoder } = createFakeDecoder()
  const service = createService({ startDecoder })
  const empty = await service.waitForFrame({
    source: videoSource,
    width: 480,
    height: 480,
    label: "Door",
    timeoutMilliseconds: 20,
  })
  expect(empty).toBeUndefined()
  const waiting = service.waitForFrame({
    source: videoSource,
    width: 480,
    height: 480,
    label: "Door",
    timeoutMilliseconds: 5000,
  })
  handle.emit(syntheticPicture(50))
  expect((await waiting)?.sequence).toBe(1)
})

test("stills cover the start, and stop once the video plays", async () => {
  const { handle, startDecoder } = createFakeDecoder()
  const still = await sharp(
    Buffer.alloc(640 * 480 * 3, 120),
    {
      raw: { width: 640, height: 480, channels: 3 },
    },
  )
    .jpeg()
    .toBuffer()
  const getMedia = vi.fn(
    async ({ kind }: { kind: string }) =>
      kind === "camera"
        ? new Response(new Uint8Array(still), {
            headers: { "content-type": "image/jpeg" },
          })
        : videoMedia(),
  )
  const service = createService({ startDecoder, getMedia })
  const source = {
    ...videoSource,
    still: {
      channelId: "door/still",
      assetId: "camera.door",
    },
  }
  const first = await service.waitForFrame({
    source,
    width: 480,
    height: 480,
    label: "Door",
  })
  expect(first?.origin).toBe("still")
  expect(first?.pixels.length).toBe(480 * 480 * 2)
  handle.emit(syntheticPicture(70))
  const live = await service.waitForFrame({
    source,
    width: 480,
    height: 480,
    label: "Door",
    after: first?.sequence,
  })
  expect(live?.origin).toBe("video")
  // A status change outside the patch gives the frame a new layout, so a
  // panel redraws the label band once.
  expect(live?.layout).not.toBe(first?.layout)
  const stillRequests = getMedia.mock.calls.filter(
    ([request]) => request.kind === "camera",
  ).length
  await new Promise((resolve) => setTimeout(resolve, 1200))
  expect(
    getMedia.mock.calls.filter(
      ([request]) => request.kind === "camera",
    ).length,
  ).toBe(stillRequests)
})

test("nobody reading stops the decoder, so an idle server decodes nothing", async () => {
  vi.useFakeTimers({ toFake: ["setInterval", "Date"] })
  const { handle, startDecoder } = createFakeDecoder()
  const service = createService({
    startDecoder,
    idleMilliseconds: 15_000,
  })
  void service.waitForFrame({
    source: videoSource,
    width: 480,
    height: 480,
    label: "Door",
    timeoutMilliseconds: 10,
  })
  await vi.waitFor(() => expect(handle.starts).toBe(1))
  expect(service.listSessions()).toHaveLength(1)
  vi.advanceTimersByTime(17_000)
  expect(handle.stop).toHaveBeenCalledTimes(1)
  expect(service.listSessions()).toHaveLength(0)
})
