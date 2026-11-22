import type { JSX } from "preact"
import { useRef } from "preact/hooks"
import { settings } from "../state.ts"

/** A finger moves this far before a press becomes a drag, not a tap. */
const DRAG_THRESHOLD = 8

/**
 * A finger's movement along the content's own vertical axis. The stage turns
 * the content by `orientation` degrees clockwise, so on a panel turned 90° a
 * drag to the left moves the content down.
 */
export const toContentDeltaY = ({
  deltaX,
  deltaY,
  orientation,
}: {
  deltaX: number
  deltaY: number
  orientation: number
}) => {
  const radians = (orientation * Math.PI) / 180
  return (
    -deltaX * Math.sin(radians) + deltaY * Math.cos(radians)
  )
}

type DragEvent = JSX.TargetedPointerEvent<HTMLElement>

/**
 * Scrolls a box with a finger drag, through pointer events. Where the touch
 * adapter for Linux WebKit cancels a native touch scroll, a dialog list that
 * runs past the glass would otherwise stay out of reach. The box needs
 * `touch-action: none` so a browser that scrolls natively does not scroll it
 * twice. A drag never ends in a tap on what lies under the finger.
 */
export const useDragScroll = () => {
  const contact = useRef<{
    pointerId: number
    startX: number
    startY: number
    scrollTop: number
  }>()
  const hasDragged = useRef(false)
  return {
    "data-castkit-scroll": "true",
    onPointerDown: (event: DragEvent) => {
      hasDragged.current = false
      if (event.pointerType === "mouse") {
        return
      }
      contact.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        scrollTop: event.currentTarget.scrollTop,
      }
    },
    onPointerMove: (event: DragEvent) => {
      const start = contact.current
      if (start?.pointerId !== event.pointerId) {
        return
      }
      const deltaX = event.clientX - start.startX
      const deltaY = event.clientY - start.startY
      if (
        !hasDragged.current &&
        Math.hypot(deltaX, deltaY) > DRAG_THRESHOLD
      ) {
        hasDragged.current = true
        // A replayed pointer the browser no longer tracks cannot be
        // captured; the drag scrolls all the same.
        try {
          event.currentTarget.setPointerCapture(
            event.pointerId,
          )
        } catch {
          // Nothing to keep: later moves still reach the box.
        }
      }
      if (hasDragged.current) {
        event.currentTarget.scrollTop =
          start.scrollTop -
          toContentDeltaY({
            deltaX,
            deltaY,
            orientation: settings.value.orientation,
          })
      }
    },
    onPointerUp: () => {
      contact.current = undefined
    },
    onPointerCancel: () => {
      contact.current = undefined
    },
    onClickCapture: (
      event: JSX.TargetedMouseEvent<HTMLElement>,
    ) => {
      if (hasDragged.current) {
        hasDragged.current = false
        event.preventDefault()
        event.stopPropagation()
      }
    },
  }
}
