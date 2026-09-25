import type { DisplaySnapshot } from "./protocol.ts"

/** Synthetic channels exercise composition without embedding a household configuration. */
export const compositionFixture: DisplaySnapshot = {
  target: { kind: "view", id: "activity" },
  canControl: true,
  view: {
    id: "activity",
    name: "Activity",
    layout: "split",
    theme: "dark",
    access: "public",
    isControlEnabled: true,
    panels: [
      {
        id: "printers",
        specId: "printer-status",
        bindings: { data: "prints" },
        settings: {},
      },
      {
        id: "discs",
        specId: "rip-deck",
        bindings: { data: "rips" },
        settings: {},
      },
    ],
  },
  channels: {
    prints: {
      id: "prints",
      type: "printers.v1",
      status: "ready",
      updatedAt: "2026-01-01T12:00:00Z",
      data: {
        printers: [
          {
            id: "printer-one",
            name: "Printer One",
            jobName: "Desk stand",
            percent: 43,
            state: "printing",
            remainingMinutes: 58,
            currentLayer: 86,
            totalLayers: 200,
            thumbnailPath:
              "/sample-photos/landscape-gradient.jpg",
            cameraPath: "/api/example/camera",
            filamentText: "Blue PLA",
          },
        ],
      },
    },
    rips: {
      id: "rips",
      type: "rip-deck.v1",
      status: "ready",
      data: {
        bays: [
          {
            id: "bay-one",
            name: "1",
            title: "Sample movie",
            state: "ripping",
            percent: 62,
            remainingSeconds: 600,
            actions: ["cancel"],
            hasDisc: true,
            isPresent: true,
            isQuarantined: false,
          },
        ],
        alerts: [],
        isPresent: true,
        activeCount: 1,
        loadedDiscCount: 1,
      },
    },
  },
}
