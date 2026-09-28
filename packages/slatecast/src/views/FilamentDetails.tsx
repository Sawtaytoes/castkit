import type { PrinterFilamentAssignment } from "@castkit/shared/viewData/types"
import { useEffect } from "preact/hooks"

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

  return (
    <button
      type="button"
      class="printer-filament-button"
      aria-haspopup="dialog"
      aria-expanded={isExpanded}
      aria-controls="printer-filament-details"
      aria-label={`Show ${count ? countText : "AMS and slot details"} for this print`}
      title={`Show ${count ? countText : "AMS and slot details"}`}
      onClick={onClick}
    >
      {color ? (
        <span
          class="printer-swatch"
          style={{ background: color }}
          aria-hidden="true"
        />
      ) : null}
      <span class="printer-filament-text">
        {text || (count ? countText : "Filament details")}
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
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [onClose])

  return (
    <div class="filament-details-dialog">
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
            {filaments.map((filament, index) => (
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
                    {filament.name ||
                      "Filament name unavailable"}
                  </span>
                  <span class="filament-details-location">
                    {filament.location}
                  </span>
                </span>
              </li>
            ))}
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
