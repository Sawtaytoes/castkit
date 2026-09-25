import type { ContractData } from "@castkit/sdk/contracts"

type AiUsageData = ContractData["ai-usage.v1"]
type UsageProvider = AiUsageData["providers"][number]
type UsageWindow = UsageProvider["windows"][number]

/**
 * The share of a window that has to be gone before a second limit is worth
 * the glass.
 *
 * A dashboard that lists every window of every provider is a table, and a
 * panel across the room is not read like a table. The headline answers "how
 * much of my week is left"; a second limit only earns a row once it is close
 * enough to spent to change what the reader does next.
 */
export const DEFAULT_ALERT_PERCENT = 80

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

/**
 * The rows each provider is worth drawing, before the panel's height is known.
 *
 * One headline row always, plus any other window already at or past
 * `alertPercent`. The escalated rows are marked so the view can draw them as
 * the exception they are, and they keep producer order behind the headline.
 *
 * This runs BEFORE the row budget, and the two must not be confused. A window
 * this function drops was judged not worth showing and is never reported as
 * missing; a row the budget drops did not fit on the glass and is counted, so
 * the reader knows the panel ran out of room rather than out of limits.
 */
export const selectProviderRows = ({
  providers,
  alertPercent = DEFAULT_ALERT_PERCENT,
}: {
  providers: readonly UsageProvider[]
  alertPercent?: number
}) =>
  providers.map((provider) => {
    const primaryWindow = selectPrimaryWindow(
      provider.windows,
    )
    const escalated = provider.windows.filter(
      (usageWindow) =>
        usageWindow !== primaryWindow &&
        usageWindow.percentUsed !== undefined &&
        usageWindow.percentUsed >= alertPercent,
    )
    return {
      provider,
      rows: (primaryWindow
        ? [
            {
              usageWindow: primaryWindow,
              isEscalated: false,
            },
          ]
        : []
      ).concat(
        escalated.map((usageWindow) => ({
          usageWindow,
          isEscalated: true,
        })),
      ),
    }
  })
