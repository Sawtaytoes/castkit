import type { ContractData } from "./contracts.ts"

/** A bay can be busy even when the source does not permit a cancel action. */
export const isRipBayActive = (
  bay: ContractData["rip-deck.v1"]["bays"][number],
) =>
  bay.jobId !== undefined ||
  [
    "ripping",
    "starting",
    "settling",
    "queued",
    "identifying",
    "verifying",
    "throttled",
    "finalising",
    "stalled",
    "slow",
    "reading",
    "scanning",
  ].includes(bay.state) ||
  bay.actions.includes("cancel")
