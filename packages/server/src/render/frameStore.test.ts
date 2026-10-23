import { expect, test } from "vitest"
import { createFrameStore } from "./frameStore.ts"

const FRAME_A = Buffer.from("frame-a")
const FRAME_B = Buffer.from("frame-b")

/** A render the test finishes by hand, counting how many were started. */
const createControlledRender = (image: Buffer | null) => {
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
  const store = createFrameStore()
  const { control, renderFrame } =
    createControlledRender(FRAME_A)

  const preparing = store.prepare({
    deviceId: "watch",
    key: "points-12",
    renderFrame,
  })
  control.finish()
  expect(await preparing).toBe(true)

  expect(
    await store.read({
      deviceId: "watch",
      key: "points-12",
      renderFrame,
    }),
  ).toEqual({ image: FRAME_A, source: "cached" })
  expect(control.callCount).toBe(1)
})

test("a request during the render ahead joins it instead of rendering twice", async () => {
  const store = createFrameStore()
  const { control, renderFrame } =
    createControlledRender(FRAME_A)

  const preparing = store.prepare({
    deviceId: "watch",
    key: "points-12",
    renderFrame,
  })
  const reading = store.read({
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

test("two displays with the same key share one render and one Buffer", async () => {
  const store = createFrameStore()
  const { control, renderFrame } =
    createControlledRender(FRAME_A)

  const first = store.read({
    deviceId: "kitchen",
    key: "clock-0800",
    renderFrame,
  })
  const second = store.read({
    deviceId: "hallway",
    key: "clock-0800",
    renderFrame,
  })
  control.finish()

  const [firstFrame, secondFrame] = await Promise.all([
    first,
    second,
  ])
  expect(firstFrame.source).toBe("rendered")
  expect(secondFrame.source).toBe("joined")
  // The same Buffer object, not two equal copies.
  expect(secondFrame.image).toBe(firstFrame.image)
  expect(control.callCount).toBe(1)
  expect(store.getSize()).toBe(1)

  expect(
    await store.read({
      deviceId: "porch",
      key: "clock-0800",
      renderFrame,
    }),
  ).toEqual({ image: FRAME_A, source: "cached" })
  expect(control.callCount).toBe(1)
})

test("displays with different keys never share a frame", async () => {
  const store = createFrameStore()
  const kitchen = createControlledRender(FRAME_A)
  const hallway = createControlledRender(FRAME_B)

  const first = store.read({
    deviceId: "kitchen",
    key: "agenda-kitchen",
    renderFrame: kitchen.renderFrame,
  })
  const second = store.read({
    deviceId: "hallway",
    key: "agenda-hallway",
    renderFrame: hallway.renderFrame,
  })
  kitchen.control.finish()
  hallway.control.finish()

  expect((await first).image).toBe(FRAME_A)
  expect((await second).image).toBe(FRAME_B)
  expect(store.getSize()).toBe(2)
})

test("a shared entry stays while any display still shows its key", async () => {
  const store = createFrameStore()
  const { control, renderFrame } =
    createControlledRender(FRAME_A)
  const reading = store.read({
    deviceId: "kitchen",
    key: "clock-0800",
    renderFrame,
  })
  control.finish()
  await reading
  store.link({ deviceId: "hallway", key: "clock-0800" })

  store.link({ deviceId: "kitchen", key: "clock-0801" })
  expect(store.getHasFrame("clock-0800")).toBe(true)

  store.forget("hallway")
  expect(store.getHasFrame("clock-0800")).toBe(false)
})

test("a key change releases the old entry", async () => {
  const store = createFrameStore()
  const first = createControlledRender(FRAME_A)
  const second = createControlledRender(FRAME_B)

  const preparing = store.prepare({
    deviceId: "watch",
    key: "points-12",
    renderFrame: first.renderFrame,
  })
  first.control.finish()
  await preparing

  const reading = store.read({
    deviceId: "watch",
    key: "points-13",
    renderFrame: second.renderFrame,
  })
  second.control.finish()
  expect(await reading).toEqual({
    image: FRAME_B,
    source: "rendered",
  })
  expect(store.getHasFrame("points-12")).toBe(false)
  expect(store.getHasFrame("points-13")).toBe(true)
  expect(store.getSize()).toBe(1)
})

test("a render released while it runs stores nothing", async () => {
  const store = createFrameStore()
  const older = createControlledRender(FRAME_A)
  const newer = createControlledRender(FRAME_B)

  const preparing = store.prepare({
    deviceId: "watch",
    key: "points-12",
    renderFrame: older.renderFrame,
  })
  const reading = store.read({
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
  // The caller that asked for the older frame still gets it.
  expect(await preparing).toBe(true)
  expect(store.getHasFrame("points-12")).toBe(false)
  expect(store.getSize()).toBe(1)
})

test("forget drops the display, and a render still running stores nothing", async () => {
  const store = createFrameStore()
  const { control, renderFrame } =
    createControlledRender(FRAME_A)

  const preparing = store.prepare({
    deviceId: "watch",
    key: "points-12",
    renderFrame,
  })
  store.forget("watch")
  control.finish()
  await preparing

  expect(store.getSize()).toBe(0)
})

test("a failed or empty render leaves nothing held, so the next request renders again", async () => {
  const store = createFrameStore()

  await expect(
    store.prepare({
      deviceId: "watch",
      key: "points-12",
      renderFrame: () =>
        Promise.reject(new Error("capture failed")),
    }),
  ).rejects.toThrow("capture failed")
  expect(store.getHasFrame("points-12")).toBe(false)

  expect(
    await store.prepare({
      deviceId: "watch",
      key: "points-12",
      renderFrame: async () => null,
    }),
  ).toBe(false)
  expect(store.getHasFrame("points-12")).toBe(false)

  expect(
    await store.read({
      deviceId: "watch",
      key: "points-12",
      renderFrame: async () => FRAME_A,
    }),
  ).toEqual({ image: FRAME_A, source: "rendered" })
})
