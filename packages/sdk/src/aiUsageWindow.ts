import type { ContractData } from "./contracts.ts"

type UsageWindow =
  ContractData["ai-usage.v1"]["providers"][number]["windows"][number]

const WEEK_HOURS = 168

/**
 * The window that speaks for a provider.
 *
 * The longest window that is not longer than a week, because that is the
 * budget a person actually plans against. A provider whose windows are all
 * longer than a week gives up its shortest one instead, which is the nearest
 * thing it has to a weekly figure.
 *
 * ⚠️ Ties keep producer order on purpose. Claude publishes an all-models
 * weekly limit and a model-scoped weekly limit, both 168 hours, and the
 * all-models one comes first because it is the limit that stops the work.
 *
 * A provider whose windows carry no period at all falls back to its first
 * window rather than to nothing — an unclassified window is still a real
 * limit, and a blank provider row teaches the reader nothing.
 */
export const selectPrimaryWindow = (
  windows: readonly UsageWindow[],
) => {
  const classified = windows.filter(
    (usageWindow) => usageWindow.periodHours !== undefined,
  )
  if (classified.length === 0) {
    return windows.at(0)
  }
  const withinWeek = classified.filter(
    (usageWindow) =>
      (usageWindow.periodHours ?? 0) <= WEEK_HOURS,
  )
  const hasWeeklyCandidate = withinWeek.length > 0
  return (
    hasWeeklyCandidate ? withinWeek : classified
  ).reduce((best, candidate) => {
    const candidateHours = candidate.periodHours ?? 0
    const bestHours = best.periodHours ?? 0
    if (hasWeeklyCandidate) {
      return candidateHours > bestHours ? candidate : best
    }
    return candidateHours < bestHours ? candidate : best
  })
}
