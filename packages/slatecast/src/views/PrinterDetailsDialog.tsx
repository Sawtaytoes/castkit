import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "preact/hooks"

/** One printer as the dialog lists it. The caller works out the words. */
export type PrinterDetailsEntry = {
  id: string
  /** The printer's position on the panel, counting from one. */
  number: number
  name: string
  intent: "neutral" | "warning" | "danger" | "success"
  stateText: string
  jobName: string
  problemText?: string
}

/**
 * The full facts that a compact card cannot fit: the whole job name, the whole
 * fault, and, from the "+N more" strip, every printer the panel did not draw.
 *
 * The 2×2 grid and the compact rows have no room to open a job name in place,
 * so a tap opens this instead. It reuses the filament dialog's frame, so the
 * two dialogs on this view look and close the same way.
 */
export const PrinterDetailsDialog = ({
  onClose,
  printers,
  title,
}: {
  onClose: () => void
  printers: readonly PrinterDetailsEntry[]
  title: string
}) => {
  const dialogOverlay = useRef<HTMLDivElement>(null)
  const dialogBox = useRef<HTMLElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const [isClosing, setIsClosing] = useState(false)

  /*
   * Focus moves in when the dialog opens and goes back to the control that
   * opened it when it closes, so a keyboard user is never left behind the
   * overlay.
   */
  useEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    closeButton.current?.focus()
    return () => {
      if (opener?.isConnected) {
        opener.focus()
      }
    }
  }, [])

  /*
   * The list leaves the way it arrived. The CSS decides whether it moves at
   * all; when it does not, the box has no animation and the close is at once.
   */
  const requestClose = useCallback(() => {
    const box = dialogBox.current
    if (
      !box ||
      getComputedStyle(box).animationName === "none"
    ) {
      onClose()
      return
    }
    setIsClosing(true)
  }, [onClose])

  useEffect(() => {
    const box = dialogBox.current
    if (!isClosing || !box) {
      return undefined
    }
    if (getComputedStyle(box).animationName === "none") {
      onClose()
      return undefined
    }
    const fallbackTimerId = window.setTimeout(onClose, 400)
    box.addEventListener("animationend", onClose)
    return () => {
      window.clearTimeout(fallbackTimerId)
      box.removeEventListener("animationend", onClose)
    }
  }, [isClosing, onClose])

  /* Nothing left to list, such as every hidden printer now drawn: close. */
  const hasPrinters = printers.length > 0
  useEffect(() => {
    if (!hasPrinters) {
      onClose()
    }
  }, [hasPrinters, onClose])

  useEffect(() => {
    const overlay = dialogOverlay.current
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        requestClose()
        return
      }
      // Close is the dialog's one control, so Tab stays on it.
      if (event.key === "Tab") {
        event.preventDefault()
        closeButton.current?.focus()
      }
    }
    const handleOverlayClick = (event: MouseEvent) => {
      if (event.target === overlay) {
        requestClose()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    overlay?.addEventListener("click", handleOverlayClick)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      overlay?.removeEventListener(
        "click",
        handleOverlayClick,
      )
    }
  }, [requestClose])

  if (!hasPrinters) {
    return null
  }

  return (
    <div
      ref={dialogOverlay}
      class="filament-details-dialog printer-details-dialog"
      data-closing={isClosing ? "true" : undefined}
    >
      <section
        ref={dialogBox}
        class="filament-details-box"
        role="dialog"
        aria-modal="true"
        aria-labelledby="printer-details-title"
      >
        <header class="filament-details-head">
          <h2 id="printer-details-title">{title}</h2>
          <button
            ref={closeButton}
            type="button"
            class="filament-details-close"
            onClick={requestClose}
          >
            Close
          </button>
        </header>
        <ul class="filament-details-list printer-details-list">
          {printers.map((printer) => (
            <li
              key={printer.id}
              class="printer-details-item"
              data-intent={printer.intent}
            >
              <span
                class="printer-details-number"
                aria-hidden="true"
              >
                {printer.number}
              </span>
              <span class="filament-details-info">
                <span class="filament-details-name">
                  {printer.name} · {printer.stateText}
                </span>
                <span class="printer-details-job">
                  {printer.jobName}
                </span>
                {printer.problemText ? (
                  <span class="printer-details-problem">
                    {printer.problemText}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
