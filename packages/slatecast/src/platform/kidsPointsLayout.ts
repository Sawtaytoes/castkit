import type { ContractData } from "@castkit/sdk/contracts"
import { getIsScanRecent } from "@castkit/sdk/kidsPointsScan"
import { selectPriorityLayout } from "@charcuterie/logic/core"

export {
  DEFAULT_SCAN_SECONDS,
  readScanSeconds,
} from "@castkit/sdk/kidsPointsScan"

import { compactClockTime } from "@castkit/shared/compactClockTime"
import {
  getTemporaryViewSeconds,
  type RepaintGrade,
} from "@castkit/shared/panels/repaint"

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
/**
 * Whether the last scan still owns the panel.
 *
 * ⚠️ The freshness rule decides first, through the same rule as a temporary
 * view on a display: a slow panel shows the scan for ten repaints, thirty
 * seconds, so it matches the time that display is given to the view. A
 * super-slow panel never shows the scan; it would draw it after it had
 * already ended, so it shows the totals the scan changed, which live far
 * longer.
 */
export const getIsScanShowing = ({
  lastScan,
  now,
  scanSeconds,
  repaint,
}: {
  lastScan: KidScan | undefined
  now: number
  scanSeconds: number
  repaint: RepaintGrade
}) => {
  const windowSeconds = getTemporaryViewSeconds({
    repaint,
    requestedSeconds: scanSeconds,
  })
  if (!lastScan || windowSeconds === undefined) {
    return false
  }
  return getIsScanRecent({
    lastScan,
    now,
    scanSeconds: windowSeconds,
  })
}

/**
 * How an instant panel celebrates a scan that earned points.
 *
 * `count` merges the points into the old total. `goal` is the scan that
 * reaches today's goal, and `bonus` is any scan after it. A scan that earned
 * nothing does not move the total, so it has no motion.
 */
export type ScanMotion = "none" | "count" | "goal" | "bonus"

export const getScanMotion = ({
  kid,
  scan,
}: {
  kid: KidEntry
  scan: KidScan
}): ScanMotion => {
  if (scan.points <= 0) {
    return "none"
  }
  if (kid.goal === undefined) {
    return "count"
  }
  const before = kid.pointsToday - scan.points
  if (before >= kid.goal) {
    return "bonus"
  }
  return kid.pointsToday >= kid.goal ? "goal" : "count"
}

/** A scan's identity, so a second scan restarts its motion. */
export const getScanKey = (scan: KidScan) =>
  `${scan.kidId}:${scan.atMs}`

const CONFETTI_COLORS = [
  "#f5c518",
  "#ff5d8f",
  "#3fa7ff",
  "#4cd964",
  "#ff9500",
  "#af52de",
] as const
const GOLDEN_ANGLE_DEGREES = 137.508

/**
 * Where each piece of confetti flies, in the view's `cqmin`.
 *
 * Fixed, not random: the golden angle spreads any count of pieces evenly
 * round the burst, and a fixed pattern keeps screenshots and tests stable.
 * Each piece bursts outward, mostly upward, then falls.
 */
export const getConfettiPieces = (count: number) =>
  Array.from({ length: count }, (_, index) => {
    const radians =
      ((index * GOLDEN_ANGLE_DEGREES) % 360) *
      (Math.PI / 180)
    const distance = 22 + ((index * 37) % 28)
    return {
      x: Math.round(Math.cos(radians) * distance * 10) / 10,
      y:
        Math.round(
          (Math.sin(radians) * distance * 0.8 - 12) * 10,
        ) / 10,
      fall: 30 + ((index * 53) % 30),
      spin:
        (index % 2 === 0 ? 1 : -1) *
        (360 + ((index * 47) % 360)),
      delayMilliseconds: (index % 6) * 40,
      color:
        CONFETTI_COLORS[index % CONFETTI_COLORS.length] ??
        CONFETTI_COLORS[0],
      isRound: index % 3 === 0,
    }
  })

/** A ring of stars round the total, evenly spaced, in `cqmin`. */
export const getStarBurst = (count: number) =>
  Array.from({ length: count }, (_, index) => {
    const radians =
      ((index * 360) / count) * (Math.PI / 180)
    const distance = index % 2 === 0 ? 30 : 22
    return {
      x: Math.round(Math.cos(radians) * distance * 10) / 10,
      y: Math.round(Math.sin(radians) * distance * 10) / 10,
      delayMilliseconds: (index % 2) * 180,
    }
  })

const dataSections = ({
  kidCount,
  cardWidth,
  cardHeight,
}: {
  kidCount: number
  cardWidth: number
  cardHeight: number
}) =>
  Array.from({ length: kidCount }, () => ({
    priority: 1,
    width: cardWidth,
    height: cardHeight,
    minimumWidth: KID_CARD_MIN_WIDTH,
    minimumHeight: KID_CARD_MIN_HEIGHT,
    // Score the area that can enlarge both text axes, rather than empty space.
    aspectRatio: KID_CARD_MIN_WIDTH / KID_CARD_MIN_HEIGHT,
  }))

/**
 * Board or rows, decided from the view's own box.
 *
 * The shared priority policy chooses columns or stacked cards from each
 * candidate's readable area. Every card must meet its minimum size. Anything smaller
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
  const candidates = Array.from(
    { length: kidCount },
    (_, index) => {
      const columnCount = kidCount - index
      const rowCount = Math.ceil(kidCount / columnCount)
      const cardWidth =
        (width - (columnCount - 1) * KIDS_POINTS_GAP) /
        columnCount
      const cardHeight =
        (height - (rowCount - 1) * KIDS_POINTS_GAP) /
        rowCount
      return {
        id: String(columnCount),
        columnCount,
        isBoard:
          cardWidth >= KID_CARD_MIN_WIDTH &&
          cardHeight >= KID_CARD_MIN_HEIGHT,
        sections: dataSections({
          kidCount,
          cardWidth,
          cardHeight,
        }),
      }
    },
  )
  const chosen = selectPriorityLayout(candidates)
  const isBoard = chosen?.isBoard ?? false
  const columnCount = chosen?.columnCount ?? 1
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
  return { isBoard, rowCount, columnCount }
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
    case "progress":
      return {
        headline: scan.taskName ?? "Timer running",
        detail: scan.message ?? "",
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
  compactClockTime(
    new Date(milliseconds).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }),
  )
