import type { ContractData } from "@castkit/sdk/contracts"
import { formatClockTime } from "../time.ts"
import { formatEndedTime } from "./printerJob.ts"

export type Cutter =
  ContractData["cutters.v1"]["cutters"][number]
export type CutterJob = NonNullable<Cutter["currentJob"]>

/**
 * How long a settled job stays the card's headline after it ends. A cutter
 * job is a few minutes long, so a person who walks over after it stops still
 * reads what happened; after that the card goes back to "Ready".
 */
export const SETTLED_HEADLINE_MILLIS = 10 * 60_000

const ACTIVE_STATUSES: readonly CutterJob["status"][] = [
  "queued",
  "sent",
  "cutting",
]

/** Whether the cutter is still working through this job. */
export const getIsActiveJob = (job: CutterJob) =>
  ACTIVE_STATUSES.includes(job.status)

/** When a settled job ended, by the source's own record. */
export const getJobEndedAtMs = (job: CutterJob) =>
  job.finishedAtMs ?? job.expectedDoneAtMs

/**
 * The job the card leads with: the one being cut, or a job that ended in the
 * last few minutes. A blade-up trace never leads once it has ended — it is a
 * check, not work anyone waits on.
 */
export const getHeadlineJob = ({
  cutter,
  nowMillis,
}: {
  cutter: Cutter
  nowMillis: number
}) => {
  if (cutter.currentJob) {
    return cutter.currentJob
  }
  const latest = cutter.recentJobs[0]
  const endedAtMs = latest
    ? getJobEndedAtMs(latest)
    : undefined
  return latest &&
    endedAtMs !== undefined &&
    nowMillis - endedAtMs <= SETTLED_HEADLINE_MILLIS
    ? latest
    : undefined
}

/**
 * Seconds as a person says them about a cut: "under a minute", "about 3 min",
 * "about 1 h 05 min". Always rounded UP and always "about", because the time
 * is an estimate from travel and speed and the cutter never reports progress.
 */
export const formatAboutDuration = (seconds: number) => {
  if (seconds < 60) {
    return "under a minute"
  }
  const totalMinutes = Math.ceil(seconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours > 0
    ? `about ${hours} h ${String(minutes).padStart(2, "0")} min`
    : `about ${totalMinutes} min`
}

/** Tool-down travel in the unit a person measures vinyl in. */
export const formatCutLength = (millimeters: number) =>
  millimeters >= 1000
    ? `${(millimeters / 1000).toFixed(1)} m`
    : `${Math.round(millimeters / 10)} cm`

/** The chip beside the cutter's name. */
export const getCutterStateLabel = ({
  cutter,
  job,
}: {
  cutter: Cutter
  job: CutterJob | undefined
}) => {
  if (!cutter.isOnline) {
    return "Offline"
  }
  if (!cutter.isCutterConnected) {
    return "Not connected"
  }
  if (!job) {
    return "Ready"
  }
  if (job.isTrace && getIsActiveJob(job)) {
    return "Tracing"
  }
  return {
    queued: "Waiting",
    sent: "Sending",
    cutting: "Cutting",
    done: "Finished",
    failed: "Failed",
    canceled: "Canceled",
  }[job.status]
}

/** The card's color, by the same intent names the printer card uses. */
export const getCutterIntent = ({
  cutter,
  job,
}: {
  cutter: Cutter
  job: CutterJob | undefined
}) => {
  if (!cutter.isOnline || !cutter.isCutterConnected) {
    return "warning"
  }
  if (job?.status === "failed") {
    return "danger"
  }
  return job?.status === "done" ? "success" : "neutral"
}

/**
 * The two lines in the progress band: what is happening, and the clock time
 * it is expected to end or ended.
 *
 * The cutter sends no "finished" signal. Cuttero calls a job done when its
 * estimate runs out, so every finish here says "estimated" or "about", and
 * a job past its estimate but not yet flipped says it SHOULD be finished.
 *
 * `hasRelativeTimes` is the panel's freshness answer. A slow panel gets the
 * absolute time alone, because "about 2 min left" is wrong before it has
 * finished drawing.
 */
export const describeJobProgress = ({
  job,
  nowMillis,
  hasRelativeTimes,
  formatTime = formatClockTime,
}: {
  job: CutterJob
  nowMillis: number
  hasRelativeTimes: boolean
  formatTime?: (millis: number) => string
}) => {
  const endedAtMs = getJobEndedAtMs(job)
  if (job.status === "done") {
    return {
      primary: job.isTrace
        ? "Trace finished (estimated)"
        : "Finished (estimated)",
      secondary:
        endedAtMs === undefined
          ? undefined
          : `Ended about ${formatTime(endedAtMs)}`,
    }
  }
  if (job.status === "failed") {
    return {
      primary: "Failed",
      secondary:
        endedAtMs === undefined
          ? undefined
          : `At ${formatTime(endedAtMs)}`,
    }
  }
  if (job.status === "canceled") {
    return {
      primary: "Canceled before sending",
      secondary:
        endedAtMs === undefined
          ? undefined
          : `At ${formatTime(endedAtMs)}`,
    }
  }
  if (job.status === "queued") {
    return {
      primary: "Waiting to send",
      secondary:
        job.estimateSeconds === undefined
          ? undefined
          : `Takes ${formatAboutDuration(job.estimateSeconds)}`,
    }
  }
  if (job.status === "sent") {
    return {
      primary: job.isTrace
        ? "Tracing the outline"
        : "Sending to the cutter",
      secondary:
        job.estimateSeconds === undefined
          ? undefined
          : `Takes ${formatAboutDuration(job.estimateSeconds)}`,
    }
  }
  const expectedDoneAtMs = job.expectedDoneAtMs
  if (expectedDoneAtMs === undefined) {
    return {
      primary: job.isTrace ? "Tracing" : "Cutting",
      secondary: undefined,
    }
  }
  const remainingSeconds =
    (expectedDoneAtMs - nowMillis) / 1000
  if (remainingSeconds <= 0) {
    return {
      primary: "Should be finished (estimated)",
      secondary: `Expected about ${formatTime(expectedDoneAtMs)}`,
    }
  }
  return {
    primary: hasRelativeTimes
      ? `${job.isTrace ? "Tracing" : "Cutting"} — ${formatAboutDuration(remainingSeconds)} left`
      : job.isTrace
        ? "Tracing"
        : "Cutting",
    secondary: `Done about ${formatTime(expectedDoneAtMs)}`,
  }
}

/**
 * The share of the estimate that has passed, 0–100, for the band's fill.
 * Undefined when there is no estimate to measure against.
 */
export const getEstimatedPercent = ({
  job,
  nowMillis,
}: {
  job: CutterJob
  nowMillis: number
}) => {
  if (job.status === "done") {
    return 100
  }
  if (
    job.status !== "cutting" ||
    job.expectedDoneAtMs === undefined ||
    !job.estimateSeconds
  ) {
    return undefined
  }
  const startedAtMs =
    job.expectedDoneAtMs - job.estimateSeconds * 1000
  return Math.min(
    100,
    Math.max(
      0,
      ((nowMillis - startedAtMs) /
        (job.estimateSeconds * 1000)) *
        100,
    ),
  )
}

/** One line under a recent job's name. */
export const describeRecentJob = ({
  job,
  nowMillis,
  formatTime = (endedAtMs: number) =>
    formatEndedTime({ endedAtMs, nowMillis }),
}: {
  job: CutterJob
  nowMillis: number
  formatTime?: (millis: number) => string
}) => {
  const endedAtMs = getJobEndedAtMs(job)
  const word =
    job.status === "done"
      ? "Finished (estimated)"
      : job.status === "failed"
        ? "Failed"
        : job.status === "canceled"
          ? "Canceled"
          : "In progress"
  return [
    word,
    endedAtMs === undefined
      ? undefined
      : formatTime(endedAtMs),
    job.cutLengthMm
      ? formatCutLength(job.cutLengthMm)
      : undefined,
  ]
    .filter(Boolean)
    .join(" · ")
}
