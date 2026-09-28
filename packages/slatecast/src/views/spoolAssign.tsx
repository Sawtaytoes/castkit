import { SpoolFooter } from "./spoolChrome.tsx"
import {
  type AmsUnit,
  describeAmsUnit,
  describePrinterForAssign,
  describePrinterVerdict,
  describeSlotContents,
  describeSlotVerdict,
  getSpoolShortName,
  type Spool,
  type SpoolPrinter,
} from "./spoolFormat.ts"
import { Swatch } from "./spoolSwatch.tsx"

/**
 * The three-tap assign flow: printer, then AMS unit, then slot. One screen
 * per step, big cards, a crumb row that names the spool and shows which step
 * is up, and a Back button that undoes the last tap.
 *
 * The cards are buttons the size of a hand. Standing at the scale with a
 * spool in the other hand, a person taps three times and is done; nothing
 * here asks for a second confirmation because a wrong slot is undone by
 * assigning again.
 */

const Crumbs = ({
  spool,
  printerName,
  unitLabel,
  step,
}: {
  spool: Spool
  printerName: string | undefined
  unitLabel: string | undefined
  step: "printer" | "ams" | "slot"
}) => {
  const crumbs = [
    { key: "printer", text: printerName ?? "Printer" },
    { key: "ams", text: unitLabel ?? "AMS" },
    { key: "slot", text: "Slot" },
  ]
  return (
    <nav class="fss-steps" aria-label="Assign steps">
      <span class="fss-crumb">
        <Swatch
          size="tiny"
          rgba={spool.rgba}
          extraColors={spool.extraColors}
          effectType={spool.effectType}
        />
        {getSpoolShortName(spool)}
      </span>
      {crumbs.map((crumb) => (
        <span key={crumb.key} class="fss-crumb-group">
          <span class="fss-crumb-sep" aria-hidden="true">
            ›
          </span>
          <span
            class={
              crumb.key === step
                ? "fss-crumb is-now"
                : "fss-crumb"
            }
            aria-current={
              crumb.key === step ? "step" : undefined
            }
          >
            {crumb.text}
          </span>
        </span>
      ))}
    </nav>
  )
}

const Verdict = ({
  text,
  isGood,
}: {
  text: string
  isGood: boolean
}) => (
  <span
    class={
      isGood ? "fss-choice-sub is-good" : "fss-choice-sub"
    }
  >
    {text}
  </span>
)

/** The four small swatches under an AMS card: what each of its slots holds. */
const MiniTrays = ({ unit }: { unit: AmsUnit }) => (
  <span class="fss-mini" aria-hidden="true">
    {unit.trays.map((tray) =>
      tray.state === "empty" ? (
        <span key={tray.id} class="fss-mini-empty" />
      ) : (
        <Swatch
          key={tray.id}
          size="fill"
          rgba={tray.rgba}
          isOutlined={tray.state === "untagged"}
        />
      ),
    )}
  </span>
)

export const AssignFlow = ({
  spool,
  printers,
  printerId,
  amsId,
  onChoosePrinter,
  onChooseAms,
  onChooseSlot,
  onBack,
}: {
  spool: Spool
  printers: readonly SpoolPrinter[]
  printerId: string | undefined
  amsId: number | undefined
  onChoosePrinter: (printerId: string) => void
  onChooseAms: (amsId: number) => void
  onChooseSlot: (trayId: number) => void
  onBack: () => void
}) => {
  const printer = printers.find(
    (candidate) => candidate.id === printerId,
  )
  const unit = printer?.ams.find(
    (candidate) => candidate.id === amsId,
  )
  const step =
    printer === undefined
      ? "printer"
      : unit === undefined
        ? "ams"
        : "slot"
  const shortName = getSpoolShortName(spool)

  return (
    <>
      <Crumbs
        spool={spool}
        printerName={printer?.name}
        unitLabel={unit?.label}
        step={step}
      />
      {step === "printer" ? (
        <div
          class="fss-choice-grid"
          style={{
            "--columns": String(
              Math.max(1, printers.length),
            ),
          }}
        >
          {printers.map((candidate, index) => {
            const verdict = describePrinterVerdict({
              printer: candidate,
              spool,
            })
            return (
              <button
                key={candidate.id}
                type="button"
                class={
                  verdict.isGood
                    ? "fss-choice is-good"
                    : "fss-choice"
                }
                disabled={!candidate.isOnline}
                onClick={() =>
                  onChoosePrinter(candidate.id)
                }
              >
                <span class="fss-choice-head">
                  {index + 1} · {candidate.name}
                </span>
                <span class="fss-choice-sub">
                  {describePrinterForAssign(candidate)}
                </span>
                <span class="fss-choice-fill" />
                <Verdict {...verdict} />
              </button>
            )
          })}
        </div>
      ) : null}
      {step === "ams" && printer ? (
        <div
          class="fss-choice-grid"
          style={{
            "--columns": String(
              Math.max(1, printer.ams.length),
            ),
          }}
        >
          {printer.ams.map((candidate) => {
            const hasRoom = candidate.trays.some(
              (tray) => tray.state !== "read",
            )
            return (
              <button
                key={candidate.id}
                type="button"
                class={
                  hasRoom
                    ? "fss-choice is-good"
                    : "fss-choice"
                }
                onClick={() => onChooseAms(candidate.id)}
              >
                <span class="fss-choice-head">
                  {candidate.label}
                </span>
                <span class="fss-choice-sub">
                  {describeAmsUnit(candidate)}
                </span>
                <span class="fss-choice-fill" />
                <MiniTrays unit={candidate} />
              </button>
            )
          })}
        </div>
      ) : null}
      {step === "slot" && unit ? (
        <div
          class="fss-choice-grid"
          style={{
            "--columns": String(
              Math.max(1, unit.trays.length),
            ),
          }}
        >
          {unit.trays.map((tray, index) => {
            const verdict = describeSlotVerdict({
              tray,
              spool,
            })
            return (
              <button
                key={tray.id}
                type="button"
                class={[
                  "fss-choice",
                  verdict.isGood ? "is-good" : "",
                  tray.state === "empty" ? "is-empty" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => onChooseSlot(tray.id)}
              >
                <span class="fss-choice-head">
                  Slot {index + 1}
                </span>
                {tray.state === "empty" ? (
                  <span class="fss-choice-swatch is-empty" />
                ) : (
                  <span class="fss-choice-swatch">
                    <Swatch size="fill" rgba={tray.rgba} />
                  </span>
                )}
                <span class="fss-choice-sub">
                  {describeSlotContents(tray)}
                </span>
                <span class="fss-choice-fill" />
                <Verdict {...verdict} />
              </button>
            )
          })}
        </div>
      ) : null}
      <SpoolFooter
        left={
          <button
            type="button"
            class="fss-btn is-small"
            onClick={onBack}
          >
            {step === "printer" ? "Cancel" : "Back"}
          </button>
        }
        right={
          <span class="fss-hint">
            {step === "printer"
              ? "Tap a printer."
              : step === "ams"
                ? "Tap an AMS."
                : `Tap a slot to assign ${shortName} to it.`}
          </span>
        }
      />
    </>
  )
}
