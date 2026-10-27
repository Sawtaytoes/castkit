import type { ContractData } from "@castkit/sdk/contracts"
import { buildMusicPlayer } from "../../__fixtures__/buildMusicPlayer.ts"
import type { DisplaySnapshot } from "../protocol.ts"
import { prioritySnapshot } from "./priorityComposition.ts"

/** Fictional desk overview with independently active work and points. */
export const pointsOverviewFixture = ({
  isBusy = false,
  isRunning = false,
  isRipOnly = false,
  hasMusic = false,
}: {
  isBusy?: boolean
  isRunning?: boolean
  isRipOnly?: boolean
  hasMusic?: boolean
} = {}): DisplaySnapshot => ({
  ...prioritySnapshot,
  view: {
    ...prioritySnapshot.view,
    layout: "adaptive",
    isActiveOnly: true,
    panels: [
      ...prioritySnapshot.view.panels,
      ...(hasMusic ? [{ id: "music", specId: "music-player", bindings: { data: "music" }, settings: { presentation: "compact", priority: 0 } }] : []),
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
    music: { id: "music", type: "music-player.v1", status: "ready", data: buildMusicPlayer({ nowMs: Date.now() }) },
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
            tasksToday: [
              { id: "reading", name: "Reading", atMs: Date.now() - 50 * 60_000, points: 80, minutes: 30 },
              { id: "dishes", name: "Dishes", atMs: Date.now() - 25 * 60_000, points: 30 },
              { id: "bed", name: "Make bed", atMs: Date.now() - 15 * 60_000, points: 20 },
            ],
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
