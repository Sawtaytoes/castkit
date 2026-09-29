import type { ContractData } from "@castkit/sdk/contracts"

type KidsPointsData = ContractData["kids-points.v1"]
type KidEntry = KidsPointsData["kids"][number]
type KidScan = NonNullable<KidsPointsData["lastScan"]>

/*
 * A board card is legible from across a room at about this size: the name,
 * a two- or three-digit total and its bar. Below it a card's type shrinks
 * past reading distance, so the panel gets rows instead.
 */
export const KID_CARD_MIN_WIDTH = 220
export const KID_CARD_MIN_HEIGHT = 200
export const KID_ROW_HEIGHT = 64
export const KIDS_POINTS_GAP = 12
/*
 * Reserved whether or not it is needed, for the same reason the AI Usage
 * view reserves it: a budget that spends its last pixels on a row has nowhere
 * left to say what it dropped.
 */
export const OVERFLOW_LINE_HEIGHT = 28
/** Matches the fifteen-second screen override that shows a scan in a room. */
export const DEFAULT_SCAN_SECONDS = 15
/*
 * A panel's clock and the points service's clock are different machines. A
 * scan stamped a few seconds in this panel's future is still this scan.
 */
const CLOCK_SKEW_MILLISECONDS = 5_000

/** The panel's scan window in seconds; stored settings may be text or nothing. */
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

/**
 * Whether the last scan still owns the panel.
 *
 * ⚠️ The freshness rule decides first. A scan shown for fifteen seconds is a
 * value with a fifteen-second life, and a panel that takes 28 seconds to
 * repaint would draw it after it had already ended. Such a panel never shows
 * the scan; it shows the totals the scan changed, which live far longer.
 */
export const getIsScanShowing = ({
  lastScan,
  now,
  scanSeconds,
  isValueFresh,
}: {
  lastScan: KidScan | undefined
  now: number
  scanSeconds: number
  isValueFresh: (
    valueLifetimeMilliseconds: number,
  ) => boolean
}) => {
  if (!lastScan || !isValueFresh(scanSeconds * 1000)) {
    return false
  }
  const age = now - lastScan.atMs
  return (
    age >= -CLOCK_SKEW_MILLISECONDS &&
    age < scanSeconds * 1000
  )
}

/**
 * Board or rows, decided from the view's own box.
 *
 * A board is every child side by side, each on a card of at least the
 * legible size; a larger panel is one that can hold that. Anything smaller
 * gets one row per child and draws only the rows that finish on the glass.
 */
export const getKidsPointsLayout = ({
  width,
  height,
  kidCount,
}: {
  width: number
  height: number
  kidCount: number
}) => {
  const isBoard =
    kidCount > 0 &&
    width >=
      kidCount * KID_CARD_MIN_WIDTH +
        (kidCount - 1) * KIDS_POINTS_GAP &&
    height >= KID_CARD_MIN_HEIGHT
  const rowsThatFit = (available: number) =>
    Math.max(
      0,
      Math.floor(
        (available + KIDS_POINTS_GAP) /
          (KID_ROW_HEIGHT + KIDS_POINTS_GAP),
      ),
    )
  const rowCount =
    rowsThatFit(height) >= kidCount
      ? kidCount
      : rowsThatFit(height - OVERFLOW_LINE_HEIGHT)
  return { isBoard, rowCount }
}

/** How far toward today's goal, in percent; no goal means no bar. */
export const getGoalPercent = (kid: KidEntry) =>
  kid.goal === undefined
    ? undefined
    : Math.max(
        0,
        Math.min(100, (kid.pointsToday / kid.goal) * 100),
      )

/** A signed amount, the way a points sheet writes it. */
export const formatPointsDelta = (points: number) =>
  points > 0
    ? `+${points.toLocaleString("en-US")}`
    : points.toLocaleString("en-US")

/**
 * The big line and the small line for a scan.
 *
 * A refusal leads with the producer's own sentence, because "Not counted"
 * alone does not tell a child whether to try later or not at all.
 */
export const getScanText = (scan: KidScan) => {
  switch (scan.result) {
    case "awarded":
      return {
        headline: formatPointsDelta(scan.points),
        detail: scan.taskName ?? "",
      }
    case "started":
      return {
        headline: "Timer started",
        detail: scan.taskName ?? "",
      }
    case "stopped":
      return {
        headline:
          scan.points === 0
            ? "Timer stopped"
            : formatPointsDelta(scan.points),
        detail: scan.taskName ?? "",
      }
    default:
      return {
        headline: "Not counted",
        detail: scan.message ?? scan.taskName ?? "",
      }
  }
}

/** A clock time for a fact that stays true until the next scan. */
export const formatClockTime = (milliseconds: number) =>
  new Date(milliseconds).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })
