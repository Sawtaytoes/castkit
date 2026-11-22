import { useEffect, useRef } from "preact/hooks"

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

  useEffect(() => {
    const overlay = dialogOverlay.current
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose()
      }
    }
    const handleOverlayClick = (event: MouseEvent) => {
      if (event.target === overlay) {
        onClose()
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
  }, [onClose])

  return (
    <div
      ref={dialogOverlay}
      class="filament-details-dialog printer-details-dialog"
    >
      <section
        class="filament-details-box"
        role="dialog"
        aria-modal="true"
        aria-labelledby="printer-details-title"
      >
        <header class="filament-details-head">
          <h2 id="printer-details-title">{title}</h2>
          <button
            type="button"
            class="filament-details-close"
            onClick={onClose}
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
