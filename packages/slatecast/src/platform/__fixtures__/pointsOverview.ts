import type { ContractData } from "@castkit/sdk/contracts"
import type { DisplaySnapshot } from "../protocol.ts"
import { prioritySnapshot } from "./priorityComposition.ts"

/** Fictional desk overview with independently active work and points. */
export const pointsOverviewFixture = ({
  isBusy = false,
  isRunning = false,
  isRipOnly = false,
}: {
  isBusy?: boolean
  isRunning?: boolean
  isRipOnly?: boolean
} = {}): DisplaySnapshot => ({
  ...prioritySnapshot,
  view: {
    ...prioritySnapshot.view,
    layout: "adaptive",
    isActiveOnly: true,
    panels: [
      ...prioritySnapshot.view.panels,
      {
        id: "rips",
        specId: "rip-deck",
        bindings: { data: "rips" },
        settings: { presentation: "posters" },
      },
      {
        id: "points",
        specId: "kids-points",
        bindings: { data: "points" },
        settings: { isPersistentSummary: true },
      },
    ],
  },
  panelActivity: {
    printers: isBusy && !isRipOnly,
    rips: isBusy && isRipOnly,
    points: isRunning,
  },
  channels: {
    ...prioritySnapshot.channels,
    points: {
      id: "points",
      type: "kids-points.v1",
      status: "ready",
      data: {
        kids: [
          {
            id: "robin",
            name: "Robin",
            pointsToday: 130,
            goal: 400,
            color: "#269b53",
            ...(isRunning ? {
              activeTask: {
                name: "Piano",
                reader: "Practice Reader",
                startedAtMs: Date.now() - 11 * 60_000,
                bankedMinutes: 30,
                isCountdown: false,
              },
            } : {}),
          },
          { id: "sky", name: "Sky", pointsToday: 85, goal: 400, color: "#3f7fe0" },
          { id: "quinn", name: "Quinn", pointsToday: 100, goal: 400, color: "#d9503f" },
        ],
      } satisfies ContractData["kids-points.v1"],
    },
  },
})
