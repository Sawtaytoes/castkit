import type { TargetedPointerEvent } from "preact"
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "preact/hooks"
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
 * Either undrawn, full-height edge can be tapped or pulled inward. The drawer then
 * presents the views CastKit offered for this device as large direct targets.
 */
export const ViewSwitcher = () => {
  const profile = device.value
  const [openEdge, setOpenEdge] = useState<Edge | null>(
    null,
  )
  const pull = useRef<EdgePull | null>(null)
  const switcherRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  /*
   * What had focus as the drawer opened, kept from before the render that
   * draws the drawer: that render removes the edge a key opened it from.
   */
  const openerRef = useRef<HTMLElement | null>(null)
  const openDrawer = (edge: Edge) => {
    const activeElement = document.activeElement
    openerRef.current =
      activeElement instanceof HTMLElement &&
      activeElement !== document.body
        ? activeElement
        : null
    setOpenEdge(edge)
  }
  const hasDrawer = Boolean(
    profile?.hasTouch &&
      profile.hasViewDrawer &&
      profile.views.length >= 2,
  )
  // A profile that takes the drawer away closes it, and it stays closed.
  const isOpen = hasDrawer && openEdge !== null

  useEffect(() => {
    if (!hasDrawer) {
      setOpenEdge(null)
    }
  }, [hasDrawer])

  /*
   * The drawer covers the view, so the view leaves the keyboard and the
   * accessibility tree while it is open: no key can reach a control the
   * drawer hides, such as the Stop in a question the view had open. The view
   * and the swipe edges come before the switcher on the stage; the hand-back
   * edges after it stay above the drawer, as they are drawn. A view that a
   * live update puts on the stage meanwhile is covered too. Focus moves into
   * the drawer, Escape closes it, and closing gives focus back, to the same
   * edge when an edge opened it.
   */
  useLayoutEffect(() => {
    const switcher = switcherRef.current
    const stage = switcher?.parentElement
    if (!isOpen || !switcher || !stage) {
      return undefined
    }
    const covered = new Set<HTMLElement>()
    const cover = () => {
      for (
        let sibling = switcher.previousElementSibling;
        sibling;
        sibling = sibling.previousElementSibling
      ) {
        if (
          sibling instanceof HTMLElement &&
          !sibling.inert
        ) {
          sibling.inert = true
          covered.add(sibling)
        }
      }
    }
    cover()
    const observer = new MutationObserver(cover)
    observer.observe(stage, { childList: true })
    const focused = openerRef.current
    openerRef.current = null
    const focusedTarget = focused?.dataset.castkitTarget
    closeRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenEdge(null)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      observer.disconnect()
      for (const element of covered) {
        element.inert = false
      }
      if (focused?.isConnected) {
        focused.focus()
        return
      }
      if (!focusedTarget) {
        return
      }
      // The edge that opened the drawer is drawn again once it closes.
      queueMicrotask(() => {
        const isFocusFree =
          document.activeElement === null ||
          document.activeElement === document.body
        if (isFocusFree) {
          document
            .querySelector<HTMLElement>(
              `[data-castkit-target="${CSS.escape(focusedTarget)}"]`,
            )
            ?.focus()
        }
      })
    }
  }, [isOpen])

  if (!hasDrawer || !profile) {
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
      openDrawer(current.edge)
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
      ref={switcherRef}
      class="view-switcher"
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
    >
      {!isOpen ? (
        (["left", "right"] as const).map((edge) => (
          <button
            key={edge}
            type="button"
            class={`view-edge-handle is-${edge}`}
            data-castkit-target={`navigation-edge:${edge}`}
            aria-label={`Open views from ${edge} edge`}
            onClick={() => openDrawer(edge)}
            onPointerDown={(event) =>
              beginPull(edge, event)
            }
            onPointerMove={trackPull}
            onPointerUp={endPull}
            onPointerCancel={endPull}
          />
        ))
      ) : (
        <>
          <button
            type="button"
            class="view-drawer-scrim"
            data-castkit-target="view-drawer:scrim"
            aria-label="Close views"
            onClick={() => setOpenEdge(null)}
          />
          <section
            class={`view-drawer is-${openEdge}`}
            data-castkit-target="view-drawer:panel"
            role="dialog"
            aria-label="Views"
          >
            <header class="view-drawer-header">
              <h1>Views</h1>
              <button
                ref={closeRef}
                type="button"
                class="view-drawer-close"
                data-castkit-target="view-drawer:close"
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
                  data-castkit-target={`view-drawer:select:${view.clientId}`}
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
