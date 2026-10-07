import type { TargetedPointerEvent } from "preact"
import { useRef } from "preact/hooks"
import { device } from "./state.ts"
import {
  beginViewSwipe,
  cancelViewSwipe,
  endViewSwipe,
  trackViewSwipe,
} from "./viewSwipe.ts"

/** Undrawn audio/time swipe regions that remain above external views. */
export const ViewSwipeEdges = () => {
  const start = useRef<{
    edge: "top" | "bottom" | "right"
    x: number
    y: number
  } | null>(null)
  if (!device.value?.hasTouch) {
    return null
  }

  const beginPull = (
    edge: "top" | "bottom" | "right",
    event: TargetedPointerEvent<HTMLButtonElement>,
  ) => {
    event.stopPropagation()
    start.current = {
      edge,
      x: event.clientX,
      y: event.clientY,
    }
    beginViewSwipe(event)
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Synthetic test pointers and cancelled contacts cannot be captured.
    }
  }

  const edges: ("top" | "bottom" | "right")[] = device.value
    .leftSwipeViewId
    ? ["top", "bottom", "right"]
    : ["top", "bottom"]
  return (
    <div class="view-swipe-edges">
      {edges.map((edge) => (
        <button
          key={edge}
          type="button"
          class={`view-swipe-edge is-${edge}`}
          data-castkit-target={`navigation-edge:${edge}`}
          aria-label={
            edge === "top"
              ? "Swipe down for audio"
              : edge === "bottom"
                ? "Swipe up for time"
                : "Swipe left for the configured view"
          }
          onPointerDown={(event) => beginPull(edge, event)}
          onPointerMove={(event) => {
            event.stopPropagation()
            trackViewSwipe(event)
          }}
          onPointerUp={(event) => {
            event.stopPropagation()
            const origin = start.current
            start.current = null
            const inward = origin
              ? origin.edge === "right"
                ? origin.x - event.clientX
                : (event.clientY - origin.y) *
                  (origin.edge === "top" ? 1 : -1)
              : 0
            if (
              origin &&
              inward >
                Math.abs(
                  origin.edge === "right"
                    ? event.clientY - origin.y
                    : event.clientX - origin.x,
                )
            ) {
              endViewSwipe(event)
            } else {
              cancelViewSwipe()
            }
          }}
          onPointerCancel={(event) => {
            event.stopPropagation()
            start.current = null
            cancelViewSwipe()
          }}
        />
      ))}
    </div>
  )
}
