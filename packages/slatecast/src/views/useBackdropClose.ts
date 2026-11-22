import type { RefObject } from "preact"
import { useEffect, useRef } from "preact/hooks"

/**
 * Closes a dialog when a press that began on its backdrop ends there. A
 * mouse pressed inside the box and released on the backdrop is a drag that
 * went too far, not a request to close. The release closes, not the click:
 * the touch adapter for Linux WebKit replays a finger as pointer events and
 * sends a click only to a button, so a backdrop tap there has no click.
 *
 * The press and the close live in refs, so a live update that hands the
 * dialog a new `onClose` between press and release keeps the press.
 */
export const useBackdropClose = ({
  overlayRef,
  onClose,
}: {
  overlayRef: RefObject<HTMLElement>
  onClose: () => void
}) => {
  const isPressOnBackdrop = useRef(false)
  const latestOnClose = useRef(onClose)
  latestOnClose.current = onClose

  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay) {
      return undefined
    }
    const handlePointerDown = (event: PointerEvent) => {
      isPressOnBackdrop.current = event.target === overlay
    }
    const handlePointerUp = (event: PointerEvent) => {
      const isPressFromBackdrop = isPressOnBackdrop.current
      isPressOnBackdrop.current = false
      if (isPressFromBackdrop && event.target === overlay) {
        latestOnClose.current()
      }
    }
    const handlePointerCancel = () => {
      isPressOnBackdrop.current = false
    }
    // A click with no press behind it (detail 0) comes from script; a
    // pointer's own click already closed on its release.
    const handleClick = (event: MouseEvent) => {
      if (event.target === overlay && event.detail === 0) {
        latestOnClose.current()
      }
    }
    overlay.addEventListener(
      "pointerdown",
      handlePointerDown,
    )
    overlay.addEventListener("pointerup", handlePointerUp)
    overlay.addEventListener(
      "pointercancel",
      handlePointerCancel,
    )
    overlay.addEventListener("click", handleClick)
    return () => {
      overlay.removeEventListener(
        "pointerdown",
        handlePointerDown,
      )
      overlay.removeEventListener(
        "pointerup",
        handlePointerUp,
      )
      overlay.removeEventListener(
        "pointercancel",
        handlePointerCancel,
      )
      overlay.removeEventListener("click", handleClick)
    }
  }, [overlayRef])
}
