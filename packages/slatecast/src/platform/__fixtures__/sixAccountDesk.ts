import { buildSixAccountUsage } from "../fixtures.ts"
import type { DisplaySnapshot } from "../protocol.ts"
import { idleActivityFixture } from "./idleActivity.ts"
import { prioritySnapshot } from "./priorityComposition.ts"

/**
 * The adaptive activity composition carrying all six AI subscriptions, idle
 * or while a printer runs. Idle, only usage and the persistent points
 * summary are drawn; printing adds the printer beside them.
 */
export const sixAccountDeskSnapshot = ({
  nowMs,
  isPrinting,
}: {
  nowMs: number
  isPrinting: boolean
}): DisplaySnapshot => {
  const idle = idleActivityFixture()
  return {
    ...idle,
    panelActivity: {
      ...idle.panelActivity,
      printers: isPrinting,
    },
    channels: {
      ...idle.channels,
      prints: prioritySnapshot.channels.prints,
      usage: {
        id: "usage",
        type: "ai-usage.v1",
        status: "ready",
        data: buildSixAccountUsage({ nowMs }),
      },
    },
  }
}
