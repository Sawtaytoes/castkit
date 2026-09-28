import type { PrinterJob } from "@castkit/shared/viewData/types"
import { useEffect, useState } from "preact/hooks"
import {
  clearPrinterPlate,
  clockConfig,
  nowMs,
  pausePrinter,
  printers,
  resumePrinter,
  stopPrinter,
} from "../state.ts"
import {
  formatEndedTime,
  formatFinishTime,
  formatRemaining,
  getFinishAtMs,
  getPrinterJobTitle,
  isSettledPrinterJob,
} from "./printerJob.ts"

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
 * `Clear plate` button takes their place with the andon reminder under it.
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
 */

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

/** Left-to-right ordering is HA's; the badge only counts the columns. */
const PrinterCard = ({
  index,
  isExpanded,
  job,
  onClear,
  onToggleExpanded,
  pendingAction,
  onRequest,
}: {
  index: number
  isExpanded: boolean
  job: PrinterJob
  onClear: () => void
  onToggleExpanded: () => void
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

  return (
    <article
      class="printer-card"
      data-intent={getCardIntent(job)}
      data-state={job.state}
      data-expanded={String(isExpanded)}
    >
      {job.thumbnailPath ? (
        <div class="printer-plate">
          {/* The plate render is decorative: every fact it carries is already
              written beside it, and a name read out of a picture is not one a
              screen reader can announce. */}
          <img alt="" src={job.thumbnailPath} />
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
            {STATE_LABELS[job.state]}
          </div>
        </div>
        <button
          type="button"
          class="printer-job"
          title={job.jobName}
          onClick={onToggleExpanded}
        >
          {jobTitle || job.jobName || "Untitled print"}
        </button>
        {job.problemText ? (
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
            {/* One tap, no question. Clearing a plate is what the printer's
                own andon button does with one press, and a print that has
                already stopped cannot be lost by it. The pending label is
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
            <p class="printer-clear-hint">
              Or press the andon button on the printer.
            </p>
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
                  {job.filamentText ? (
                    <>
                      {job.filamentColor ? (
                        <span
                          class="printer-swatch"
                          style={{
                            background: job.filamentColor,
                          }}
                        />
                      ) : null}
                      <span>{job.filamentText}</span>
                    </>
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
                {pendingAction === "pause" ||
                pendingAction === "resume"
                  ? PENDING_LABELS[pendingAction]
                  : isPaused
                    ? "Resume"
                    : "Pause"}
              </button>
              <button
                type="button"
                class="printer-action is-stop"
                data-castkit-target={`printer-stop:${job.id}`}
                disabled={isPending}
                onClick={() => onRequest("stop")}
              >
                {pendingAction === "stop"
                  ? PENDING_LABELS.stop
                  : "Stop"}
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
  const [pending, setPending] = useState<
    Record<string, PendingAction>
  >(() => storyPending.value)

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

  const confirmedJob = confirmation
    ? jobs.find((job) => job.id === confirmation.printerId)
    : undefined

  return (
    <div
      class="printer-status"
      data-count={String(jobs.length)}
    >
      <div class="printer-cards">
        {jobs.map((job, index) => (
          <PrinterCard
            key={job.id}
            index={index}
            isExpanded={expandedIds.includes(job.id)}
            job={job}
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
              setExpandedIds((currentIds) =>
                currentIds.includes(job.id)
                  ? currentIds.filter((id) => id !== job.id)
                  : [...currentIds, job.id],
              )
            }}
          />
        ))}
      </div>
      {confirmation && confirmedJob ? (
        <div
          class="printer-confirm"
          role="dialog"
          aria-modal="true"
          aria-label={
            CONFIRM_QUESTIONS[confirmation.action]
          }
        >
          <div class="printer-confirm-box">
            <p class="printer-confirm-question">
              {CONFIRM_QUESTIONS[confirmation.action]}
            </p>
            <p class="printer-confirm-detail">
              {confirmedJob.name} ·{" "}
              {getPrinterJobTitle(confirmedJob) ||
                confirmedJob.jobName}
            </p>
            <div class="printer-confirm-actions">
              <button
                type="button"
                class="printer-confirm-cancel"
                onClick={() => setConfirmation(null)}
              >
                Keep printing
              </button>
              <button
                type="button"
                class="printer-confirm-commit"
                data-action={confirmation.action}
                onClick={confirm}
              >
                {CONFIRM_VERBS[confirmation.action]}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
