import { filamentColorName } from "@castkit/shared/viewData/filamentColorName"
import type { PrinterFilamentAssignment } from "@castkit/shared/viewData/types"
import { useEffect, useRef } from "preact/hooks"

/** A compact summary that opens the per-slot details for an active print. */
export const FilamentControl = ({
  color,
  isExpanded,
  filaments,
  onClick,
  text,
}: {
  color?: string
  isExpanded: boolean
  filaments?: readonly PrinterFilamentAssignment[]
  onClick: () => void
  text?: string
}) => {
  const count = filaments?.length ?? 0
  const countText =
    count === 1 ? "1 filament" : `${count} filaments`
  const firstFilament = filaments?.[0]
  const [filamentNameText, ...filamentLocationParts] = (
    text ?? ""
  ).split(" · ")
  const filamentLocationFromText =
    filamentLocationParts.join(" · ")
  const firstFilamentColorName =
    firstFilament?.colorName ||
    filamentColorName(firstFilament?.color)
  const firstFilamentName = [
    firstFilamentColorName,
    firstFilament?.name,
  ]
    .filter(Boolean)
    .join(" ")
  const filamentName =
    filamentNameText ||
    (!text ? firstFilamentName : "") ||
    (count ? countText : "Filament details")
  const filamentLocation =
    filamentLocationFromText ||
    (!text ? firstFilament?.location : undefined)
  const filamentColor =
    color || (!text ? firstFilament?.color : undefined)
  const accessibleSummary = [filamentName, filamentLocation]
    .filter(Boolean)
    .join(" · ")
  const actionText = count
    ? countText
    : "AMS and slot details"

  return (
    <button
      type="button"
      class="printer-filament-button"
      aria-haspopup="dialog"
      aria-expanded={isExpanded}
      aria-controls="printer-filament-details"
      aria-label={`${accessibleSummary}. Show ${actionText} for this print`}
      title={`Show ${count ? countText : "AMS and slot details"}`}
      onClick={onClick}
    >
      <span class="printer-filament-summary">
        {filamentColor ? (
          <span
            class="printer-swatch"
            style={{ background: filamentColor }}
            aria-hidden="true"
          />
        ) : null}
        <span class="printer-filament-text">
          <span class="printer-filament-name">
            {filamentName}
          </span>
          {filamentLocation ? (
            <span class="printer-filament-location">
              {filamentLocation}
            </span>
          ) : null}
        </span>
      </span>
      <span class="printer-filament-count">
        {count ? `${countText} · Details ›` : "Details ›"}
      </span>
    </button>
  )
}

/** The full list of loaded AMS slots that supply the active print. */
export const FilamentDetailsDialog = ({
  filaments,
  jobName,
  onClose,
  printerName,
}: {
  filaments?: readonly PrinterFilamentAssignment[]
  jobName: string
  onClose: () => void
  printerName: string
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
      class="filament-details-dialog"
    >
      <section
        id="printer-filament-details"
        class="filament-details-box"
        role="dialog"
        aria-modal="true"
        aria-labelledby="printer-filament-title"
      >
        <header class="filament-details-head">
          <div>
            <h2 id="printer-filament-title">
              Filaments in this print
            </h2>
            <p>
              {printerName}
              {jobName ? ` · ${jobName}` : ""}
            </p>
          </div>
          <button
            type="button"
            class="filament-details-close"
            onClick={onClose}
          >
            Close
          </button>
        </header>
        {filaments?.length ? (
          <ul class="filament-details-list">
            {filaments.map((filament, index) => {
              // The color leads, in words: a swatch alone does not say
              // which of two dark spools to load.
              const colorName =
                filament.colorName ||
                filamentColorName(filament.color)
              return (
                <li key={`${filament.location}:${index}`}>
                  <span
                    class={`filament-details-swatch${filament.color ? "" : " is-empty"}`}
                    style={
                      filament.color
                        ? { background: filament.color }
                        : undefined
                    }
                    aria-hidden="true"
                  />
                  <span class="filament-details-info">
                    <span class="filament-details-name">
                      {[colorName, filament.name]
                        .filter(Boolean)
                        .join(" ") ||
                        "Filament name unavailable"}
                    </span>
                    <span class="filament-details-location">
                      {filament.location}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        ) : (
          <p class="filament-details-empty">
            Per-slot filament details are not available.
          </p>
        )}
      </section>
    </div>
  )
}
