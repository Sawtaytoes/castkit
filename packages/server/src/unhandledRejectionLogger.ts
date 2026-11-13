import type { EventEmitter } from "node:events"

/**
 * Logs a promise rejection that nothing handled, instead of letting Node stop
 * the server. Node's default ends the process on the first one, so a single
 * failed render, device push, or Immich call that lost its `catch` would take
 * every display down with it. Each subsystem still catches its own errors;
 * this is the last line, and the log names what escaped so it can be fixed.
 */
export const logUnhandledRejections = (
  target: EventEmitter = process,
) => {
  target.on("unhandledRejection", (reason: unknown) => {
    console.error(
      "[castkit] unhandled promise rejection",
      reason,
    )
  })
}
