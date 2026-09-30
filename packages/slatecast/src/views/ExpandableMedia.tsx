import type { ComponentChildren } from "preact"
import {
  useLayoutEffect,
  useRef,
  useState,
} from "preact/hooks"

/** Lightweight display reproduction of Charcuterie's Lightbox shape, without React. */
export const ExpandableMedia = ({
  children,
  name,
  className,
}: {
  children: ComponentChildren
  name: string
  className?: string
}) => {
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  useLayoutEffect(() => {
    const element = dialog.current
    if (!element) {
      return
    }
    if (isExpanded) {
      element.showModal()
    } else if (element.open) {
      element.close()
      trigger.current?.focus({ preventScroll: true })
    }
  }, [isExpanded])
  return (
    <div
      class={`expandable-media ${className ?? ""}`}
      data-expanded={String(isExpanded)}
    >
      <button
        ref={trigger}
        class="expandable-media-trigger"
        type="button"
        aria-label={`Enlarge ${name}`}
        aria-haspopup="dialog"
        onClick={() => setIsExpanded(true)}
      />
      <dialog
        ref={dialog}
        class="expandable-media-dialog"
        aria-label={isExpanded ? name : undefined}
        aria-hidden={!isExpanded}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault()
            setIsExpanded(false)
          }
        }}
        onCancel={(event) => {
          event.preventDefault()
          setIsExpanded(false)
        }}
        onClose={() => {
          // A queued close event from the previous opening must not dismiss
          // a modal that the user has already opened again.
          if (!dialog.current?.open) {
            setIsExpanded(false)
          }
        }}
      >
        <button
          class="expandable-media-close"
          type="button"
          aria-label={`Close ${name}`}
          onClick={() => setIsExpanded(false)}
        >
          {children}
          <span class="expandable-media-hint">
            Click to close · Esc
          </span>
        </button>
      </dialog>
    </div>
  )
}
