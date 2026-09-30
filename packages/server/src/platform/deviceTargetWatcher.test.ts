import { expect, test, vi } from "vitest"
import { watchDeviceTargets } from "./deviceTargetWatcher.ts"

const createPlatform = () => {
  const targets = new Map<
    string,
    { kind: "view" | "screen"; id: string }
  >()
  const listeners = new Set<() => void>()
  return {
    targets,
    notify: () =>
      listeners.forEach((listener) => {
        listener()
      }),
    platform: {
      getDeviceTarget: (deviceId: string) =>
        targets.get(deviceId),
      store: {
        get: () => ({ deviceScreens: {} }),
      } as never,
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    },
  }
}

test("a browser display reloads both ways, and an image display redraws its own view when the target goes", () => {
  const fixture = createPlatform()
  const onBrowserTargetChanged = vi.fn()
  const onImageTargetRemoved = vi.fn()
  watchDeviceTargets({
    platform: fixture.platform,
    browserDeviceIds: ["square"],
    imageDeviceIds: ["desk"],
    onBrowserTargetChanged,
    onImageTargetRemoved,
  })
  fixture.targets.set("square", {
    kind: "view",
    id: "points",
  })
  fixture.targets.set("desk", {
    kind: "view",
    id: "points",
  })
  fixture.notify()
  expect(onBrowserTargetChanged).toHaveBeenCalledWith(
    "square",
  )
  expect(onImageTargetRemoved).not.toHaveBeenCalled()
  fixture.notify()
  expect(onBrowserTargetChanged).toHaveBeenCalledOnce()
  fixture.targets.clear()
  fixture.notify()
  expect(onBrowserTargetChanged).toHaveBeenCalledTimes(2)
  expect(
    onImageTargetRemoved,
  ).toHaveBeenCalledExactlyOnceWith("desk")
})
