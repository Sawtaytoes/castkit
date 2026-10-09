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
