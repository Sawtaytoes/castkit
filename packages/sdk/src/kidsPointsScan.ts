import type { ContractData } from "./contracts.ts"

type KidScan = NonNullable<
  ContractData["kids-points.v1"]["lastScan"]
>

export const DEFAULT_SCAN_SECONDS = 15
const CLOCK_SKEW_MILLISECONDS = 5_000

/** The same feedback duration is used by rendering and active-only compositions. */
export const readScanSeconds = (
  settings: Record<string, unknown> | undefined,
) => {
  const value = Number(settings?.scanSeconds)
  return Number.isFinite(value) &&
    value > 0 &&
    value <= 3600
    ? value
    : DEFAULT_SCAN_SECONDS
}

/** A small clock skew must not hide a scan stamped just ahead of the display. */
export const getScanWindow = ({
  lastScan,
  scanSeconds,
}: {
  lastScan: KidScan | undefined
  scanSeconds: number
}) =>
  lastScan
    ? {
        startsAtMs: lastScan.atMs - CLOCK_SKEW_MILLISECONDS,
        expiresAtMs: lastScan.atMs + scanSeconds * 1000,
      }
    : undefined

export const getIsScanRecent = ({
  lastScan,
  scanSeconds,
  now,
}: {
  lastScan: KidScan | undefined
  scanSeconds: number
  now: number
}) => {
  const window = getScanWindow({ lastScan, scanSeconds })
  return (
    window !== undefined &&
    now >= window.startsAtMs &&
    now < window.expiresAtMs
  )
}

/** Running countdowns reached by this channel's accepted scans, until their targets. */
export const getCountdownKids = ({
  data,
  now,
}: {
  data: ContractData["kids-points.v1"]
  now: number
}) => {
  const scans =
    data.timerScans ??
    (data.lastScan ? [data.lastScan] : [])
  return data.kids.filter((kid) => {
    const task = kid.activeTask
    return (
      task?.isCountdown === true &&
      task.goalMinutes !== undefined &&
      now >= task.startedAtMs - CLOCK_SKEW_MILLISECONDS &&
      now < task.startedAtMs + task.goalMinutes * 60_000 &&
      scans.some(
        (scan) =>
          kid.id === scan.kidId &&
          (scan.result === "started" ||
            scan.result === "progress") &&
          task.name === scan.taskName &&
          scan.atMs >=
            task.startedAtMs - CLOCK_SKEW_MILLISECONDS,
      )
    )
  })
}

/** Keep the channel active while any accepted countdown remains. */
export const getCountdownKid = (input: {
  data: ContractData["kids-points.v1"]
  now: number
}) => {
  const kids = getCountdownKids(input)
  return (
    kids.find(
      (kid) => kid.id === input.data.lastScan?.kidId,
    ) ?? kids[0]
  )
}
