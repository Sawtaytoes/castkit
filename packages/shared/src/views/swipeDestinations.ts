/**
 * Which view a released swipe asks for, as one rule both halves read.
 *
 * Slatecast asks for this view when a committed swipe is released
 * (`endViewSwipe`), and the server renders the same answers ahead for an
 * image-stream panel, so its worker can show a destination the moment the
 * finger lifts. Two copies of the rule would drift, and a drifted copy shows
 * the wrong view on the glass for one frame on every swipe.
 */

/** The four swipe gestures, named for the finger's travel. */
export type SwipeDirection =
  | "down"
  | "up"
  | "right"
  | "left"

/** The device facts the swipe rule reads. */
export type SwipeDevice = {
  views: readonly { clientId: string }[]
  hasPrinterNavigation?: boolean
  leftSwipeViewId?: string
}

/** An hour after an event starts it no longer counts as the agenda ahead. */
const AGENDA_GRACE_MILLISECONDS = 60 * 60 * 1000

/** Whether the time swipe opens the calendar rather than the ambient clock. */
export const getHasRemainingAgenda = ({
  events,
  nowMs,
}: {
  events: readonly { isAllDay?: boolean; startMs: number }[]
  nowMs: number
}) =>
  events.some(
    (event) =>
      event.isAllDay ||
      event.startMs >= nowMs - AGENDA_GRACE_MILLISECONDS,
  )

/**
 * The view a swipe in `direction` asks for from `currentView`, or `undefined`
 * when that swipe asks for nothing on this device.
 *
 * - Down cycles Now Playing and Queue.
 * - Up opens the calendar while an agenda remains, else the ambient clock.
 * - Right cycles Printer Status and Print Queue on a printer panel.
 * - Left, from the right edge, opens the device's own left-swipe view. That
 *   view need not be one of the device's views: it may name a composed view
 *   that the house resolves.
 */
export const getSwipeDestination = ({
  direction,
  currentView,
  hasAgenda,
  device,
}: {
  direction: SwipeDirection
  currentView: string
  hasAgenda: boolean
  device: SwipeDevice
}) => {
  if (direction === "left") {
    return device.leftSwipeViewId || undefined
  }
  if (
    direction === "right" &&
    !device.hasPrinterNavigation
  ) {
    return undefined
  }
  const requested =
    direction === "right"
      ? currentView === "printer-status"
        ? "print-queue"
        : "printer-status"
      : direction === "down"
        ? currentView === "now-playing"
          ? "queue"
          : "now-playing"
        : hasAgenda
          ? "calendar"
          : "ambient"
  return device.views.some(
    (view) => view.clientId === requested,
  )
    ? requested
    : undefined
}

const DIRECTIONS: readonly SwipeDirection[] = [
  "down",
  "up",
  "right",
  "left",
]

/**
 * Every view a swipe can reach from `currentView` in at most two swipes,
 * nearest first, without repeats, and at most `limit` of them.
 *
 * Two swipes covers the way back: from Now Playing the down swipe reaches the
 * Queue, and from the Queue it reaches Now Playing again, so both stay ready
 * while a person flips between them.
 */
export const listSwipeDestinations = ({
  currentView,
  hasAgenda,
  device,
  limit,
}: {
  currentView: string
  hasAgenda: boolean
  device: SwipeDevice
  limit: number
}) => {
  const readNext = (view: string) =>
    DIRECTIONS.map((direction) =>
      getSwipeDestination({
        direction,
        currentView: view,
        hasAgenda,
        device,
      }),
    ).filter(
      (destination): destination is string =>
        destination !== undefined,
    )
  const nearest = readNext(currentView)
  return Array.from(
    new Set(nearest.concat(nearest.flatMap(readNext))),
  ).slice(0, limit)
}
