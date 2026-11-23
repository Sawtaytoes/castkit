import type { RefObject } from "preact"
import { useLayoutEffect, useRef } from "preact/hooks"

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ")

/**
 * Focus a control and scroll it into view. Focusing the control that already
 * has focus scrolls nothing, so a list scrolled to its end would otherwise
 * keep Close out of sight.
 */
const focusAndReveal = (control: HTMLElement) => {
  control.focus()
  control.scrollIntoView({ block: "nearest" })
}

/**
 * Focus a control, or, if it takes no focus, as a control the view folded
 * away while a dialog was open does not, the nearest control around it that
 * does: the same card's next control before anything farther off. Nothing
 * inside a dialog counts, since the closing one may still be drawn.
 */
const focusOrNearest = (control: HTMLElement) => {
  control.focus()
  if (document.activeElement === control) {
    return
  }
  for (
    let ancestor = control.parentElement;
    ancestor && ancestor !== document.body;
    ancestor = ancestor.parentElement
  ) {
    const candidates = Array.from(
      ancestor.querySelectorAll<HTMLElement>(
        FOCUSABLE_SELECTOR,
      ),
    ).filter(
      (candidate) =>
        candidate !== control &&
        !candidate.closest('[aria-modal="true"]'),
    )
    for (const candidate of candidates) {
      candidate.focus()
      if (document.activeElement === candidate) {
        return
      }
    }
  }
}

/**
 * Keeps the keyboard inside a modal dialog, as a modal promises.
 *
 * Focus moves in when the dialog opens and goes back to the control that
 * opened it when it closes, or to its replacement with the same
 * `data-focus-key`, or, if the view folded it away, to the nearest control
 * around it. The opener is the control named by `returnFocusKey`
 * when one is given, and otherwise the control that had focus. Tab and Shift+Tab cycle through the dialog's own
 * controls, so a keyboard user cannot reach a control behind the overlay and
 * open a second dialog over the first. Escape closes only the dialog that
 * holds focus, so one key press never closes two dialogs.
 *
 * `dialogRef` is the element that carries `aria-modal="true"`.
 */
export const useDialogFocus = ({
  dialogRef,
  initialFocusRef,
  onEscape,
  returnFocusKey,
}: {
  dialogRef: RefObject<HTMLElement>
  initialFocusRef: RefObject<HTMLElement>
  onEscape: () => void
  /**
   * The `data-focus-key` of the control that opened the dialog. A tap
   * through the Linux WebKit touch adapter opens a dialog without focusing
   * what it tapped, so the focused element is not always the opener.
   */
  returnFocusKey?: string
}) => {
  const onEscapeRef = useRef(onEscape)
  onEscapeRef.current = onEscape
  const returnFocusKeyRef = useRef(returnFocusKey)
  returnFocusKeyRef.current = returnFocusKey

  /*
   * Before the first paint, so the dialog never shows with focus behind it.
   * A live update can replace the opener while the dialog is open; focus
   * then goes to the control that took its place, found by the same
   * `data-focus-key`, once the closing render has drawn it.
   */
  useLayoutEffect(() => {
    const focused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    const openerKey = returnFocusKeyRef.current
    const focusKey = openerKey ?? focused?.dataset.focusKey
    initialFocusRef.current?.focus()
    const findOpener = () =>
      focusKey
        ? document.querySelector<HTMLElement>(
            `[data-focus-key="${CSS.escape(focusKey)}"]`,
          )
        : null
    return () => {
      const opener = openerKey
        ? findOpener()
        : focused?.isConnected
          ? focused
          : null
      if (opener) {
        focusOrNearest(opener)
        return
      }
      if (!focusKey) {
        return
      }
      queueMicrotask(() => {
        const isFocusFree =
          document.activeElement === null ||
          document.activeElement === document.body
        const opener = isFocusFree ? findOpener() : null
        if (opener) {
          focusOrNearest(opener)
        }
      })
    }
  }, [initialFocusRef])

  // Also before the first paint: a key pressed as the dialog appears is caught.
  useLayoutEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const dialog = dialogRef.current
      // Under the Views drawer, which makes the view inert, the drawer has
      // the keyboard: no key reaches a control the drawer covers.
      if (!dialog || dialog.closest("[inert]")) {
        return
      }
      const activeElement = document.activeElement
      const isFocusInside =
        activeElement instanceof Node &&
        dialog.contains(activeElement)
      const isFocusInAnotherDialog =
        !isFocusInside &&
        activeElement instanceof Element &&
        activeElement.closest(
          '[aria-modal="true"], [role="dialog"]',
        ) !== null
      if (isFocusInAnotherDialog) {
        return
      }
      if (event.key === "Escape") {
        onEscapeRef.current()
        return
      }
      if (event.key !== "Tab") {
        return
      }
      const controls = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          FOCUSABLE_SELECTOR,
        ),
      )
      const firstControl = controls[0]
      const lastControl = controls[controls.length - 1]
      if (!firstControl || !lastControl) {
        event.preventDefault()
        return
      }
      if (!isFocusInside) {
        event.preventDefault()
        focusAndReveal(firstControl)
        return
      }
      if (
        event.shiftKey &&
        activeElement === firstControl
      ) {
        event.preventDefault()
        focusAndReveal(lastControl)
        return
      }
      if (
        !event.shiftKey &&
        activeElement === lastControl
      ) {
        event.preventDefault()
        focusAndReveal(firstControl)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [dialogRef])
}
