import type { RefObject } from "preact"
import { useLayoutEffect, useRef } from "preact/hooks"

export const FOCUSABLE_SELECTOR = [
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
 * Focus the first control under `root` that takes focus. A control inside a
 * dialog does not count, since the closing one may still be drawn, and
 * neither does one the Views drawer made inert.
 */
const focusFirstIn = (
  root: Element,
  skippedControl?: HTMLElement,
) => {
  const candidates = Array.from(
    root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(
    (candidate) =>
      candidate !== skippedControl &&
      !candidate.closest(
        '[aria-modal="true"], [role="dialog"], [inert]',
      ),
  )
  return candidates.some((candidate) => {
    candidate.focus()
    return document.activeElement === candidate
  })
}

/**
 * Focus a control, or, if it takes no focus, as a control the view folded
 * away while a dialog was open does not, the nearest control around it that
 * does: the same card's next control before anything farther off. The
 * search stops at `host`, the view that drew the dialog, so focus never
 * lands on the Views drawer or another part of the screen.
 */
const focusOrNearest = (
  control: HTMLElement,
  host: Element,
) => {
  control.focus()
  if (document.activeElement === control) {
    return true
  }
  for (
    let ancestor = control.parentElement;
    ancestor && host.contains(ancestor);
    ancestor = ancestor.parentElement
  ) {
    if (focusFirstIn(ancestor, control)) {
      return true
    }
  }
  return false
}

/**
 * Keeps the keyboard inside a modal dialog, as a modal promises.
 *
 * Focus moves in when the dialog opens and goes back to the control that
 * opened it when it closes, or to its replacement with the same
 * `data-focus-key`, or, if the view folded it away, to the nearest control
 * around it. The opener is the control named by `returnFocusKey`
 * when one is given, and otherwise the control that had focus. If the opener
 * is gone, as when a live update removed its printer, focus goes to the
 * control named by `fallbackFocusKey`, or else to the view's first control,
 * so it never falls to the page. Focus moves only if it is still in the
 * dialog or nowhere: a dialog that closes on its own, as a question does
 * when it expires, never takes focus from the Views drawer. Tab and Shift+Tab cycle through the dialog's own
 * controls, so a keyboard user cannot reach a control behind the overlay and
 * open a second dialog over the first. Escape closes only the dialog that
 * holds focus, so one key press never closes two dialogs.
 *
 * `dialogRef` is the element that carries `aria-modal="true"`.
 */
export const useDialogFocus = ({
  dialogRef,
  fallbackFocusKey,
  initialFocusRef,
  onEscape,
  returnFocusKey,
}: {
  dialogRef: RefObject<HTMLElement>
  /**
   * The `data-focus-key` of the control that takes focus when the opener
   * is gone.
   */
  fallbackFocusKey?: string
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
  const fallbackFocusKeyRef = useRef(fallbackFocusKey)
  fallbackFocusKeyRef.current = fallbackFocusKey

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
    const dialog = dialogRef.current
    // The view that drew the dialog: the stage's child around it.
    const host =
      dialog?.closest(".stage > *") ?? document.body
    initialFocusRef.current?.focus()
    const findByKey = (key: string | undefined) =>
      key
        ? document.querySelector<HTMLElement>(
            `[data-focus-key="${CSS.escape(key)}"]`,
          )
        : null
    const isFocusFree = () =>
      document.activeElement === null ||
      document.activeElement === document.body
    const focusFallback = () => {
      const fallback = findByKey(
        fallbackFocusKeyRef.current,
      )
      if (
        fallback &&
        host.contains(fallback) &&
        focusOrNearest(fallback, host)
      ) {
        return
      }
      if (host.isConnected) {
        focusFirstIn(host)
      }
    }
    return () => {
      const activeElement = document.activeElement
      const isFocusOurs =
        isFocusFree() ||
        (dialog !== null &&
          activeElement instanceof Node &&
          dialog.contains(activeElement))
      if (!isFocusOurs) {
        return
      }
      const opener = openerKey
        ? findByKey(openerKey)
        : focused?.isConnected
          ? focused
          : null
      if (opener) {
        focusOrNearest(opener, host)
      }
      /*
       * Once the closing render is done: it may draw the opener's
       * replacement, or remove the opener that just took focus, as when a
       * live update removes the printer that asked.
       */
      queueMicrotask(() => {
        if (!isFocusFree()) {
          return
        }
        const opener = findByKey(focusKey)
        if (opener && focusOrNearest(opener, host)) {
          return
        }
        focusFallback()
      })
    }
  }, [dialogRef, initialFocusRef])

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
