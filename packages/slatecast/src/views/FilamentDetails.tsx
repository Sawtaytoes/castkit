import { filamentColorName } from "@castkit/shared/viewData/filamentColorName"
import type { PrinterFilamentAssignment } from "@castkit/shared/viewData/types"
import { useEffect, useRef } from "preact/hooks"
import { parseRgba, Swatch } from "./spoolSwatch.tsx"
import { useDialogFocus } from "./useDialogFocus.ts"

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
  const swatchFilament = !text
    ? firstFilament
    : filaments?.find(
        (filament) =>
          filament.location
            .replace(/,/g, "")
            .split(" · ")[0] ===
          filamentLocation?.replace(/,/g, ""),
      )
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
        {swatchFilament?.rgba || filamentColor ? (
          <span class="printer-swatch">
            <Swatch
              size="fill"
              rgba={swatchFilament?.rgba ?? filamentColor}
              extraColors={swatchFilament?.extraColors}
              effectType={swatchFilament?.effectType}
            />
          </span>
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
      {/* "· Details" is its own span so a compact printer row can drop the
          word and keep the count: the whole box is the button either way. */}
      <span class="printer-filament-count">
        {count ? (
          <>
            {countText}
            <span class="printer-filament-details">
              {" "}
              · Details
            </span>{" "}
            ›
          </>
        ) : (
          "Details ›"
        )}
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
  summary,
}: {
  filaments?: readonly PrinterFilamentAssignment[]
  jobName: string
  onClose: () => void
  printerName: string
  /**
   * The feed's one-line filament text. A tile may cut it short, so the
   * dialog gives it whole when the feed sends no per-slot list.
   */
  summary?: string
}) => {
  const dialogOverlay = useRef<HTMLDivElement>(null)
  const dialogBox = useRef<HTMLElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)

  useDialogFocus({
    dialogRef: dialogBox,
    initialFocusRef: closeButton,
    onEscape: onClose,
  })

  useEffect(() => {
    const overlay = dialogOverlay.current
    const handleOverlayClick = (event: MouseEvent) => {
      if (event.target === overlay) {
        onClose()
      }
    }
    overlay?.addEventListener("click", handleOverlayClick)
    return () => {
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
        ref={dialogBox}
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
            ref={closeButton}
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
              const rgba = filament.rgba ?? filament.color
              const isTranslucent = rgba
                ? parseRgba(rgba).isTranslucent
                : false
              const metadata = [
                filament.brand,
                filament.effectType?.replace(/[_-]/g, " "),
                isTranslucent &&
                !/translucent|transparent/i.test(
                  filament.name ?? "",
                )
                  ? "Translucent"
                  : undefined,
              ]
                .filter(Boolean)
                .join(" · ")
              return (
                <li key={`${filament.location}:${index}`}>
                  <span class="filament-details-swatch">
                    <Swatch
                      size="fill"
                      rgba={rgba}
                      extraColors={filament.extraColors}
                      effectType={filament.effectType}
                      isHatched={!rgba}
                    />
                  </span>
                  <span class="filament-details-info">
                    <span class="filament-details-name">
                      {[colorName, filament.name]
                        .filter(Boolean)
                        .join(" ") ||
                        "Filament name unavailable"}
                    </span>
                    {metadata ? (
                      <span class="filament-details-metadata">
                        {metadata}
                      </span>
                    ) : null}
                    <span class="filament-details-location">
                      {filament.location.startsWith(
                        "Filament ",
                      )
                        ? `AMS slot unavailable · ${filament.location}`
                        : filament.location}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        ) : (
          <>
            {summary ? (
              <p class="filament-details-summary">
                {summary}
              </p>
            ) : null}
            <p class="filament-details-empty">
              Per-slot filament details are not available.
            </p>
          </>
        )}
      </section>
    </div>
  )
}
