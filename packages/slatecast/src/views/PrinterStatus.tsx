import type { PrinterJob } from "@castkit/shared/viewData/types"
import { useEffect, useState } from "preact/hooks"
import {
  clockConfig,
  nowMs,
  pausePrinter,
  printers,
  resumePrinter,
  stopPrinter,
} from "../state.ts"
import {
  formatFinishTime,
  formatRemaining,
  getFinishAtMs,
  getPrinterJobTitle,
} from "./printerJob.ts"

/**
 * Printer Status: one column per printer that is printing RIGHT NOW.
 *
 * The workbench panel stands beside the machines, so this view carries no
 * camera and no printer that is idle — a card on the glass means a job is
 * running on the bench in front of you. Home Assistant decides what "active"
 * means and pushes only those printers; the view renders what it is handed.
 *
 * The shape is the shared progress card's: a wide band with the percentage set
 * large, then the labeled facts. It is REPRODUCED from design tokens rather
 * than imported.
 *
 * The state word sits in the HEAD, beside the controls, not inside the band.
 * It is a fact about the printer rather than about the progress, so it belongs
 * with the printer's name and the buttons that change it.
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

type PendingAction = "pause" | "resume" | "stop"

type Confirmation = {
  printerId: string
  action: PendingAction
}

const CONFIRM_QUESTIONS: Record<PendingAction, string> = {
  pause: "Pause this print?",
  resume: "Resume this print?",
  stop: "Stop this print?",
}

const CONFIRM_VERBS: Record<PendingAction, string> = {
  pause: "Pause",
  resume: "Resume",
  stop: "Stop",
}

const PENDING_LABELS: Record<PendingAction, string> = {
  pause: "Pausing…",
  resume: "Resuming…",
  stop: "Stopping…",
}

const PRINTER_LIST_ROW_HEIGHT = 64
const PRINTER_LIST_ROW_GAP = 6
const PRINTER_STATUS_VERTICAL_PADDING = 36

const countPrinterRowsThatFit = (viewportHeight: number) =>
  Math.max(
    0,
    Math.floor(
      (viewportHeight -
        PRINTER_STATUS_VERTICAL_PADDING +
        PRINTER_LIST_ROW_GAP) /
        (PRINTER_LIST_ROW_HEIGHT + PRINTER_LIST_ROW_GAP),
    ),
  )

const STATE_LABELS: Record<PrinterJob["state"], string> = {
  preparing: "Preparing",
  printing: "Printing",
  paused: "Paused",
}

/** Left-to-right ordering is HA's; the badge only counts the columns. */
const PrinterCard = ({
  index,
  isExpanded,
  job,
  onToggleExpanded,
  pendingAction,
  onRequest,
}: {
  index: number
  isExpanded: boolean
  job: PrinterJob
  onToggleExpanded: () => void
  pendingAction: PendingAction | null
  onRequest: (action: PendingAction) => void
}) => {
  const clock = clockConfig.value
  const isPaused = job.state === "paused"
  const hasProblem = job.problemText !== undefined
  const controlAction: PendingAction = isPaused
    ? "resume"
    : "pause"
  const controlLabel =
    pendingAction === "pause" || pendingAction === "resume"
      ? PENDING_LABELS[pendingAction]
      : isPaused
        ? "Resume"
        : "Pause"
  const finishAtMs = getFinishAtMs({
    job,
    nowMillis: nowMs.value,
  })
  const jobTitle = getPrinterJobTitle(job)
  const remainingText =
    isPaused || job.remainingMinutes === undefined
      ? null
      : formatRemaining(job.remainingMinutes)

  return (
    <article
      class="printer-card"
      data-intent={
        hasProblem
          ? "danger"
          : isPaused
            ? "warning"
            : "neutral"
      }
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
          {/* The state reads left of the buttons, so the word and the control
              that changes it are one group. The dot carries the same fact for
              a glance from a step back, and is hidden from the accessibility
              tree because the word beside it already says it. */}
          {/* The chip and the buttons are ONE group, so they wrap
              TOGETHER. At three columns the card is about 380 px wide and
              the head cannot hold a name, a chip and two buttons on one
              line: the group drops to its own line and the name gets the
              width back. Wrapping them separately would strand the chip
              beside a name squeezed to nothing. */}
          <div class="printer-head-controls">
            <div class="printer-state">
              <span
                class="printer-state-dot"
                aria-hidden="true"
              />
              {STATE_LABELS[job.state]}
            </div>
            <div class="printer-actions">
              <button
                type="button"
                class="printer-action is-pause"
                aria-label={controlLabel}
                disabled={pendingAction !== null}
                onClick={() => onRequest(controlAction)}
              >
                <svg
                  class="printer-action-icon"
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                >
                  {controlAction === "pause" ? (
                    <path
                      d="M6 4v12M14 4v12"
                      fill="none"
                      stroke="currentColor"
                      stroke-linecap="round"
                      stroke-width="2.5"
                    />
                  ) : (
                    <path
                      d="M6 4.5v11l9-5.5z"
                      fill="currentColor"
                    />
                  )}
                </svg>
                <span class="printer-action-label">
                  {controlLabel}
                </span>
              </button>
              <button
                type="button"
                class="printer-action is-stop"
                aria-label={
                  pendingAction === "stop"
                    ? PENDING_LABELS.stop
                    : "Stop"
                }
                disabled={pendingAction !== null}
                onClick={() => onRequest("stop")}
              >
                <svg
                  class="printer-action-icon"
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                >
                  <rect
                    x="5"
                    y="5"
                    width="10"
                    height="10"
                    rx="1.5"
                    fill="currentColor"
                  />
                </svg>
                <span class="printer-action-label">
                  {pendingAction === "stop"
                    ? PENDING_LABELS.stop
                    : "Stop"}
                </span>
              </button>
            </div>
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
            style={{ width: `${job.percent}%` }}
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
            <span class="printer-percent">
              {job.percent}%
            </span>
          </div>
        </div>
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
                  <span>Chosen when the print starts</span>
                </>
              )}
            </dd>
          </div>
        </dl>
      </div>
    </article>
  )
}

export const PrinterStatus = () => {
  const jobs = printers.value?.printers ?? []
  const [viewportHeight, setViewportHeight] = useState(
    () => window.innerHeight,
  )
  const [confirmation, setConfirmation] =
    useState<Confirmation | null>(null)
  const [expandedIds, setExpandedIds] = useState<
    readonly string[]
  >([])
  const [pending, setPending] = useState<
    Record<string, PendingAction>
  >({})

  useEffect(() => {
    const updateViewportHeight = () => {
      setViewportHeight(window.innerHeight)
    }
    window.addEventListener("resize", updateViewportHeight)
    return () => {
      window.removeEventListener(
        "resize",
        updateViewportHeight,
      )
    }
  }, [])

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
   * arrives as `paused`, a stop arrives as the printer leaving the payload
   * entirely — so a card that is gone, or has reached the state the tap asked
   * for, is confirmation.
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

  const confirm = () => {
    if (!confirmation) {
      return
    }
    const { action, printerId } = confirmation
    setConfirmation(null)
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
    }, PENDING_TIMEOUT_MS)
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
  const layout =
    jobs.length === 4
      ? "quad"
      : jobs.length >= 5
        ? "list"
        : "columns"
  const visibleJobs =
    layout === "list"
      ? jobs.slice(
          0,
          countPrinterRowsThatFit(viewportHeight),
        )
      : jobs

  return (
    <div
      class="printer-status"
      data-count={String(jobs.length)}
      data-layout={
        layout === "columns" ? undefined : layout
      }
    >
      <div class="printer-cards">
        {visibleJobs.map((job, index) => (
          <PrinterCard
            key={job.id}
            index={index}
            isExpanded={expandedIds.includes(job.id)}
            job={job}
            pendingAction={pending[job.id] ?? null}
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
