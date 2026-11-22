import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "preact/hooks"
import {
  FilamentSlotSwatch,
  type FilamentSwatchColors,
} from "./FilamentDetails.tsx"
import { useBackdropClose } from "./useBackdropClose.ts"
import { useDialogFocus } from "./useDialogFocus.ts"
import { useDragScroll } from "./useDragScroll.ts"

/** One printer as the dialog lists it. The caller works out the words. */
export type PrinterDetailsEntry = {
  id: string
  /** The printer's position on the panel, counting from one. */
  number: number
  name: string
  intent: "neutral" | "warning" | "danger" | "success"
  stateText: string
  jobName: string
  /** The job's exact file name, when it differs from the readable name. */
  fileName?: string
  problemText?: string
  /** The nozzle, which a narrow row drops. */
  nozzleText?: string
  /**
   * The layer and the finish time, or when a settled job ended, which a
   * compact row may not draw.
   */
  progressText?: string
  /**
   * The filament, one line per slot, which a compact row may not draw. Each
   * line has its swatch: the slot's colors, or the feed's active color.
   */
  filamentLines?: readonly {
    text: string
    filament?: FilamentSwatchColors
  }[]
}

/**
 * The full facts that a compact card cannot fit: the whole job name, the whole
 * fault, the nozzle, the layer, the time left and the finish time (or when it
 * ended), and each filament slot with its swatch, and, from the "+N more"
 * strip, every printer the panel did not draw.
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
  const dragScroll = useDragScroll()
  const closeButton = useRef<HTMLButtonElement>(null)
  const [isClosing, setIsClosing] = useState(false)

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

  /*
   * Nothing left to list, such as every hidden printer now drawn: close. But
   * only if the list is still empty two frames on. The view tries its rows
   * again on a new payload or minute, drawing them all for one render before
   * its check hides them again; the list keeps its last entries through that
   * render and does not close. The frames read the latest list, not this
   * render's, because an effect's cleanup runs only after the next paint.
   */
  const hasPrinters = printers.length > 0
  const lastPrinters = useRef(printers)
  const isEmptyNow = useRef(!hasPrinters)
  isEmptyNow.current = !hasPrinters
  if (hasPrinters) {
    lastPrinters.current = printers
  }
  const shownPrinters = lastPrinters.current
  const latestOnClose = useRef(onClose)
  latestOnClose.current = onClose
  useEffect(() => {
    if (hasPrinters) {
      return undefined
    }
    const frameIds = { first: 0, second: 0 }
    frameIds.first = requestAnimationFrame(() => {
      frameIds.second = requestAnimationFrame(() => {
        if (isEmptyNow.current) {
          latestOnClose.current()
        }
      })
    })
    return () => {
      cancelAnimationFrame(frameIds.first)
      cancelAnimationFrame(frameIds.second)
    }
  }, [hasPrinters])

  useDialogFocus({
    dialogRef: dialogBox,
    initialFocusRef: closeButton,
    onEscape: requestClose,
  })

  useBackdropClose({
    overlayRef: dialogOverlay,
    onClose: requestClose,
  })

  if (shownPrinters.length === 0) {
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
        {...dragScroll}
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
          {shownPrinters.map((printer) => (
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
                {printer.fileName ? (
                  <span class="printer-details-file">
                    {printer.fileName}
                  </span>
                ) : null}
                {printer.problemText ? (
                  <span class="printer-details-problem">
                    {printer.problemText}
                  </span>
                ) : null}
                {printer.nozzleText ? (
                  <span class="printer-details-nozzle">
                    {printer.nozzleText}
                  </span>
                ) : null}
                {printer.progressText ? (
                  <span class="printer-details-progress">
                    {printer.progressText}
                  </span>
                ) : null}
                {printer.filamentLines?.map(
                  (line, index) => (
                    <span
                      key={`${line.text}:${index}`}
                      class="printer-details-filament"
                    >
                      {line.filament ? (
                        <span class="printer-details-swatch">
                          <FilamentSlotSwatch
                            filament={line.filament}
                          />
                        </span>
                      ) : null}
                      {line.text}
                    </span>
                  ),
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
