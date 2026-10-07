import type { ContractData } from "@castkit/sdk/contracts"
import { useEffect, useRef, useState } from "preact/hooks"
import { AmsEnvironment, SlotRow } from "./spoolAms.tsx"
import {
  type AmsTray,
  describeTray,
  getIsTrayLow,
  getSpoolProductName,
} from "./spoolFormat.ts"
import { Swatch } from "./spoolSwatch.tsx"

/** A read-only slot card; missing identity, missing amount, and empty stay distinct. */
const SlotCard = ({
  tray,
  ordinal,
}: {
  tray: AmsTray
  ordinal: number
}) => (
  <div
    class={[
      "ams-slot",
      tray.state === "empty" ? "is-empty" : "",
      getIsTrayLow(tray) ? "is-low" : "",
    ]
      .filter(Boolean)
      .join(" ")}
  >
    <span class="ams-slot-color">
      {tray.state !== "empty" ? (
        <Swatch size="fill" rgba={tray.rgba} />
      ) : null}
      <span class="ams-slot-number">{ordinal}</span>
    </span>
    <span class="ams-slot-name" title={describeTray(tray)}>
      {tray.state === "empty"
        ? "Empty"
        : getSpoolProductName({
            material: tray.material ?? "Unknown filament",
            subtype: tray.subtype,
          })}
    </span>
    <span class="ams-slot-facts">
      <span>
        {[
          tray.state === "untagged" ? "No tag" : null,
          tray.kValue !== undefined
            ? `K ${tray.kValue.toFixed(3)}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </span>
      <strong>
        {tray.state === "empty"
          ? ""
          : tray.remainPercent === undefined
            ? "—"
            : `${Math.round(tray.remainPercent)}%`}
      </strong>
    </span>
    {tray.state !== "empty" &&
    tray.remainPercent !== undefined ? (
      <span class="ams-slot-bar" aria-hidden="true">
        <i
          style={{
            width: `${Math.min(100, Math.max(0, tray.remainPercent))}%`,
          }}
        />
      </span>
    ) : null}
  </div>
)

/** Public AMS facts without the inventory, reader identifiers, or assignment controls. */
export const AmsFilaments = ({
  data,
  initialLayout = "cards",
}: {
  data: ContractData["ams.v1"] | null
  initialLayout?: string
}) => {
  const [selectedLayout, setLayout] =
    useState(initialLayout)
  const [printerId, setPrinterId] = useState<string>()
  const [unitId, setUnitId] = useState<number>()
  const [width, setWidth] = useState(1280)
  const [height, setHeight] = useState(720)
  const hasRoomForRows = height >= 450
  const layout = hasRoomForRows ? selectedLayout : "cards"
  const container = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = container.current
    if (!element) {
      return
    }
    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0]?.contentRect.width ?? 1280)
      setHeight(entries[0]?.contentRect.height ?? 720)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const printers = data?.printers ?? []
  const selectedPrinter =
    printers.find((printer) => printer.id === printerId) ??
    printers[0]
  const selectedUnit =
    selectedPrinter?.ams.find(
      (unit) => unit.id === unitId,
    ) ?? selectedPrinter?.ams[0]
  const isUnitFocused = width < 900
  const isFocused = layout === "rows" || width < 900
  const visiblePrinters = isFocused
    ? selectedPrinter
      ? [selectedPrinter]
      : []
    : printers
  return (
    <div
      class="fss ams-view"
      ref={container}
      data-layout={layout}
      data-focused={isFocused}
    >
      <header class="ams-view-head">
        <h2>Filaments</h2>
        <div class="ams-layout">
          <button
            type="button"
            aria-pressed={layout === "cards"}
            onClick={() => setLayout("cards")}
          >
            Slot cards
          </button>
          <button
            type="button"
            aria-pressed={layout === "rows"}
            disabled={!hasRoomForRows}
            title={
              hasRoomForRows
                ? undefined
                : "Spool rows need a taller display"
            }
            onClick={() => setLayout("rows")}
          >
            Spool rows
          </button>
        </div>
      </header>
      {isFocused ? (
        <nav class="ams-printer-tabs" aria-label="Printers">
          {printers.map((printer) => (
            <button
              type="button"
              key={printer.id}
              aria-pressed={
                printer.id === selectedPrinter?.id
              }
              onClick={() => setPrinterId(printer.id)}
            >
              {printer.name}
            </button>
          ))}
        </nav>
      ) : null}
      {isUnitFocused && selectedPrinter ? (
        <nav
          class="ams-printer-tabs"
          aria-label="AMS units"
        >
          {selectedPrinter.ams.map((unit) => (
            <button
              type="button"
              key={unit.id}
              aria-pressed={unit.id === selectedUnit?.id}
              onClick={() => setUnitId(unit.id)}
            >
              {unit.label}
            </button>
          ))}
        </nav>
      ) : null}
      {visiblePrinters.length ? (
        <div
          class="ams-fleet"
          style={{
            "--ams-printers": String(
              visiblePrinters.length,
            ),
          }}
        >
          {visiblePrinters.map((printer) => (
            <section class="ams-printer" key={printer.id}>
              <header class="ams-printer-head">
                <h3>{printer.name}</h3>
                <span>
                  {printer.isOnline
                    ? "Online"
                    : "Offline · last known"}
                </span>
              </header>
              <div
                class="ams-units"
                style={{
                  "--ams-units": String(
                    isUnitFocused
                      ? 1
                      : Math.max(1, printer.ams.length),
                  ),
                }}
              >
                {printer.ams.length ? (
                  printer.ams
                    .filter(
                      (unit) =>
                        !isUnitFocused ||
                        unit.id === selectedUnit?.id,
                    )
                    .map((unit) => (
                      <section
                        class="ams-unit"
                        key={unit.id}
                      >
                        <header class="ams-unit-head">
                          <h4>{unit.label}</h4>
                          <AmsEnvironment unit={unit} />
                        </header>
                        <div class="ams-trays">
                          {unit.trays.map((tray, index) =>
                            layout === "rows" ? (
                              <SlotRow
                                key={tray.id}
                                tray={tray}
                                onAssign={null}
                              />
                            ) : (
                              <SlotCard
                                key={tray.id}
                                tray={tray}
                                ordinal={index + 1}
                              />
                            ),
                          )}
                        </div>
                      </section>
                    ))
                ) : (
                  <p>No AMS units reported.</p>
                )}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <p role="status">
          {data
            ? "No printers yet."
            : "Waiting for AMS data."}
        </p>
      )}
    </div>
  )
}
