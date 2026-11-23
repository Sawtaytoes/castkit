import type { PrinterJob } from "@castkit/shared/viewData/types"
import { computed } from "@preact/signals"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "preact/hooks"
import {
  clearPrinterPlate,
  clockConfig,
  nowMs,
  pausePrinter,
  printers,
  resumePrinter,
  stopPrinter,
} from "../state.ts"
import { ExpandableMedia } from "./ExpandableMedia.tsx"
import {
  FilamentControl,
  FilamentDetailsDialog,
  findSummarySlot,
  getFilamentSlotMetadata,
  getFilamentSlotName,
  getFilamentSummaryText,
  withActiveColor,
} from "./FilamentDetails.tsx"
import {
  PrinterDetailsDialog,
  type PrinterDetailsEntry,
} from "./PrinterDetailsDialog.tsx"
import {
  formatEndedTime,
  formatFinishTime,
  formatRemaining,
  getFinishAtMs,
  getPrinterJobTitle,
  isSettledPrinterJob,
} from "./printerJob.ts"
import {
  choosePrinterLayout,
  chooseQuadCardShape,
  fitPrinterRows,
  type PrinterLayout,
} from "./printerRowFit.ts"
import { useDialogFocus } from "./useDialogFocus.ts"
import { useKeepFocusByKey } from "./useKeepFocusByKey.ts"

/**
 * Printer Status: one column per printer that Home Assistant calls active.
 *
 * The workbench panel stands beside the machines, so this view carries no
 * camera and no printer that is idle — a card on the glass means a job is
 * running on the bench in front of you, or has just stopped and is still
 * holding its plate. Home Assistant decides what "active" means and pushes
 * only those printers; the view renders what it is handed.
 *
 * A FINISHED or FAILED job stays on the glass until somebody clears the plate.
 * The whole card takes the state's color, the band reads the end rather than
 * the time left, the metrics and the Pause/Stop pair go, and a full-width
 * `Clear plate` button takes their place, with nothing under it.
 * The card leaves when the next `printers` push no longer carries the job —
 * the same way a stopped print leaves today. See
 * docs/decisions/2026-09-28-a-finished-print-stays-on-the-glass-until-the-plate-is-cleared.md.
 *
 * The shape is the shared progress card's: a wide band with the percentage set
 * large, then the labeled facts. It is REPRODUCED from design tokens rather
 * than imported.
 *
 * The state word sits in the HEAD, at the right of the printer's name. It is a
 * fact about the printer rather than about the progress, so it belongs with the
 * name. The controls that change it sit at the FOOT of the card, full width,
 * because a fingertip on a wall panel needs a control taller than the head
 * could hold beside a name.
 *
 * The band then carries the percentage at its right and THE TIME LEFT at its
 * left. The time left is the fact a person walking up to a running printer
 * wants, and it is the one the metric row used to show in the smallest type on
 * the card. It is not repeated: `Remaining` is gone from the metric row, which
 * is why that row is two blocks wide and not three.
 * Slatecast has no Tailwind, does not install the component library, and lives
 * inside a 60 KB budget. See
 * docs/decisions/2026-09-23-printer-status-is-a-castkit-view-fed-by-home-assistant.md.
 *
 * FOUR printers use a 2×2 grid with the plate beside the facts. FIVE OR MORE
 * use one compact row each, with the plate, the facts, the band and the
 * controls, and the view draws only the rows that finish on the glass. A
 * printer that does not fit is named in a "+N more" strip under the last row;
 * `printerRowFit.ts` does the arithmetic. See
 * docs/decisions/2026-09-28-printer-status-adds-layouts-from-four.md and
 * docs/decisions/2026-11-22-printer-status-four-plus-layouts-land-and-name-the-printers-they-hide.md.
 */

/**
 * The view's own top and bottom padding, from `styles.css`. Used only for the
 * first frame, before the card area has been measured.
 */
const PRINTER_STATUS_VERTICAL_PADDING = 36
const PRINTER_STATUS_HORIZONTAL_PADDING = 52

/**
 * A row drops its Layer, Finishes and Filament tiles at this width of the
 * view's content box or less. The view also drops them, at any width, when
 * a drawn row's state word would be cut: no fixed width holds the widest
 * facts in every font a panel may fall back to.
 */
export const PRINTER_ROW_FACTS_MIN_WIDTH = 1048

/**
 * The width of the view's content box, the box its container queries see.
 * Computed sizes, not `clientWidth`: they keep the fraction of a pixel the
 * container queries see, so a 300.31 px view is not taken for a 300 px one,
 * and they ignore a turned stage's rotation.
 */
/**
 * Whether an element's words run past its box, to the fraction of a pixel.
 * `scrollWidth` and `clientWidth` round, so a word 0.4 px too long reads as
 * whole while its last letters are an ellipsis. A turned stage turns both
 * boxes alike, so each is taken along its longer side, which for one line
 * of words is the line.
 */
export const isTextCut = (element: HTMLElement) => {
  const range = document.createRange()
  range.selectNodeContents(element)
  const text = range.getBoundingClientRect()
  const box = element.getBoundingClientRect()
  /*
   * Chromium lays out in 1/64 px units. A word one unit over its box still
   * draws whole ("Failed" at 37 px in 36.984 px); two units, 0.03 px, end
   * in an ellipsis. So the line is drawn between them.
   */
  return (
    Math.max(text.width, text.height) >
    Math.max(box.width, box.height) + 0.02
  )
}

/** A width the view measured, and the payload, height and fonts it held. */
type MeasuredWidth = { width: number; key: object }

/*
 * The clock's minute. A finish time can narrow as the clock moves ("Tue
 * 10:59p" becomes "10:59p" once it is today), so a width measured in one
 * minute is tried again in the next. The view reads the minute, not the
 * second, so the clock re-renders it once a minute.
 */
const nowMinute = computed(() =>
  Math.floor(nowMs.value / 60_000),
)

const getContentWidth = (view: HTMLElement) => {
  const viewStyle = getComputedStyle(view)
  return (
    Number.parseFloat(viewStyle.width) -
    Number.parseFloat(viewStyle.paddingLeft) -
    Number.parseFloat(viewStyle.paddingRight) -
    Number.parseFloat(viewStyle.borderLeftWidth) -
    Number.parseFloat(viewStyle.borderRightWidth)
  )
}

/**
 * How long a pause/stop question stays on the card before it withdraws itself.
 *
 * A confirmation nobody answered must not sit on the glass: the panel is a wall
 * display, the next person to walk up did not ask the question, and a live Stop
 * button under their thumb is the failure this timer exists to prevent.
 */
const CONFIRM_TIMEOUT_MS = 12_000

/**
 * How long a sent command shows as pending before the button becomes live
 * again. The printer's own state is what ends it normally; this is the floor
 * for a command Home Assistant silently dropped.
 */
const PENDING_TIMEOUT_MS = 15_000

/**
 * A clear-plate request's own floor. The job leaving the payload is what ends
 * it normally; a job still on the glass after this long means the request did
 * not land, and the button becomes live again so it can be tapped once more.
 */
const CLEAR_PENDING_TIMEOUT_MS = 10_000

type PendingAction = "pause" | "resume" | "stop" | "clear"

/** The actions that ask first. Clearing a plate does not: see `PrinterCard`. */
type ConfirmedAction = Exclude<PendingAction, "clear">

type Confirmation = {
  printerId: string
  action: ConfirmedAction
}

const CONFIRM_QUESTIONS: Record<ConfirmedAction, string> = {
  pause: "Pause this print?",
  resume: "Resume this print?",
  stop: "Stop this print?",
}

const CONFIRM_VERBS: Record<ConfirmedAction, string> = {
  pause: "Pause",
  resume: "Resume",
  stop: "Stop",
}

/**
 * The question a Pause or Stop tap asks before it acts. It is modal, so it
 * holds the keyboard: focus starts on the answer that changes nothing.
 */
const PrinterConfirmDialog = ({
  action,
  detail,
  onCancel,
  onCommit,
  returnFocusKey,
}: {
  action: ConfirmedAction
  detail: string
  onCancel: () => void
  onCommit: () => void
  /** The `data-focus-key` of the Pause or Stop that asked. */
  returnFocusKey: string
}) => {
  const dialog = useRef<HTMLDivElement>(null)
  const cancelButton = useRef<HTMLButtonElement>(null)
  useDialogFocus({
    dialogRef: dialog,
    initialFocusRef: cancelButton,
    onEscape: onCancel,
    returnFocusKey,
  })
  return (
    <div
      ref={dialog}
      class="printer-confirm"
      role="dialog"
      aria-modal="true"
      aria-label={CONFIRM_QUESTIONS[action]}
    >
      <div class="printer-confirm-box">
        <p class="printer-confirm-question">
          {CONFIRM_QUESTIONS[action]}
        </p>
        <p class="printer-confirm-detail">{detail}</p>
        <div class="printer-confirm-actions">
          <button
            ref={cancelButton}
            type="button"
            class="printer-confirm-cancel"
            onClick={onCancel}
          >
            Keep printing
          </button>
          <button
            type="button"
            class="printer-confirm-commit"
            data-action={action}
            onClick={onCommit}
          >
            {CONFIRM_VERBS[action]}
          </button>
        </div>
      </div>
    </div>
  )
}

const PENDING_LABELS: Record<PendingAction, string> = {
  pause: "Pausing…",
  resume: "Resuming…",
  stop: "Stopping…",
  clear: "Clearing…",
}

/**
 * The percentage as the card writes it: whole numbers, rounded down. A feed
 * may send `99.99`, which is too wide for a compact row's band, and rounding
 * up would claim 100% for a print that is still running.
 */
const formatPercent = (percent: number) =>
  `${Math.floor(percent)}%`

const STATE_LABELS: Record<PrinterJob["state"], string> = {
  preparing: "Preparing",
  printing: "Printing",
  paused: "Paused",
  finished: "Finished",
  failed: "Failed",
}

type CardIntent =
  | "neutral"
  | "warning"
  | "danger"
  | "success"

/**
 * The card's tint. A fault outranks everything: a failed print is a fault and
 * a finished one that also reports a problem is still a problem.
 */
const getCardIntent = (job: PrinterJob): CardIntent => {
  if (
    job.problemText !== undefined ||
    job.state === "failed"
  ) {
    return "danger"
  }
  if (job.state === "finished") {
    return "success"
  }
  if (job.state === "paused") {
    return "warning"
  }
  return "neutral"
}

/**
 * Pending state a story can start a card in. Stories and tests only — the
 * pending label is component state, and a story cannot tap the button before
 * its picture is taken. Mirrors `__setPhotoUrlBuilderForStories`.
 */
const storyPending: {
  value: Record<string, PendingAction>
} = { value: {} }

/** Start the next mount of the view with these actions pending. */
export const __setPrinterPendingForStories = (
  pending: Record<string, PendingAction>,
) => {
  storyPending.value = pending
}

type ActionIconName =
  | "pause"
  | "resume"
  | "stop"
  | "pending"

/**
 * Lucide's `pause`, `play`, `square` and `loader-circle` glyphs, copied as
 * paths because Slatecast installs no icon package. Only the compact rows on a
 * narrow panel show them; the word stays in the button for assistive tech.
 */
const ACTION_ICON_PATHS: Record<ActionIconName, string[]> =
  {
    pause: [
      "M15 3h3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z",
      "M6 3h3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z",
    ],
    resume: [
      "M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z",
    ],
    stop: [
      "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z",
    ],
    pending: ["M21 12a9 9 0 1 1-6.219-8.56"],
  }

const ActionIcon = ({ name }: { name: ActionIconName }) => (
  <svg
    class="printer-action-icon"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    {ACTION_ICON_PATHS[name].map((path) => (
      <path key={path} d={path} />
    ))}
  </svg>
)

/** Left-to-right ordering is HA's; the badge only counts the columns. */
/**
 * The layer and the finish time in words, for the details dialog. A compact
 * row drops its Layer and Finishes tiles, so the dialog keeps them reachable.
 * A settled job gives when it ended instead, which a narrow band drops.
 */
const getProgressText = (job: PrinterJob) => {
  if (isSettledPrinterJob(job)) {
    return job.finishAtMs === undefined
      ? undefined
      : `Ended ${formatEndedTime({
          clock: clockConfig.value,
          endedAtMs: job.finishAtMs,
          nowMillis: nowMs.value,
        })}`
  }
  const finishAtMs = getFinishAtMs({
    job,
    nowMillis: nowMs.value,
  })
  return (
    [
      job.currentLayer === undefined
        ? undefined
        : job.totalLayers === undefined
          ? `Layer ${job.currentLayer}`
          : `Layer ${job.currentLayer} / ${job.totalLayers}`,
      // The feed's own time left, which a narrow band drops; it can differ
      // from the finish time.
      job.state === "paused" ||
      job.remainingMinutes === undefined
        ? undefined
        : `${formatRemaining(job.remainingMinutes)} left`,
      job.state === "paused" || finishAtMs === null
        ? undefined
        : `Finishes ${formatFinishTime({
            clock: clockConfig.value,
            finishAtMs,
            nowMillis: nowMs.value,
          })}`,
    ]
      .filter(Boolean)
      .join(" · ") || undefined
  )
}

/**
 * The filament for the details dialog: the feed's summary when no slot says
 * it, then each slot with its tray, as the filament dialog lists them.
 */
const getFilamentLines = (job: PrinterJob) => {
  if (isSettledPrinterJob(job)) {
    return undefined
  }
  const summaryText = getFilamentSummaryText({
    filaments: job.filaments,
    summary: job.filamentText,
  })
  const summarySlot = findSummarySlot({
    filaments: job.filaments,
    summary: job.filamentText,
  })
  const lines = [
    ...(summaryText
      ? [
          {
            text: summaryText,
            // The feed's active color, when it names no slot to show it.
            filament: job.filamentColor
              ? { color: job.filamentColor }
              : undefined,
          },
        ]
      : []),
    ...(job.filaments ?? []).map((filament) => ({
      text: [
        getFilamentSlotName(filament),
        filament.location,
        getFilamentSlotMetadata(filament),
      ]
        .filter(Boolean)
        .join(" · "),
      filament: withActiveColor(filament, {
        activeColor: job.filamentColor,
        summarySlot,
      }),
    })),
  ]
  return lines.length ? lines : undefined
}

const PrinterCard = ({
  index,
  isExpanded,
  isFilamentDetailsOpen,
  job,
  layout,
  onClear,
  onToggleExpanded,
  onShowFilaments,
  onStateCut,
  pendingAction,
  onRequest,
}: {
  index: number
  isExpanded: boolean
  isFilamentDetailsOpen: boolean
  job: PrinterJob
  layout: PrinterLayout
  onClear: () => void
  onToggleExpanded: () => void
  onShowFilaments: () => void
  /** Called after any render that leaves the state word cut. */
  onStateCut: () => void
  pendingAction: PendingAction | null
  onRequest: (action: ConfirmedAction) => void
}) => {
  /*
   * After every render of this card, its own included: a clock tick that
   * widens the finish time re-renders the card alone, and can cut the state
   * word with no change to the view around it.
   */
  const stateLabelRef = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const label = stateLabelRef.current
    if (label && isTextCut(label)) {
      onStateCut()
    }
  })
  const clock = clockConfig.value
  const isPaused = job.state === "paused"
  const isSettled = isSettledPrinterJob(job)
  const isFinished = job.state === "finished"
  const finishAtMs = getFinishAtMs({
    job,
    nowMillis: nowMs.value,
  })
  const jobTitle = getPrinterJobTitle(job)
  const remainingText =
    isPaused ||
    isSettled ||
    job.remainingMinutes === undefined
      ? null
      : formatRemaining(job.remainingMinutes)
  const endedText =
    isSettled && job.finishAtMs !== undefined
      ? `Ended ${formatEndedTime({
          clock,
          endedAtMs: job.finishAtMs,
          nowMillis: nowMs.value,
        })}`
      : null
  const settledText = isFinished
    ? "Finished"
    : job.currentLayer === undefined
      ? "Failed"
      : `Stopped at layer ${job.currentLayer}`
  const isPending = pendingAction !== null
  const isCompact = layout !== "columns"
  /*
   * A compact row has one line under the name. A fault takes it, because it
   * is the more urgent fact, and the line stays the control that opens the
   * full job name and the full fault.
   */
  const isProblemOnJobLine =
    layout === "list" && job.problemText !== undefined

  return (
    <article
      class="printer-card"
      data-intent={getCardIntent(job)}
      data-state={job.state}
      data-expanded={String(isExpanded)}
      data-has-thumbnail={String(
        Boolean(job.thumbnailPath),
      )}
    >
      {job.thumbnailPath ? (
        <div class="printer-plate">
          {/* The plate render is decorative: every fact it carries is already
              written beside it, and a name read out of a picture is not one a
              screen reader can announce. */}
          <ExpandableMedia name={`${job.name} print image`}>
            <img alt="" src={job.thumbnailPath} />
          </ExpandableMedia>
        </div>
      ) : null}
      <div class="printer-body">
        <div class="printer-head">
          <div class="printer-index" aria-hidden="true">
            {index + 1}
          </div>
          <div class="printer-names">
            <div class="printer-name">{job.name}</div>
            {job.nozzleText ? (
              <div class="printer-meta">
                {job.nozzleText}
              </div>
            ) : null}
          </div>
          {/* The state reads at the right of the name. The dot carries the
              same fact for a glance from a step back, and is hidden from the
              accessibility tree because the word beside it already says it. */}
          <div class="printer-state">
            <span
              class="printer-state-dot"
              aria-hidden="true"
            />
            <span
              ref={stateLabelRef}
              class="printer-state-label"
            >
              {STATE_LABELS[job.state]}
            </span>
          </div>
        </div>
        <button
          type="button"
          class="printer-job"
          data-focus-key={`printer-job:${job.id}`}
          title={job.jobName}
          aria-haspopup={isCompact ? "dialog" : undefined}
          onClick={onToggleExpanded}
        >
          {isProblemOnJobLine ? (
            <span class="printer-problem" role="status">
              {job.problemText}
            </span>
          ) : (
            jobTitle || job.jobName || "Untitled print"
          )}
        </button>
        {job.problemText && !isProblemOnJobLine ? (
          <p class="printer-problem" role="status">
            <span class="printer-problem-text">
              {job.problemText}
            </span>
          </p>
        ) : null}
        <div class="printer-band">
          <div
            class="printer-band-fill"
            style={{
              width: `${isFinished ? 100 : job.percent}%`,
            }}
          />
          <div class="printer-band-text">
            {/* Absent rather than an em dash: a paused printer has no honest
                estimate, and the chip above already says why. An em dash here
                would be a placeholder holding open a space for nothing. */}
            {remainingText === null ? null : (
              <span class="printer-band-remaining">
                {remainingText} left
              </span>
            )}
            {/* A settled card says how it ended where the time left was. Two
                lines, because "Stopped at layer 32" and its time do not fit
                one line beside the percentage at three columns. */}
            {isSettled ? (
              <span class="printer-band-ended">
                <span>{settledText}</span>
                {endedText === null ? null : (
                  <span>{endedText}</span>
                )}
              </span>
            ) : null}
            <span class="printer-percent">
              {formatPercent(
                isFinished ? 100 : job.percent,
              )}
            </span>
          </div>
        </div>
        {isSettled ? (
          <>
            {/* One tap, no question: a print that has already stopped cannot
                be lost by it. Nothing under the button either — a sentence
                pointing at other hardware is noise to someone already reading
                the button (the owner's words, 2026-09-28), and that hardware
                is one household's, not every panel's. The pending label is
                the only feedback until the job leaves the payload. */}
            <button
              type="button"
              class="printer-clear"
              data-castkit-target={`printer-clear-plate:${job.id}`}
              disabled={isPending}
              onClick={onClear}
            >
              {pendingAction === "clear"
                ? PENDING_LABELS.clear
                : "Clear plate"}
            </button>
          </>
        ) : (
          <>
            <dl class="printer-metrics">
              <div class="printer-metric">
                <dt>Layer</dt>
                <dd>
                  <span>
                    {job.currentLayer === undefined
                      ? "—"
                      : job.totalLayers === undefined
                        ? String(job.currentLayer)
                        : `${job.currentLayer} / ${job.totalLayers}`}
                  </span>
                </dd>
              </div>
              <div class="printer-metric">
                <dt>Finishes</dt>
                <dd>
                  <span>
                    {isPaused || finishAtMs === null
                      ? "—"
                      : formatFinishTime({
                          clock,
                          finishAtMs,
                          nowMillis: nowMs.value,
                        })}
                  </span>
                </dd>
              </div>
              {/*
               * Always drawn. An active job always prints from a tray, but the
               * printer names it only once the print starts; dropping the row
               * until then made a preparing card shorter than its neighbors.
               */}
              <div
                class={
                  job.filamentText
                    ? "printer-metric is-filament"
                    : "printer-metric is-filament is-pending"
                }
              >
                <dt>
                  Filament
                  {/* A row's count, on the label's line. The button below
                      names the count for assistive tech. */}
                  {job.filaments?.length ? (
                    <span
                      class="printer-filament-tally"
                      aria-hidden="true"
                    >
                      {job.filaments.length === 1
                        ? "1 filament"
                        : `${job.filaments.length} filaments`}{" "}
                      ›
                    </span>
                  ) : null}
                </dt>
                <dd>
                  {job.filamentText ||
                  job.filaments?.length ? (
                    <FilamentControl
                      focusKey={`printer-filaments:${job.id}`}
                      color={job.filamentColor}
                      isExpanded={isFilamentDetailsOpen}
                      filaments={job.filaments}
                      onClick={onShowFilaments}
                      text={job.filamentText}
                    />
                  ) : (
                    <>
                      <span class="printer-swatch is-pending" />
                      {/* A 2×2 card's or a row's tile is too narrow
                          for the full sentence, so they say it short. */}
                      <span class="printer-pending-long">
                        Chosen when the print starts
                      </span>
                      <span class="printer-pending-short">
                        Not yet
                      </span>
                    </>
                  )}
                </dd>
              </div>
            </dl>
            {/* The pair sits at the foot of the card, full width and a
                fingertip tall. A button in the head beside the name was
                13 px of type on a wall panel. */}
            <div class="printer-actions">
              <button
                type="button"
                class="printer-action is-pause"
                data-focus-key={`printer-pause:${job.id}`}
                data-castkit-target={`printer-${isPaused ? "resume" : "pause"}:${job.id}`}
                data-is-pending={
                  pendingAction === "pause" ||
                  pendingAction === "resume"
                    ? "true"
                    : undefined
                }
                disabled={isPending}
                onClick={() =>
                  onRequest(isPaused ? "resume" : "pause")
                }
              >
                <ActionIcon
                  name={
                    pendingAction === "pause" ||
                    pendingAction === "resume"
                      ? "pending"
                      : isPaused
                        ? "resume"
                        : "pause"
                  }
                />
                <span class="printer-action-label">
                  {pendingAction === "pause" ||
                  pendingAction === "resume"
                    ? PENDING_LABELS[pendingAction]
                    : isPaused
                      ? "Resume"
                      : "Pause"}
                </span>
              </button>
              <button
                type="button"
                class="printer-action is-stop"
                data-focus-key={`printer-stop:${job.id}`}
                data-castkit-target={`printer-stop:${job.id}`}
                data-is-pending={
                  pendingAction === "stop"
                    ? "true"
                    : undefined
                }
                disabled={isPending}
                onClick={() => onRequest("stop")}
              >
                <ActionIcon
                  name={
                    pendingAction === "stop"
                      ? "pending"
                      : "stop"
                  }
                />
                <span class="printer-action-label">
                  {pendingAction === "stop"
                    ? PENDING_LABELS.stop
                    : "Stop"}
                </span>
              </button>
            </div>
          </>
        )}
      </div>
    </article>
  )
}

export const PrinterStatus = () => {
  const jobs = printers.value?.printers ?? []
  const [confirmation, setConfirmation] =
    useState<Confirmation | null>(null)
  const [expandedIds, setExpandedIds] = useState<
    readonly string[]
  >([])
  const [filamentDetailsId, setFilamentDetailsId] =
    useState<string | null>(null)
  const [pending, setPending] = useState<
    Record<string, PendingAction>
  >(() => storyPending.value)
  /*
   * What the details dialog lists: one printer, or the printers the panel
   * could not draw. The hidden set is worked out again on every render, so an
   * open list follows a live update rather than keeping a stale snapshot.
   */
  const [details, setDetails] = useState<
    | { kind: "printer"; printerId: string }
    | { kind: "hidden" }
    | null
  >(null)
  const closeDetails = useCallback(() => {
    setDetails(null)
  }, [])
  const viewRef = useRef<HTMLDivElement>(null)
  const cardsRef = useRef<HTMLDivElement>(null)
  useKeepFocusByKey(viewRef)
  /*
   * The card area's height, and the width of the view's content box: the box
   * the CSS container queries measure. The width is the view's, not the card
   * area's, because the card area's sides change with the arrangement:
   * measuring them would let the arrangement pick itself again, back and
   * forth, on every frame.
   */
  const [cardArea, setCardArea] = useState(() => ({
    height:
      window.innerHeight - PRINTER_STATUS_VERTICAL_PADDING,
    width:
      window.innerWidth - PRINTER_STATUS_HORIZONTAL_PADDING,
  }))
  const availableHeight = cardArea.height
  const hasJobs = jobs.length > 0
  /*
   * The widest view, so far, whose rows cut a state word with their facts
   * drawn. The rows keep the facts folded at that width and narrower; a
   * wider view, another height, a font that loads, or new facts tries them
   * again.
   */
  const [crowded, setCrowded] =
    useState<MeasuredWidth | null>(null)
  /*
   * The widest view, so far, whose rows cut a state word with their facts
   * already folded: nothing is left to give way, so the view draws no rows
   * there and the strip counts every printer, as a view under 188 px does.
   * The same changes try the rows again.
   */
  const [rowless, setRowless] =
    useState<MeasuredWidth | null>(null)
  /*
   * A font that finishes loading changes every word's width without a new
   * size or payload, so it counts as a change too.
   */
  const [fontLoads, setFontLoads] = useState(0)
  useEffect(() => {
    const fonts = document.fonts
    const handleLoadingDone = () => {
      setFontLoads((count) => count + 1)
    }
    fonts.addEventListener("loadingdone", handleLoadingDone)
    return () => {
      fonts.removeEventListener(
        "loadingdone",
        handleLoadingDone,
      )
    }
  }, [])
  const printersPayload = printers.value
  const cardAreaHeight = cardArea.height
  /*
   * New facts may fit where the old ones did not. So may another height (a
   * row's height sizes its picture, which takes width from the rest) or
   * another font. A width counts only under the key it was measured with,
   * so no effect has to clear it, and a card that reports a cut in the same
   * commit as a change keeps its report.
   */
  const minute = nowMinute.value
  const measureKey = useMemo(() => {
    void printersPayload
    void cardAreaHeight
    void fontLoads
    void minute
    return {}
  }, [printersPayload, cardAreaHeight, fontLoads, minute])
  const measureKeyRef = useRef(measureKey)
  measureKeyRef.current = measureKey
  const cardAreaWidthRef = useRef(cardArea.width)
  cardAreaWidthRef.current = cardArea.width
  const crowdedWidth =
    crowded?.key === measureKey ? crowded.width : null
  const rowlessWidth =
    rowless?.key === measureKey ? rowless.width : null
  /*
   * A row whose state word is cut while the facts are drawn folds them; one
   * cut with the facts folded draws no rows. Each card reports a cut after
   * its own render. Each step only removes what is measured, so this cannot
   * loop: only a wider view, another height or font, or a new payload tries
   * the rows again.
   */
  const handleStateCut = useCallback(() => {
    const view = viewRef.current
    if (view?.dataset.layout !== "list") {
      return
    }
    /*
     * The width drawn, or the width the view lays out for if that is wider:
     * the first render, and a turned stage, draw before the view's own
     * measure catches up, and the record must cover the width in use or
     * the cut stays and reports again.
     */
    const measured = {
      width: Math.max(
        getContentWidth(view),
        cardAreaWidthRef.current,
      ),
      key: measureKeyRef.current,
    }
    // The same record again changes nothing, so a report renders no more.
    const keepWider = (previous: MeasuredWidth | null) =>
      previous?.key === measured.key &&
      previous.width >= measured.width
        ? previous
        : measured
    if (view.dataset.isFolded === "true") {
      setRowless(keepWider)
    } else {
      setCrowded(keepWider)
    }
  }, [])
  /*
   * After every render: a strip whose first line would cut a chip's state
   * draws no chips, only its count, as on a small round panel. A chip that
   * says "Prepa…" names no state. The chips are drawn again first, so a
   * wider strip or a narrower font brings them back; this is before paint,
   * so the glass never shows the cut chip.
   */
  useLayoutEffect(() => {
    const list =
      viewRef.current?.querySelector<HTMLElement>(
        ".printer-overflow-list",
      )
    if (!list) {
      return
    }
    delete list.dataset.isCut
    const isCut = Array.from(
      list.querySelectorAll<HTMLElement>(
        ".printer-overflow-item",
      ),
    ).some((item) => {
      const state = item.querySelector<HTMLElement>(
        ".printer-overflow-state",
      )
      return (
        item.offsetTop < list.clientHeight &&
        state !== null &&
        isTextCut(state)
      )
    })
    if (isCut) {
      list.dataset.isCut = "true"
    }
  })

  /*
   * The card area's size decides the arrangement and how many rows finish on
   * the glass. It is
   * measured, not taken from the window, because a view does not own the
   * whole window on every screen. The strip sits INSIDE the card area, so
   * showing it does not change what is measured.
   */
  useLayoutEffect(() => {
    const view = viewRef.current
    const cards = cardsRef.current
    if (!hasJobs || !view || !cards) {
      return undefined
    }
    const measure = () => {
      const contentWidth = getContentWidth(view)
      const cardsHeight = Number.parseFloat(
        getComputedStyle(cards).height,
      )
      setCardArea((current) =>
        current.height === cardsHeight &&
        current.width === contentWidth
          ? current
          : {
              height: cardsHeight,
              width: contentWidth,
            },
      )
    }
    measure()
    /*
     * Only the view is watched. The card area fills the view's height, so it
     * changes height only when the view does, and its width changes with the
     * arrangement, which a watch on it would report back as a new size.
     */
    const observer = new ResizeObserver(measure)
    observer.observe(view)
    return () => {
      observer.disconnect()
    }
  }, [hasJobs])

  /*
   * An empty feed draws the idle message instead of the cards, which
   * unmounts any open dialog without closing it. Forget what was open, so the
   * next printer to arrive does not bring the dialog back unasked.
   */
  useEffect(() => {
    if (!hasJobs) {
      setDetails(null)
      setFilamentDetailsId(null)
      setConfirmation(null)
    }
  }, [hasJobs])

  // A question nobody answered withdraws itself.
  useEffect(() => {
    if (!confirmation) {
      return undefined
    }
    const timerId = window.setTimeout(() => {
      setConfirmation(null)
    }, CONFIRM_TIMEOUT_MS)
    return () => {
      window.clearTimeout(timerId)
    }
  }, [confirmation])

  /*
   * The printer's own state ends the pending label. A pause that took effect
   * arrives as `paused`, a stop or a cleared plate arrives as the printer
   * leaving the payload entirely — so a card that is gone, or has reached the
   * state the tap asked for, is confirmation.
   */
  useEffect(() => {
    setPending((currentPending) => {
      const remaining = Object.entries(
        currentPending,
      ).filter(([printerId, action]) => {
        const job = jobs.find(
          (candidate) => candidate.id === printerId,
        )
        if (!job) {
          return false
        }
        return action === "pause"
          ? job.state !== "paused"
          : action === "resume"
            ? job.state === "paused"
            : true
      })
      return remaining.length ===
        Object.keys(currentPending).length
        ? currentPending
        : Object.fromEntries(remaining)
    })
  }, [jobs])

  useEffect(() => {
    if (
      filamentDetailsId &&
      !jobs.some((job) => job.id === filamentDetailsId)
    ) {
      setFilamentDetailsId(null)
    }
  }, [filamentDetailsId, jobs])

  /*
   * A question about a printer that left the feed withdraws itself, so the
   * printer coming back does not bring the question back unasked.
   */
  useEffect(() => {
    if (
      confirmation &&
      !jobs.some((job) => job.id === confirmation.printerId)
    ) {
      setConfirmation(null)
    }
  }, [confirmation, jobs])

  /** Mark a printer pending, and let the mark lapse if nothing answers. */
  const startPending = ({
    action,
    printerId,
    timeoutMs,
  }: {
    action: PendingAction
    printerId: string
    timeoutMs: number
  }) => {
    setPending((currentPending) => ({
      ...currentPending,
      [printerId]: action,
    }))
    window.setTimeout(() => {
      setPending((currentPending) => {
        const { [printerId]: _cleared, ...rest } =
          currentPending
        return rest
      })
    }, timeoutMs)
  }

  const confirm = () => {
    if (!confirmation) {
      return
    }
    const { action, printerId } = confirmation
    setConfirmation(null)
    startPending({
      action,
      printerId,
      timeoutMs: PENDING_TIMEOUT_MS,
    })
    if (action === "pause") {
      pausePrinter(printerId)
      return
    }
    if (action === "resume") {
      resumePrinter(printerId)
      return
    }
    stopPrinter(printerId)
  }

  const clear = (printerId: string) => {
    startPending({
      action: "clear",
      printerId,
      timeoutMs: CLEAR_PENDING_TIMEOUT_MS,
    })
    clearPrinterPlate(printerId)
  }

  if (jobs.length === 0) {
    return (
      <div class="printer-status" data-count="0">
        <div class="printer-empty">
          <h1>Nothing printing</h1>
          <p>The printers are idle.</p>
        </div>
      </div>
    )
  }

  const layout = choosePrinterLayout({
    availableHeight,
    availableWidth: cardArea.width,
    printerCount: jobs.length,
  })
  const isRowless =
    layout === "list" &&
    rowlessWidth !== null &&
    cardArea.width <= rowlessWidth
  const { visibleCount } =
    layout !== "list"
      ? { visibleCount: jobs.length }
      : isRowless
        ? { visibleCount: 0 }
        : fitPrinterRows({
            availableHeight,
            availableWidth: cardArea.width,
            printerCount: jobs.length,
          })
  const isFolded =
    layout === "list" &&
    (cardArea.width <= PRINTER_ROW_FACTS_MIN_WIDTH ||
      (crowdedWidth !== null &&
        cardArea.width <= crowdedWidth))
  const visibleJobs = jobs.slice(0, visibleCount)
  const hiddenJobs = jobs.slice(visibleCount)
  const printerNoun =
    hiddenJobs.length === 1 ? "printer" : "printers"
  // A view too narrow for any row counts every printer, not "more" of them.
  const hiddenCountText =
    visibleCount === 0
      ? `${hiddenJobs.length} ${printerNoun}`
      : `+${hiddenJobs.length} more ${printerNoun}`
  const confirmedJob = confirmation
    ? jobs.find((job) => job.id === confirmation.printerId)
    : undefined
  const filamentDetailsJob = filamentDetailsId
    ? jobs.find((job) => job.id === filamentDetailsId)
    : undefined
  /* A printer that left the payload drops out of an open details list. */
  const detailsPrinterIds =
    details?.kind === "printer"
      ? [details.printerId]
      : details?.kind === "hidden"
        ? hiddenJobs.map((job) => job.id)
        : []
  const detailsTitle =
    details?.kind === "printer"
      ? (jobs.find((job) => job.id === details.printerId)
          ?.name ?? "")
      : hiddenCountText
  const detailsEntries: PrinterDetailsEntry[] = details
    ? jobs.flatMap((job, index) =>
        detailsPrinterIds.includes(job.id)
          ? [
              {
                id: job.id,
                number: index + 1,
                name: job.name,
                intent: getCardIntent(job),
                stateText:
                  job.state === "printing" ||
                  job.state === "paused"
                    ? `${STATE_LABELS[job.state]} · ${formatPercent(job.percent)}`
                    : job.state === "failed"
                      ? [
                          STATE_LABELS[job.state],
                          formatPercent(job.percent),
                          job.currentLayer === undefined
                            ? undefined
                            : `stopped at layer ${job.currentLayer}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      : STATE_LABELS[job.state],
                jobName:
                  getPrinterJobTitle(job) ||
                  job.jobName ||
                  "Untitled print",
                // The file name only when a readable name stands above it.
                fileName:
                  job.jobName &&
                  getPrinterJobTitle(job) &&
                  job.jobName !== getPrinterJobTitle(job)
                    ? job.jobName
                    : undefined,
                problemText: job.problemText,
                nozzleText: job.nozzleText,
                progressText: getProgressText(job),
                filamentLines: getFilamentLines(job),
              },
            ]
          : [],
      )
    : []

  return (
    <div
      ref={viewRef}
      class="printer-status"
      data-count={String(jobs.length)}
      data-layout={layout}
      data-is-folded={isFolded ? "true" : undefined}
      data-quad-shape={
        layout === "quad"
          ? chooseQuadCardShape(cardArea.width)
          : undefined
      }
    >
      <div class="printer-cards" ref={cardsRef}>
        {visibleJobs.map((job, index) => (
          <PrinterCard
            key={job.id}
            index={index}
            isExpanded={
              layout === "columns" &&
              expandedIds.includes(job.id)
            }
            isFilamentDetailsOpen={
              filamentDetailsId === job.id
            }
            job={job}
            layout={layout}
            onStateCut={handleStateCut}
            pendingAction={pending[job.id] ?? null}
            onClear={() => {
              clear(job.id)
            }}
            onRequest={(action) => {
              setConfirmation({
                action,
                printerId: job.id,
              })
            }}
            onToggleExpanded={() => {
              if (layout !== "columns") {
                setDetails({
                  kind: "printer",
                  printerId: job.id,
                })
                return
              }
              setExpandedIds((currentIds) =>
                currentIds.includes(job.id)
                  ? currentIds.filter((id) => id !== job.id)
                  : [...currentIds, job.id],
              )
            }}
            onShowFilaments={() => {
              setFilamentDetailsId(job.id)
            }}
          />
        ))}
        {hiddenJobs.length > 0 ? (
          <button
            type="button"
            class="printer-overflow"
            data-focus-key="printer-overflow"
            aria-haspopup="dialog"
            onClick={() => {
              setDetails({ kind: "hidden" })
            }}
          >
            <span class="printer-overflow-count">
              {hiddenCountText} ›
            </span>
            {/* The chips that fit are a glance; the rest wrap out of sight,
                and the tap lists every one. */}
            <span class="printer-overflow-list">
              {hiddenJobs.map((job, hiddenIndex) => (
                <span
                  key={job.id}
                  class="printer-overflow-item"
                  data-intent={getCardIntent(job)}
                >
                  <span
                    class="printer-overflow-index"
                    aria-hidden="true"
                  >
                    {visibleCount + hiddenIndex + 1}
                  </span>
                  <span class="printer-overflow-name">
                    {job.name}
                  </span>
                  <span class="printer-overflow-state">
                    {job.state === "printing"
                      ? formatPercent(job.percent)
                      : STATE_LABELS[job.state]}
                  </span>
                </span>
              ))}
            </span>
          </button>
        ) : null}
      </div>
      {filamentDetailsJob ? (
        <FilamentDetailsDialog
          filaments={filamentDetailsJob.filaments}
          jobName={
            getPrinterJobTitle(filamentDetailsJob) ||
            filamentDetailsJob.jobName
          }
          onClose={() => setFilamentDetailsId(null)}
          printerName={filamentDetailsJob.name}
          returnFocusKey={`printer-filaments:${filamentDetailsJob.id}`}
          summary={filamentDetailsJob.filamentText}
          activeColor={filamentDetailsJob.filamentColor}
        />
      ) : null}
      {details ? (
        <PrinterDetailsDialog
          title={detailsTitle}
          printers={detailsEntries}
          onClose={closeDetails}
          returnFocusKey={
            details.kind === "hidden"
              ? "printer-overflow"
              : `printer-job:${details.printerId}`
          }
        />
      ) : null}
      {confirmation && confirmedJob ? (
        <PrinterConfirmDialog
          action={confirmation.action}
          detail={`${confirmedJob.name} · ${
            getPrinterJobTitle(confirmedJob) ||
            confirmedJob.jobName
          }`}
          onCancel={() => setConfirmation(null)}
          onCommit={confirm}
          returnFocusKey={`printer-${
            confirmation.action === "stop"
              ? "stop"
              : "pause"
          }:${confirmedJob.id}`}
        />
      ) : null}
    </div>
  )
}
