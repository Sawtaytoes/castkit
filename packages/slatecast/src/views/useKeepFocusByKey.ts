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
 * that key.
 *
 * Focus is never pulled back against the user. The key is forgotten when
 * the user moves focus on, to another control or to nothing, when a pointer
 * presses while focus is lost, and when its control stays gone for two
 * frames from when it went, as a
 * printer that leaves the feed does: a control that comes back later does
 * not take focus.
 *
 * The listeners sit on the document, because the view can start without
 * `rootRef`'s element, as Printer Status does on an empty feed.
 */
export const useKeepFocusByKey = (
  rootRef: RefObject<HTMLElement>,
) => {
  const focusKey = useRef<string | null>(null)
  const forgetFrames = useRef({ first: 0, second: 0 })

  useEffect(() => {
    const handleFocusIn = (event: FocusEvent) => {
      const control = event.target
      focusKey.current =
        control instanceof HTMLElement &&
        rootRef.current?.contains(control)
          ? (control.dataset.focusKey ?? null)
          : null
    }
    const handleFocusOut = (event: FocusEvent) => {
      const control = event.target
      // After any focusin that follows: a removed control keeps its key.
      queueMicrotask(() => {
        const root = rootRef.current
        if (
          control instanceof Node &&
          control.isConnected &&
          !root?.contains(document.activeElement)
        ) {
          focusKey.current = null
        }
      })
    }
    /*
     * A press while focus is lost says where the user wants focus now; a
     * focusin from it follows. A press while a control holds focus, such as
     * a right-click or a drag on it, changes nothing, and a press that does
     * move focus is seen by focusin and focusout.
     */
    const handlePointerDown = () => {
      const activeElement = document.activeElement
      if (
        activeElement === null ||
        activeElement === document.body
      ) {
        focusKey.current = null
      }
    }
    document.addEventListener("focusin", handleFocusIn)
    document.addEventListener("focusout", handleFocusOut)
    document.addEventListener(
      "pointerdown",
      handlePointerDown,
      true,
    )
    const frames = forgetFrames.current
    return () => {
      document.removeEventListener("focusin", handleFocusIn)
      document.removeEventListener(
        "focusout",
        handleFocusOut,
      )
      document.removeEventListener(
        "pointerdown",
        handlePointerDown,
        true,
      )
      cancelAnimationFrame(frames.first)
      cancelAnimationFrame(frames.second)
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
    const findControl = () =>
      rootRef.current?.querySelector<HTMLElement>(
        `[data-focus-key="${CSS.escape(key)}"]`,
      )
    const control = findControl()
    const frames = forgetFrames.current
    if (control) {
      // Back: a later absence counts its two frames from the start.
      cancelAnimationFrame(frames.first)
      cancelAnimationFrame(frames.second)
      frames.first = 0
      frames.second = 0
      control.focus()
      return
    }
    /*
     * Gone for now. Forget it unless it is back two frames after it first
     * went: a render meanwhile does not start the count again, so a feed
     * that sends one update a frame cannot keep the key alive.
     */
    if (frames.first !== 0) {
      return
    }
    frames.first = requestAnimationFrame(() => {
      frames.second = requestAnimationFrame(() => {
        frames.first = 0
        frames.second = 0
        if (focusKey.current === key && !findControl()) {
          focusKey.current = null
        }
      })
    })
  })
}
