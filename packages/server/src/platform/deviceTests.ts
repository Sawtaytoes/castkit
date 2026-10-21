import { randomUUID } from "node:crypto"

type DisplayTest = {
  testId: string
  target: { kind: "view" | "screen"; id: string }
  contrast?: "standard" | "darker" | "high"
  expiresAt: number
}

/** Ephemeral installation tests are separate from automation overrides and saved assignments. */
export const createDeviceTests = ({
  onChanged,
  now = Date.now,
}: {
  onChanged: () => void
  now?: () => number
}) => {
  const tests = new Map<string, DisplayTest>()
  const get = (deviceId: string) => {
    const current = tests.get(deviceId)
    return current && current.expiresAt > now()
      ? current
      : null
  }
  const start = ({
    deviceId,
    target,
    durationSeconds,
    contrast,
  }: {
    deviceId: string
    target: DisplayTest["target"]
    durationSeconds: number
    contrast?: "standard" | "darker" | "high"
  }) => {
    const current = {
      testId: randomUUID(),
      target,
      contrast,
      expiresAt: now() + durationSeconds * 1000,
    }
    tests.set(deviceId, current)
    onChanged()
    return current
  }
  const end = ({
    deviceId,
    testId,
  }: {
    deviceId: string
    testId: string
  }) => {
    if (tests.get(deviceId)?.testId !== testId) return
    tests.delete(deviceId)
    onChanged()
  }
  const setContrast = ({
    deviceId,
    testId,
    contrast,
  }: {
    deviceId: string
    testId: string
    contrast: "standard" | "darker" | "high"
  }) => {
    const current = get(deviceId)
    if (!current || current.testId !== testId)
      throw new Error("This test has ended or was replaced")
    const updated = { ...current, contrast }
    tests.set(deviceId, updated)
    onChanged()
    return updated
  }
  const timer = setInterval(() => {
    const expired = Array.from(tests).filter(
      ([, current]) => current.expiresAt <= now(),
    )
    expired.forEach(([deviceId]) => {
      tests.delete(deviceId)
    })
    if (expired.length) onChanged()
  }, 250)
  timer.unref()
  return {
    get,
    start,
    end,
    setContrast,
    dispose: () => {
      clearInterval(timer)
      tests.clear()
    },
  }
}
