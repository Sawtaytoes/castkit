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

/** The countdown belonging to this channel's accepted scan, until its target. */
export const getCountdownKid = ({
  data,
  now,
}: {
  data: ContractData["kids-points.v1"]
  now: number
}) => {
  const scan = data.lastScan
  if (
    !scan ||
    (scan.result !== "started" &&
      scan.result !== "progress")
  ) {
    return undefined
  }
  return data.kids.find((kid) => {
    const task = kid.activeTask
    return (
      kid.id === scan.kidId &&
      task?.isCountdown === true &&
      task.goalMinutes !== undefined &&
      task.name === scan.taskName &&
      scan.atMs >=
        task.startedAtMs - CLOCK_SKEW_MILLISECONDS &&
      now >= task.startedAtMs - CLOCK_SKEW_MILLISECONDS &&
      now < task.startedAtMs + task.goalMinutes * 60_000
    )
  })
}
