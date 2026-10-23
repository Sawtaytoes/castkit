import { expect, test } from "vitest"
import { createRequestFrameCache } from "./requestFrameCache.ts"

const FRAME_A = Buffer.from("frame-a")
const FRAME_B = Buffer.from("frame-b")

/** A render the test finishes by hand, counting how many were started. */
const createControlledRender = (image: Buffer) => {
  const control = {
    callCount: 0,
    finish: () => {},
  }
  const renderFrame = () => {
    control.callCount += 1
    return new Promise<Buffer | null>((resolve) => {
      control.finish = () => resolve(image)
    })
  }
  return { control, renderFrame }
}

test("a frame rendered ahead answers the request from memory", async () => {
  const cache = createRequestFrameCache()
  const { control, renderFrame } =
    createControlledRender(FRAME_A)

  const preparing = cache.prepare({
    deviceId: "watch",
    key: "points-12",
    renderFrame,
  })
  control.finish()
  expect(await preparing).toBe(true)

  expect(
    await cache.read({
      deviceId: "watch",
      key: "points-12",
      renderFrame,
    }),
  ).toEqual({ image: FRAME_A, source: "cached" })
  expect(control.callCount).toBe(1)
})

test("a request during the render ahead joins it instead of rendering twice", async () => {
  const cache = createRequestFrameCache()
  const { control, renderFrame } =
    createControlledRender(FRAME_A)

  const preparing = cache.prepare({
    deviceId: "watch",
    key: "points-12",
    renderFrame,
  })
  const reading = cache.read({
    deviceId: "watch",
    key: "points-12",
    renderFrame,
  })
  control.finish()

  expect(await preparing).toBe(true)
  expect(await reading).toEqual({
    image: FRAME_A,
    source: "joined",
  })
  expect(control.callCount).toBe(1)
})

test("a request for a newer key renders, and the older frame is not kept", async () => {
  const cache = createRequestFrameCache()
  const older = createControlledRender(FRAME_A)
  const newer = createControlledRender(FRAME_B)

  const preparing = cache.prepare({
    deviceId: "watch",
    key: "points-12",
    renderFrame: older.renderFrame,
  })
  const reading = cache.read({
    deviceId: "watch",
    key: "points-13",
    renderFrame: newer.renderFrame,
  })
  newer.control.finish()
  older.control.finish()

  expect(await reading).toEqual({
    image: FRAME_B,
    source: "rendered",
  })
  await preparing
  expect(
    cache.getHasFrame({
      deviceId: "watch",
      key: "points-12",
    }),
  ).toBe(false)
  expect(
    cache.getHasFrame({
      deviceId: "watch",
      key: "points-13",
    }),
  ).toBe(true)
})

test("a stale key renders on the request and keeps that frame", async () => {
  const cache = createRequestFrameCache()
  const first = createControlledRender(FRAME_A)
  const second = createControlledRender(FRAME_B)

  const preparing = cache.prepare({
    deviceId: "watch",
    key: "points-12",
    renderFrame: first.renderFrame,
  })
  first.control.finish()
  await preparing

  const reading = cache.read({
    deviceId: "watch",
    key: "points-13",
    renderFrame: second.renderFrame,
  })
  second.control.finish()
  expect(await reading).toEqual({
    image: FRAME_B,
    source: "rendered",
  })
  expect(
    await cache.read({
      deviceId: "watch",
      key: "points-13",
      renderFrame: second.renderFrame,
    }),
  ).toEqual({ image: FRAME_B, source: "cached" })
  expect(cache.getSize()).toBe(1)
})

test("forget drops the frame, and a render still running stores nothing", async () => {
  const cache = createRequestFrameCache()
  const { control, renderFrame } =
    createControlledRender(FRAME_A)

  const preparing = cache.prepare({
    deviceId: "watch",
    key: "points-12",
    renderFrame,
  })
  cache.forget("watch")
  control.finish()
  await preparing

  expect(cache.getSize()).toBe(0)
  expect(
    cache.getHasFrame({
      deviceId: "watch",
      key: "points-12",
    }),
  ).toBe(false)
})

test("a failed render leaves nothing held, so the next request renders again", async () => {
  const cache = createRequestFrameCache()
  const failingRender = () =>
    Promise.reject(new Error("capture failed"))

  await expect(
    cache.prepare({
      deviceId: "watch",
      key: "points-12",
      renderFrame: failingRender,
    }),
  ).rejects.toThrow("capture failed")
  expect(
    cache.getHasFrame({
      deviceId: "watch",
      key: "points-12",
    }),
  ).toBe(false)

  expect(
    await cache.read({
      deviceId: "watch",
      key: "points-12",
      renderFrame: async () => FRAME_A,
    }),
  ).toEqual({ image: FRAME_A, source: "rendered" })
})
