import type { APIRequestContext } from "@playwright/test"

/** A saved adaptive composition with the same filtering and panel roles as the reported display. */
export const seedUsageReadability = async (request: APIRequestContext) => {
  const login = await request.post("/api/access/login", { data: { pin: "2468" } })
  if (!login.ok()) throw new Error("Fixture management login failed")
  const channel = await request.post("/api/manage/platform/channels", { data: {
    id: "rips/readability", name: "Readability discs", sourceId: "events", type: "rip-deck.v1", settings: {},
  } })
  if (!channel.ok()) throw new Error("Fixture disc channel failed")
  const view = await request.post("/api/manage/platform/views", { data: {
    id: "usage-readable", name: "Readable subscription details", layout: "adaptive", theme: "dark",
    access: "public", isControlEnabled: true, isActiveOnly: true,
    panels: [
      { id: "printers", specId: "printer-status", bindings: { data: "printers/lab" },
        settings: { title: "", isCameraVisible: true, isCompactControls: true, isCompactFacts: true, priority: 3, isFilamentVisible: false } },
      { id: "rips", specId: "rip-deck", bindings: { data: "rips/readability" }, settings: { title: "Disc jobs", presentation: "posters", priority: 2 } },
      { id: "ai", specId: "ai-usage", bindings: { data: "usage/fixture" }, settings: {
        title: "", priority: 1, isProviderSelectionEnabled: true, providerIds: ["claude", "codex", "codex_2"],
        isWindowSelectionEnabled: true, windowIds: ["claude:weekly", "claude:session", "codex:weekly", "codex_2:monthly"],
        isPositiveUsageOnly: true, isAlertReplacementEnabled: true, alertPercent: 80,
      } },
      { id: "points", specId: "kids-points", bindings: { data: "points/fixture" }, settings: { scanSeconds: 15, isPersistentSummary: true } },
    ],
  } })
  if (!view.ok()) throw new Error("Fixture composition failed")
  const publish = (channelId: string, payload: unknown) => request.post("/__test__/mqtt", {
    data: { topic: `castkit/channels/${channelId}/set`, payload },
  })
  await publish("rips/readability", { bays: [], alerts: [], isPresent: false, activeCount: 0, loadedDiscCount: 0 })
  await publish("printers/lab", { printers: [{ id: "printer-one", name: "Printer One", jobName: "Desk stand", percent: 27, state: "printing", currentLayer: 7, totalLayers: 512, remainingMinutes: 163, cameraPath: "/__test__/readability-camera", cameraIsLive: false }] })
  await publish("points/fixture", { kids: ["Robin", "Alex", "Sam"].map((name) => ({ id: name.toLowerCase(), name, pointsToday: 0, goal: 500, color: "#9680df" })) })
}
