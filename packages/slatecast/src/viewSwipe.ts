import { signal } from "@preact/signals"
import {
  activeView,
  agenda,
  device,
  nowMs,
  sendCommand,
} from "./state.ts"

/**
 * A vertical swipe asks the house for a view.
 *
 * The panel does NOT switch views by itself. It publishes
 * `{ action: "view", value: "<clientId>" }` like any other control, and Home
 * Assistant decides — the same contract every tap already uses, so the view
 * a display may show stays one rule in one automation rather than two rules
 * that can disagree. See
 * docs/decisions/2026-09-11-a-vertical-swipe-asks-the-house-for-a-view.md.
 *
 * Only a touch device gets this. `App` attaches the handlers on
 * `profile.hasTouch`, so a mouse cannot trip a gesture a mouse cannot make.
 */

/** Swipe down: reveal what is on the speakers. */
export const SWIPE_DOWN_VIEW_ID = "now-playing"

/** Swipe up: reveal the clock, the date and today's agenda. */
export const SWIPE_UP_VIEW_ID = "calendar"

/**
 * Vertical travel that commits the swipe, in pixels. The shortest panel in the
 * fleet is 320 px tall, so this is about 15% of its height: past a stray
 * finger, inside one thumb's reach.
 */
export const SWIPE_COMMIT_PIXELS = 48

/**
 * True once the current finger has committed to a vertical swipe.
 *
 * The artwork is also a control, and a swipe that starts on it would otherwise
 * be released as a tap and toggle playback. The artwork reads this on release
 * and stands down. It can do that because a pointer's moves all arrive before
 * its release, and every move bubbles to the stage, so the answer is already
 * settled by the time the artwork is asked.
 */
export const isViewSwipe = signal(false)

type SwipeState = {
  pointerId: number
  startX: number
  startY: number
  isCommitted: boolean
}

let swipe: SwipeState | null = null

export const beginViewSwipe = (event: PointerEvent) => {
  swipe = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    isCommitted: false,
  }
  isViewSwipe.value = false
}

export const trackViewSwipe = (event: PointerEvent) => {
  if (!swipe || event.pointerId !== swipe.pointerId) {
    return
  }
  const distanceX = event.clientX - swipe.startX
  const distanceY = event.clientY - swipe.startY
  // More vertical than horizontal, or the artwork's own left/right drag would
  // double as a view change every time it went slightly off-axis.
  if (
    !swipe.isCommitted &&
    ((Math.abs(distanceY) >= SWIPE_COMMIT_PIXELS &&
      Math.abs(distanceY) > Math.abs(distanceX)) ||
      (distanceX >= SWIPE_COMMIT_PIXELS &&
        Math.abs(distanceX) > Math.abs(distanceY) &&
        device.value?.hasPrinterNavigation &&
        device.value.views.some(
          (view) => view.clientId === "printer-status",
        )))
  ) {
    swipe.isCommitted = true
    isViewSwipe.value = true
  }
}

/**
 * Ask for the revealed view, then forget the gesture.
 *
 * The audio gesture cycles Now Playing and Queue. The printer gesture cycles
 * Printer Status and Print Queue. The time gesture follows the remaining agenda.
 */
export const endViewSwipe = (event: PointerEvent) => {
  if (!swipe || event.pointerId !== swipe.pointerId) {
    return
  }
  const { isCommitted, startX, startY } = swipe
  swipe = null
  isViewSwipe.value = false
  if (!isCommitted) {
    return
  }
  const distanceX = event.clientX - startX
  const distanceY = event.clientY - startY
  const view = activeView.value
  const hasAgenda = (agenda.value?.events ?? []).some(
    (event) =>
      event.isAllDay ||
      event.startMs >= nowMs.value - 60 * 60 * 1000,
  )
  const requested =
    Math.abs(distanceX) > Math.abs(distanceY)
      ? view === "printer-status"
        ? "print-queue"
        : "printer-status"
      : distanceY > 0
        ? view === "now-playing"
          ? "queue"
          : "now-playing"
        : hasAgenda
          ? "calendar"
          : "ambient"
  if (
    !device.value?.views.some(
      (offered) => offered.clientId === requested,
    )
  ) {
    return
  }
  sendCommand({ action: "view", value: requested })
}

/** A scroll or a lost pointer takes the gesture with it. */
export const cancelViewSwipe = () => {
  swipe = null
  isViewSwipe.value = false
}
