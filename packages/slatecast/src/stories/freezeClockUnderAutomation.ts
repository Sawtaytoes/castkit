/**
 * The instant every screenshot shows: Wednesday, July 2, 2025, 1:34 PM in
 * Chicago — the same "Wednesday, July 2 · 1:34 PM" the ePaper Storybook's
 * clock fixtures print, so the two Storybooks agree in the shots. It is
 * exported so the visual-regression capture tests pin the same instant.
 */
export const SCREENSHOT_EPOCH_MILLIS = Date.UTC(
  2025,
  6,
  2,
  18,
  34,
)

/**
 * Stop the clock at {@link SCREENSHOT_EPOCH_MILLIS} when a browser under
 * automation opens this Storybook — the visual-regression capture, which
 * drives Chromium through Playwright and so reports `navigator.webdriver`.
 *
 * Slatecast reads the real clock: `nowMs` ticks every second and the agenda
 * fixtures stamp their rows an hour ahead of `Date.now()`. A screenshot of a
 * live clock differs every minute, so without this every clock, calendar and
 * weather story would read as changed on every run. A person opening the
 * Storybook is not under automation and still sees the time tick.
 *
 * Only a bare `new Date()` and `Date.now()` move; a `Date` built from a value
 * is untouched. The timers keep running, so a tick re-renders the same minute.
 * The time zone is not pinned here — it is the capturing machine's, and the
 * VRT runner sets `TZ=America/Chicago`.
 */
export const freezeClockUnderAutomation = () => {
  if (!navigator.webdriver) {
    return
  }

  const NativeDate = Date

  // A Proxy rather than a subclass: it forwards every `Date` constructor
  // overload untouched, where a subclass would have to restate them.
  globalThis.Date = new Proxy(NativeDate, {
    construct: (target, dateArguments, newTarget) =>
      Reflect.construct(
        target,
        dateArguments.length === 0
          ? [SCREENSHOT_EPOCH_MILLIS]
          : dateArguments,
        newTarget,
      ),
    get: (target, property, receiver) =>
      property === "now"
        ? () => SCREENSHOT_EPOCH_MILLIS
        : Reflect.get(target, property, receiver),
  })
}
