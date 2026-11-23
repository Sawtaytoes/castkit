import type { RefObject } from "preact"
import {
  useEffect,
  useLayoutEffect,
  useRef,
} from "preact/hooks"

/**
 * Keeps keyboard focus on a control that a live update draws again.
 *
 * A view that measures itself can, for one render, drop a control and then
 * draw it again as a new element: the Printer Status strip does on a new
 * minute or payload. Focus on the old element would fall to the page body.
 * After each render, if focus is on the body and the last focused control
 * inside `rootRef` carried a `data-focus-key`, focus goes to the element with
 * that key. A control the user leaves on purpose, to another control or to
 * nothing, forgets its key, so focus is never pulled back.
 */
export const useKeepFocusByKey = (
  rootRef: RefObject<HTMLElement>,
) => {
  const focusKey = useRef<string | null>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) {
      return undefined
    }
    const handleFocusIn = (event: FocusEvent) => {
      focusKey.current =
        event.target instanceof HTMLElement
          ? (event.target.dataset.focusKey ?? null)
          : null
    }
    const handleFocusOut = (event: FocusEvent) => {
      const control = event.target
      // After any focusin that follows: a removed control keeps its key.
      queueMicrotask(() => {
        if (
          control instanceof Node &&
          control.isConnected &&
          !root.contains(document.activeElement)
        ) {
          focusKey.current = null
        }
      })
    }
    root.addEventListener("focusin", handleFocusIn)
    root.addEventListener("focusout", handleFocusOut)
    return () => {
      root.removeEventListener("focusin", handleFocusIn)
      root.removeEventListener("focusout", handleFocusOut)
    }
  }, [rootRef])

  // After every render, before paint: the control is back, so is focus.
  useLayoutEffect(() => {
    const key = focusKey.current
    const activeElement = document.activeElement
    const isFocusLost =
      activeElement === null ||
      activeElement === document.body
    if (!key || !isFocusLost) {
      return
    }
    rootRef.current
      ?.querySelector<HTMLElement>(
        `[data-focus-key="${CSS.escape(key)}"]`,
      )
      ?.focus()
  })
}
