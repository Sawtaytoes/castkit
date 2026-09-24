import type { TargetedPointerEvent } from "preact"
import { useEffect, useRef, useState } from "preact/hooks"
import { device, releaseView, settings } from "./state.ts"

/**
 * The undrawn edge that hands the panel back to the automation.
 *
 * It draws nothing — no handle, no gradient, no label. Either narrow edge can
 * be pulled 48 px inward or tapped, and the panel answers with one short
 * confirmation that then goes. See
 * docs/decisions/2026-09-23-an-edge-hands-the-panel-back-and-draws-nothing.md.
 *
 * The region exists ONLY while `isViewHeld` is set — a view a person asked for,
 * or an app holding the glass. An edge with nothing to undo does not exist, so
 * it cannot swallow a touch meant for the view underneath. That is also why it
 * sits above the view drawer: a panel that offers both has one hold to end, and
 * ending it is the gesture the edge is for.
 */

/** Inward travel from either edge that commits, in pixels. */
export const EDGE_HAND_BACK_COMMIT_PIXELS = 48

/** How long the confirmation stays on the glass. */
export const HAND_BACK_CONFIRMATION_MS = 1_100

type Edge = "left" | "right"

type EdgePull = {
  edge: Edge
  pointerId: number
  startX: number
  isCommitted: boolean
}

export const HandBackEdge = () => {
  const profile = device.value
  const { isViewHeld } = settings.value
  const [isConfirming, setIsConfirming] = useState(false)
  const pull = useRef<EdgePull | null>(null)

  useEffect(() => {
    if (!isConfirming) {
      return undefined
    }
    const timerId = window.setTimeout(() => {
      setIsConfirming(false)
    }, HAND_BACK_CONFIRMATION_MS)
    return () => {
      window.clearTimeout(timerId)
    }
  }, [isConfirming])

  if (!profile?.hasTouch || !isViewHeld) {
    return null
  }

  const handBack = () => {
    pull.current = null
    setIsConfirming(true)
    releaseView()
  }

  const beginPull = (
    edge: Edge,
    event: TargetedPointerEvent<HTMLButtonElement>,
  ) => {
    pull.current = {
      edge,
      pointerId: event.pointerId,
      startX: event.clientX,
      isCommitted: false,
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // A synthetic or already-cancelled pointer cannot be captured. The edge
      // still receives ordinary moves, so the gesture remains available.
    }
  }

  const trackPull = (
    event: TargetedPointerEvent<HTMLButtonElement>,
  ) => {
    const current = pull.current
    if (
      !current ||
      current.isCommitted ||
      current.pointerId !== event.pointerId
    ) {
      return
    }
    const distance = event.clientX - current.startX
    const inwardDistance =
      current.edge === "left" ? distance : -distance
    if (inwardDistance >= EDGE_HAND_BACK_COMMIT_PIXELS) {
      // Committing on the MOVE rather than the release is what makes the swipe
      // feel like a swipe: the panel answers under the finger.
      current.isCommitted = true
      handBack()
    }
  }

  const endPull = (
    event: TargetedPointerEvent<HTMLButtonElement>,
  ) => {
    const current = pull.current
    pull.current = null
    if (
      !current ||
      current.isCommitted ||
      current.pointerId !== event.pointerId
    ) {
      return
    }
    // A press that never travelled is a tap, and a tap hands back too.
    handBack()
  }

  return (
    <div
      class="hand-back"
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
    >
      {(["left", "right"] as const).map((edge) => (
        <button
          key={edge}
          type="button"
          class={`hand-back-edge is-${edge}`}
          aria-label="Return to the automatic view"
          onPointerDown={(event) => beginPull(edge, event)}
          onPointerMove={trackPull}
          onPointerUp={endPull}
          onPointerCancel={() => {
            pull.current = null
          }}
        />
      ))}
      {isConfirming ? (
        <div class="hand-back-confirmation" role="status">
          Back to automatic
        </div>
      ) : null}
    </div>
  )
}
