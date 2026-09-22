import type { TargetedPointerEvent } from "preact"
import { useRef, useState } from "preact/hooks"
import { activeView, device, sendCommand } from "./state.ts"

/** Travel from either screen edge that opens the view drawer. */
export const EDGE_PULL_COMMIT_PIXELS = 48

type Edge = "left" | "right"

type EdgePull = {
  edge: Edge
  pointerId: number
  startX: number
}

/**
 * Panel navigation that remains above every view, including external iframes.
 *
 * Either narrow edge handle can be tapped or pulled inward. The drawer then
 * presents the views CastKit offered for this device as large direct targets.
 */
export const ViewSwitcher = () => {
  const profile = device.value
  const [openEdge, setOpenEdge] = useState<Edge | null>(
    null,
  )
  const pull = useRef<EdgePull | null>(null)

  if (
    !profile?.hasTouch ||
    !profile.hasViewDrawer ||
    profile.views.length < 2
  ) {
    return null
  }

  const beginPull = (
    edge: Edge,
    event: TargetedPointerEvent<HTMLButtonElement>,
  ) => {
    pull.current = {
      edge,
      pointerId: event.pointerId,
      startX: event.clientX,
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // A synthetic or already-cancelled pointer cannot be captured. The edge
      // still receives ordinary moves, so opening remains available.
    }
  }

  const trackPull = (
    event: TargetedPointerEvent<HTMLButtonElement>,
  ) => {
    const current = pull.current
    if (!current || current.pointerId !== event.pointerId) {
      return
    }
    const distance = event.clientX - current.startX
    const inwardDistance =
      current.edge === "left" ? distance : -distance
    if (inwardDistance >= EDGE_PULL_COMMIT_PIXELS) {
      setOpenEdge(current.edge)
      pull.current = null
    }
  }

  const endPull = () => {
    pull.current = null
  }

  const requestView = (clientId: string) => {
    setOpenEdge(null)
    sendCommand({ action: "view", value: clientId })
  }

  return (
    <div
      class="view-switcher"
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
    >
      {openEdge === null ? (
        (["left", "right"] as const).map((edge) => (
          <button
            key={edge}
            type="button"
            class={`view-edge-handle is-${edge}`}
            aria-label={`Open views from ${edge} edge`}
            onClick={() => setOpenEdge(edge)}
            onPointerDown={(event) =>
              beginPull(edge, event)
            }
            onPointerMove={trackPull}
            onPointerUp={endPull}
            onPointerCancel={endPull}
          >
            <span aria-hidden="true">
              {edge === "left" ? "›" : "‹"}
            </span>
          </button>
        ))
      ) : (
        <>
          <button
            type="button"
            class="view-drawer-scrim"
            aria-label="Close views"
            onClick={() => setOpenEdge(null)}
          />
          <section
            class={`view-drawer is-${openEdge}`}
            role="dialog"
            aria-label="Views"
          >
            <header class="view-drawer-header">
              <h1>Views</h1>
              <button
                type="button"
                class="view-drawer-close"
                aria-label="Close views"
                onClick={() => setOpenEdge(null)}
              >
                ×
              </button>
            </header>
            <div class="view-drawer-options">
              {profile.views.map((view) => (
                <button
                  key={view.clientId}
                  type="button"
                  class="view-drawer-option"
                  aria-pressed={
                    activeView.value === view.clientId
                  }
                  onClick={() => requestView(view.clientId)}
                >
                  {view.name}
                </button>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
