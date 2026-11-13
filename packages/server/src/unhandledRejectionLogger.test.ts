import { EventEmitter } from "node:events"
import { afterEach, expect, test, vi } from "vitest"
import { logUnhandledRejections } from "./unhandledRejectionLogger.ts"

afterEach(() => {
  vi.restoreAllMocks()
})

test("an unhandled rejection is logged instead of stopping the process", () => {
  const fakeProcess = new EventEmitter()
  const consoleError = vi
    .spyOn(console, "error")
    .mockImplementation(() => {})
  logUnhandledRejections(fakeProcess)
  const failure = new Error("Immich GET /api/people failed")
  fakeProcess.emit(
    "unhandledRejection",
    failure,
    Promise.resolve(),
  )
  expect(consoleError).toHaveBeenCalledWith(
    "[castkit] unhandled promise rejection",
    failure,
  )
  expect(
    fakeProcess.listenerCount("unhandledRejection"),
  ).toBe(1)
})
