import type { SpoolsData } from "@castkit/shared/viewData/types"
import {
  Chip,
  ScaleStatus,
  SpoolFooter,
  ViewToggle,
} from "./spoolChrome.tsx"
import {
  type AmsTray,
  describeAmsWarnings,
  describeTray,
  getIsTrayLow,
  type Spool,
  type SpoolPrinter,
} from "./spoolFormat.ts"
import { Swatch } from "./spoolSwatch.tsx"

/**
 * One AMS tray as a row: the swatch, the product and its remaining bar, the
 * percentage. Three states, and each looks like itself from a step back — a
 * read spool has a bar, an unread spool is outlined in the accent with a `?`
 * where its percentage would be, and an empty slot is a dashed box.
 *
 * The row is a button only while a matched spool sits on the reader: tapping
 * it then puts that spool in this slot. With nothing on the reader there is
 * nothing to assign, and the row is a plain fact.
 */
const SlotRow = ({
  tray,
  onAssign,
}: {
  tray: AmsTray
  onAssign: (() => void) | null
}) => {
  const isLow = getIsTrayLow(tray)
  const className = [
    "fss-slot",
    tray.state === "empty" ? "is-empty" : "",
    tray.state === "untagged" ? "is-untagged" : "",
    isLow ? "is-low" : "",
  ]
    .filter(Boolean)
    .join(" ")
  const body = (
    <>
      {tray.state === "empty" ? (
        <span />
      ) : (
        <Swatch rgba={tray.rgba} />
      )}
      <span class="fss-slot-text">
        <span class="fss-slot-name">
          {describeTray(tray)}
        </span>
        {tray.state === "read" &&
        tray.remainPercent !== undefined ? (
          <span class="fss-bar" aria-hidden="true">
            <i
              style={{
                width: `${Math.min(100, Math.max(0, tray.remainPercent))}%`,
              }}
            />
          </span>
        ) : null}
        {tray.state === "untagged" ? (
          <span class="fss-slot-meta">
            {[
              tray.material,
              onAssign ? "tap to assign" : null,
            ]
              .filter((part) => part != null)
              .join(" · ")}
          </span>
        ) : null}
      </span>
      <span class="fss-slot-pct">
        {tray.state === "read" &&
        tray.remainPercent !== undefined
          ? `${Math.round(tray.remainPercent)}%`
          : tray.state === "untagged"
            ? "?"
            : ""}
      </span>
    </>
  )
  return onAssign ? (
    <button
      type="button"
      class={className}
      onClick={onAssign}
    >
      {body}
    </button>
  ) : (
    <div class={className}>{body}</div>
  )
}

/**
 * The AMS side of the toggle: one printer at a time, chosen by the tabs
 * across the top, with every unit's slots at a glance. An offline printer's
 * tab is dimmed and its units draw dimmed too, because the trays it reports
 * are the trays it last saw and not the trays it has.
 */
export const AmsOverview = ({
  printers,
  printerId,
  scale,
  matchedSpool,
  onChoosePrinter,
  onAssign,
  onToggle,
}: {
  printers: readonly SpoolPrinter[]
  printerId: string | undefined
  scale: SpoolsData["scale"]
  matchedSpool: Spool | undefined
  onChoosePrinter: (printerId: string) => void
  onAssign: (target: {
    printerId: string
    amsId: number
    trayId: number
  }) => void
  onToggle: () => void
}) => {
  const printer =
    printers.find(
      (candidate) => candidate.id === printerId,
    ) ?? printers[0]
  const warnings = describeAmsWarnings(printer?.ams ?? [])
  return (
    <>
      <div class="fss-tabs">
        {printers.map((candidate, index) => (
          <button
            key={candidate.id}
            type="button"
            aria-pressed={candidate.id === printer?.id}
            class={[
              "fss-tab",
              candidate.id === printer?.id
                ? "is-active"
                : "",
              candidate.isOnline ? "" : "is-offline",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => onChoosePrinter(candidate.id)}
          >
            {index + 1} · {candidate.name}
          </button>
        ))}
        <span class="fss-spacer" />
        {printer && !printer.isOnline ? (
          <Chip intent="neutral">Offline</Chip>
        ) : null}
        {warnings.lowText ? (
          <Chip intent="warning">{warnings.lowText}</Chip>
        ) : null}
        {warnings.untaggedText ? (
          <Chip intent="accent">
            {warnings.untaggedText}
          </Chip>
        ) : null}
      </div>
      {printer === undefined ? (
        <div class="fss-empty">
          <p class="fss-subtitle">No printers yet.</p>
        </div>
      ) : (
        <div
          class={
            printer.isOnline
              ? "fss-ams-grid"
              : "fss-ams-grid is-offline"
          }
          style={{
            "--columns": String(
              Math.max(1, printer.ams.length),
            ),
          }}
        >
          {printer.ams.map((unit) => (
            <section
              key={unit.id}
              class="fss-card fss-ams-unit"
            >
              <header class="fss-ams-head">
                <span class="fss-ams-name">
                  {unit.label}
                </span>
                {unit.humidityPercent ===
                undefined ? null : (
                  <span class="fss-ams-env">
                    {Math.round(unit.humidityPercent)}% RH
                  </span>
                )}
              </header>
              {unit.trays.map((tray) => (
                <SlotRow
                  key={tray.id}
                  tray={tray}
                  onAssign={
                    matchedSpool && printer.isOnline
                      ? () =>
                          onAssign({
                            printerId: printer.id,
                            amsId: unit.id,
                            trayId: tray.id,
                          })
                      : null
                  }
                />
              ))}
            </section>
          ))}
        </div>
      )}
      <SpoolFooter
        left={<ScaleStatus scale={scale} />}
        right={
          <ViewToggle target="spool" onTap={onToggle} />
        }
      />
    </>
  )
}
