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

/** Text as a reader sees it: spaces collapsed, case ignored. */
const toMatchKey = (text: string) =>
  text.replace(/\s+/g, " ").trim().toLowerCase()

/** A tray as written either way: "AMS 1 slot 1" or "AMS 1, slot 1". */
const toTrayKey = (text: string) =>
  toMatchKey(text.replace(/,/g, " "))

/**
 * A slot's name as the list writes it. The color leads, in words: a swatch
 * alone does not say which of two dark spools to load.
 */
export const getFilamentSlotName = (
  filament: PrinterFilamentAssignment,
) =>
  [
    filament.colorName || filamentColorName(filament.color),
    filament.name,
  ]
    .filter(Boolean)
    .join(" ") || "Filament name unavailable"

/**
 * The feed's one-line filament text, whole, when no slot in the list already
 * says all of it; otherwise nothing. A slot says it when the whole summary
 * reads as that slot's name, alone or followed by its tray. A summary with
 * more than that, such as a qualifier, or a name that only contains it, such
 * as "Support for PLA" for "PLA", is still shown.
 */
export const getFilamentSummaryText = ({
  filaments,
  summary,
}: {
  filaments?: readonly PrinterFilamentAssignment[]
  summary?: string
}) => {
  const summaryText = (summary ?? "")
    .replace(/\s+/g, " ")
    .trim()
  if (!summaryText) {
    return undefined
  }
  const summaryKey = toTrayKey(summaryText)
  const isSummaryInList = Boolean(
    filaments?.some((filament) => {
      const names = [
        filament.name ?? "",
        getFilamentSlotName(filament),
      ].filter(Boolean)
      const trays = [
        filament.location,
        filament.location.split(" · ")[0] ?? "",
      ]
      return names.some(
        (name) =>
          toTrayKey(name) === summaryKey ||
          trays.some(
            (tray) =>
              toTrayKey(`${name} ${tray}`) === summaryKey ||
              toTrayKey(`${name} · ${tray}`) === summaryKey,
          ),
      )
    }),
  )
  return isSummaryInList ? undefined : summaryText
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
   * dialog gives it whole unless a slot below already names that filament.
   */
  summary?: string
}) => {
  const dialogOverlay = useRef<HTMLDivElement>(null)
  const dialogBox = useRef<HTMLElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)

  /* A slot list can lack the active material's name, or omit it entirely. */
  const summaryText = getFilamentSummaryText({
    filaments,
    summary,
  })

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
        {summaryText ? (
          <p class="filament-details-summary">
            {summaryText}
          </p>
        ) : null}
        {filaments?.length ? (
          <ul class="filament-details-list">
            {filaments.map((filament, index) => {
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
                      {getFilamentSlotName(filament)}
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
          <p class="filament-details-empty">
            Per-slot filament details are not available.
          </p>
        )}
      </section>
    </div>
  )
}
