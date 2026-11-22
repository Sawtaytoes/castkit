import type { PrinterJob } from "@castkit/shared/viewData/types"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
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
}: {
  action: ConfirmedAction
  detail: string
  onCancel: () => void
  onCommit: () => void
}) => {
  const dialog = useRef<HTMLDivElement>(null)
  const cancelButton = useRef<HTMLButtonElement>(null)
  useDialogFocus({
    dialogRef: dialog,
    initialFocusRef: cancelButton,
    onEscape: onCancel,
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
const PrinterCard = ({
  index,
  isExpanded,
  isFilamentDetailsOpen,
  job,
  layout,
  onClear,
  onToggleExpanded,
  onShowFilaments,
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
  pendingAction: PendingAction | null
  onRequest: (action: ConfirmedAction) => void
}) => {
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
            <span class="printer-state-label">
              {STATE_LABELS[job.state]}
            </span>
          </div>
        </div>
        <button
          type="button"
          class="printer-job"
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
            {job.problemText}
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
              {isFinished ? 100 : job.percent}%
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
                <dt>Filament</dt>
                <dd>
                  {job.filamentText ||
                  job.filaments?.length ? (
                    <FilamentControl
                      color={job.filamentColor}
                      isExpanded={isFilamentDetailsOpen}
                      filaments={job.filaments}
                      onClick={onShowFilaments}
                      text={job.filamentText}
                    />
                  ) : (
                    <>
                      <span class="printer-swatch is-pending" />
                      <span>
                        Chosen when the print starts
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
                data-castkit-target={`printer-${isPaused ? "resume" : "pause"}:${job.id}`}
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
                data-castkit-target={`printer-stop:${job.id}`}
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
    /*
     * Computed sizes, not `clientWidth`: they keep the fraction of a pixel
     * the container queries see, so a 300.31 px view is not taken for a
     * 300 px one, and they ignore a turned stage's rotation.
     */
    const measure = () => {
      const viewStyle = getComputedStyle(view)
      const contentWidth =
        Number.parseFloat(viewStyle.width) -
        Number.parseFloat(viewStyle.paddingLeft) -
        Number.parseFloat(viewStyle.paddingRight) -
        Number.parseFloat(viewStyle.borderLeftWidth) -
        Number.parseFloat(viewStyle.borderRightWidth)
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
  const { visibleCount } =
    layout === "list"
      ? fitPrinterRows({
          availableHeight,
          availableWidth: cardArea.width,
          printerCount: jobs.length,
        })
      : { visibleCount: jobs.length }
  const visibleJobs = jobs.slice(0, visibleCount)
  const hiddenJobs = jobs.slice(visibleCount)
  const hiddenCountText = `+${hiddenJobs.length} more ${
    hiddenJobs.length === 1 ? "printer" : "printers"
  }`
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
                    ? `${STATE_LABELS[job.state]} · ${job.percent}%`
                    : job.state === "failed" &&
                        job.currentLayer !== undefined
                      ? `${STATE_LABELS[job.state]} · stopped at layer ${job.currentLayer}`
                      : STATE_LABELS[job.state],
                jobName:
                  getPrinterJobTitle(job) ||
                  job.jobName ||
                  "Untitled print",
                fileName:
                  job.jobName &&
                  job.jobName !== getPrinterJobTitle(job)
                    ? job.jobName
                    : undefined,
                problemText: job.problemText,
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
                      ? `${job.percent}%`
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
        />
      ) : null}
      {details ? (
        <PrinterDetailsDialog
          title={detailsTitle}
          printers={detailsEntries}
          onClose={closeDetails}
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
        />
      ) : null}
    </div>
  )
}
