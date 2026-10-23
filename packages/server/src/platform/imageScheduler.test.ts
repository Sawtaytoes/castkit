import { afterEach, expect, test, vi } from "vitest"
import { createPlatformImageScheduler } from "./imageScheduler.ts"
import type { Platform } from "./platform.ts"

afterEach(() => vi.useRealTimers())

test("camera frames refresh without channel changes, serialize rendering and stop at expiry", async () => {
  vi.useFakeTimers()
  const target = { isActive: true }
  const render = { finish: () => {} }
  const push = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        render.finish = () => resolve(true)
      }),
  )
  const platform = {
    getDeviceTarget: () =>
      target.isActive
        ? { kind: "view", id: "alert" }
        : undefined,
    getTarget: () => ({
      view: {
        id: "alert",
        panels: [{ specId: "camera-alert", settings: {} }],
      },
    }),
    getDeviceProperties: () => ({
      delivery: "image",
      repaint: "fast",
    }),
    channelsForView: () => ({}),
  } as unknown as Platform
  const scheduler = createPlatformImageScheduler({
    platform,
    deviceIds: ["device"],
    push,
  })
  try {
    await vi.advanceTimersByTimeAsync(1000)
    expect(push).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(3000)
    expect(push).toHaveBeenCalledTimes(1)
    render.finish()
    await vi.advanceTimersByTimeAsync(1000)
    expect(push).toHaveBeenCalledTimes(2)
    target.isActive = false
    render.finish()
    await vi.advanceTimersByTimeAsync(5000)
    expect(push).toHaveBeenCalledTimes(2)
  } finally {
    scheduler.dispose()
  }
})

/** No display on the platform: only the request displays have work. */
const idlePlatform = {
  getDeviceTarget: () => undefined,
  getTarget: () => null,
  getDeviceProperties: () => undefined,
  channelsForView: () => ({}),
} as unknown as Platform

/**
 * A request display whose content key the test sets, and which holds the key
 * of the last frame rendered ahead, as the push controller does.
 */
const createRequestDisplay = () => {
  const content = {
    key: "points-12" as string | undefined,
    heldKey: undefined as string | undefined,
    isFailing: false,
  }
  const prerender = vi.fn(async () => {
    if (content.isFailing) return false
    content.heldKey = content.key
    return true
  })
  return {
    content,
    prerender,
    requestDisplays: {
      deviceIds: ["watch"],
      getPrerenderKey: () =>
        content.key === content.heldKey
          ? undefined
          : content.key,
      prerender,
    },
  }
}

test("a content change renders the watch frame ahead once it settles, and the clock alone never does", async () => {
  vi.useFakeTimers()
  const { prerender, requestDisplays } =
    createRequestDisplay()
  const scheduler = createPlatformImageScheduler({
    platform: idlePlatform,
    deviceIds: [],
    push: vi.fn(async () => true),
    requestDisplays,
  })
  try {
    await vi.advanceTimersByTimeAsync(2000)
    expect(prerender).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    expect(prerender).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(prerender).toHaveBeenCalledTimes(1)
  } finally {
    scheduler.dispose()
  }
})

test("a burst of points updates coalesces into one frame, bounded by the longest deferral", async () => {
  vi.useFakeTimers()
  const { content, prerender, requestDisplays } =
    createRequestDisplay()
  const scheduler = createPlatformImageScheduler({
    platform: idlePlatform,
    deviceIds: [],
    push: vi.fn(async () => true),
    requestDisplays,
  })
  const changes = { count: 0 }
  const changer = setInterval(() => {
    changes.count += 1
    content.key = `points-${12 + changes.count}`
  }, 1000)
  try {
    await vi.advanceTimersByTimeAsync(9000)
    expect(prerender).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2000)
    expect(prerender).toHaveBeenCalledTimes(1)
    clearInterval(changer)
    await vi.advanceTimersByTimeAsync(5000)
    expect(prerender).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(prerender).toHaveBeenCalledTimes(2)
  } finally {
    clearInterval(changer)
    scheduler.dispose()
  }
})

test("a failed frame is left to the request until the content changes", async () => {
  vi.useFakeTimers()
  const { content, prerender, requestDisplays } =
    createRequestDisplay()
  content.isFailing = true
  const scheduler = createPlatformImageScheduler({
    platform: idlePlatform,
    deviceIds: [],
    push: vi.fn(async () => true),
    requestDisplays,
  })
  try {
    await vi.advanceTimersByTimeAsync(60_000)
    expect(prerender).toHaveBeenCalledTimes(1)
    content.isFailing = false
    content.key = "points-13"
    await vi.advanceTimersByTimeAsync(3000)
    expect(prerender).toHaveBeenCalledTimes(2)
  } finally {
    scheduler.dispose()
  }
})

test("a display that shows its frame now is pushed before a watch frame is rendered ahead", async () => {
  vi.useFakeTimers()
  const order: string[] = []
  const { requestDisplays } = createRequestDisplay()
  const platform = {
    getDeviceTarget: () => ({ kind: "view", id: "points" }),
    getTarget: () => ({
      view: { id: "points", panels: [] },
    }),
    getDeviceProperties: () => ({
      delivery: "image",
      repaint: "fast",
    }),
    channelsForView: () => ({}),
  } as unknown as Platform
  const scheduler = createPlatformImageScheduler({
    platform,
    deviceIds: ["panel"],
    push: vi.fn(async () => {
      order.push("push panel")
      return true
    }),
    requestDisplays: {
      ...requestDisplays,
      prerender: async (deviceId: string) => {
        order.push(`frame ahead ${deviceId}`)
        return requestDisplays.prerender()
      },
    },
  })
  try {
    await vi.advanceTimersByTimeAsync(5000)
    expect(order).toEqual([
      "push panel",
      "frame ahead watch",
    ])
  } finally {
    scheduler.dispose()
  }
})
