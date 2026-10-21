import { expect, test, vi } from "vitest"
import { createDeviceTests } from "./deviceTests.ts"

test("tests expire and notify even when the admin page closes", () => {
  vi.useFakeTimers()
  const onChanged = vi.fn()
  const tests = createDeviceTests({ onChanged })
  try {
    tests.start({
      deviceId: "panel",
      target: { kind: "view", id: "clock" },
      durationSeconds: 1,
    })
    expect(tests.get("panel")?.target.id).toBe("clock")
    expect(tests.get("other")).toBeNull()
    vi.advanceTimersByTime(1000)
    expect(tests.get("panel")).toBeNull()
    expect(onChanged).toHaveBeenCalledTimes(2)
  } finally {
    tests.dispose()
    vi.useRealTimers()
  }
})
