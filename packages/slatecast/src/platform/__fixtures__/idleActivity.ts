import type { ContractData } from "@castkit/sdk/contracts"
import { aiUsageFixture, compositionFixture, kidsPointsFixture } from "../fixtures.ts"
import type { DisplaySnapshot } from "../protocol.ts"

/** The same active-only five-panel structure as an idle combined activity view. */
export const idleActivityFixture = (): DisplaySnapshot => {
  const points = kidsPointsFixture({ hasScan: false })
  const data = points.channels.points?.data as ContractData["kids-points.v1"]
  return {
    target: { kind: "view", id: "idle-activity" },
    canControl: false,
    view: {
      ...compositionFixture.view,
      id: "idle-activity",
      name: "Activity",
      layout: "adaptive",
      isActiveOnly: true,
      panels: [
        ...compositionFixture.view.panels,
        { id: "usage", specId: "ai-usage", bindings: { data: "usage" }, settings: { priority: 1 } },
        { id: "points", specId: "kids-points", bindings: { data: "points" }, settings: { scanSeconds: 15, isPersistentSummary: true, priority: 1 } },
        { id: "music", specId: "music-player", bindings: {}, settings: { presentation: "compact", priority: 0 } },
      ],
    },
    panelActivity: { printers: false, discs: false, usage: true, points: false, music: false },
    channels: {
      ...aiUsageFixture.channels,
      ...points.channels,
      usage: {
        id: "usage", type: "ai-usage.v1", status: "ready",
        data: { providers: ["Alpha", "Beta", "Gamma", "Delta", "Epsilon"].map((name, index) => ({ id: name, name, isOk: true, windows: [{ id: "weekly", label: "Weekly", percentUsed: index * 20, periodHours: 168 }] })) },
      },
      points: {
        ...points.channels.points!,
        data: { kids: data.kids.slice(0, 3).map((kid) => ({ ...kid, pointsToday: 100, goal: 400, lastTask: "Instrument practice", activeTask: undefined })) },
      },
    },
  }
}
