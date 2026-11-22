import type { RefObject } from "preact"
import { useEffect } from "preact/hooks"

/**
 * Closes a dialog on a click on its backdrop, but only for a press that
 * began there too. A mouse pressed inside the box and released on the
 * backdrop sends its click to the backdrop, their nearest shared parent;
 * that is a drag that went too far, not a request to close.
 */
export const useBackdropClose = ({
  overlayRef,
  onClose,
}: {
  overlayRef: RefObject<HTMLElement>
  onClose: () => void
}) => {
  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay) {
      return undefined
    }
    const press = { isOnBackdrop: false }
    const handlePointerDown = (event: PointerEvent) => {
      press.isOnBackdrop = event.target === overlay
    }
    const handleClick = (event: MouseEvent) => {
      const isPressOnBackdrop = press.isOnBackdrop
      press.isOnBackdrop = false
      // A click with no press behind it (detail 0) comes from script.
      if (
        event.target === overlay &&
        (isPressOnBackdrop || event.detail === 0)
      ) {
        onClose()
      }
    }
    overlay.addEventListener(
      "pointerdown",
      handlePointerDown,
    )
    overlay.addEventListener("click", handleClick)
    return () => {
      overlay.removeEventListener(
        "pointerdown",
        handlePointerDown,
      )
      overlay.removeEventListener("click", handleClick)
    }
  }, [overlayRef, onClose])
}
