import { selectPrimaryWindow as selectQuotaWindow } from "@castkit/sdk/aiUsageWindow"
import type { ContractData } from "@castkit/sdk/contracts"

type AiUsageData = ContractData["ai-usage.v1"]
type UsageProvider = AiUsageData["providers"][number]

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

/** Select the same primary window used by per-view server activity. */
export const selectPrimaryWindow = selectQuotaWindow

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
