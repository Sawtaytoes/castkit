import type { RefObject } from "preact"
import { useEffect, useRef } from "preact/hooks"

/**
 * Closes a dialog on a click on its backdrop, but only for a press that
 * began there too. A mouse pressed inside the box and released on the
 * backdrop sends its click to the backdrop, their nearest shared parent;
 * that is a drag that went too far, not a request to close.
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
    const handleClick = (event: MouseEvent) => {
      const isPressFromBackdrop = isPressOnBackdrop.current
      isPressOnBackdrop.current = false
      // A click with no press behind it (detail 0) comes from script.
      if (
        event.target === overlay &&
        (isPressFromBackdrop || event.detail === 0)
      ) {
        latestOnClose.current()
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
  }, [overlayRef])
}
