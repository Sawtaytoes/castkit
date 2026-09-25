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

/**
 * Four subscriptions with a spread of consumption, so the neutral, warning and
 * danger bars all appear. The reset times are relative to the fixture's own
 * clock, because an absolute one would read as long expired.
 */
export const aiUsageFixture: DisplaySnapshot = {
  target: { kind: "view", id: "ai-usage" },
  canControl: false,
  view: {
    id: "ai-usage",
    name: "AI Usage",
    layout: "single",
    theme: "dark",
    access: "public",
    isControlEnabled: false,
    panels: [
      {
        id: "usage",
        specId: "ai-usage",
        bindings: { data: "usage" },
        settings: {},
      },
    ],
  },
  channels: {
    usage: {
      id: "usage",
      type: "ai-usage.v1",
      status: "ready",
      data: {
        providers: [
          {
            id: "claude",
            name: "Claude",
            isOk: true,
            planText: "Max",
            windows: [
              /*
               * Past the default threshold on purpose: this is the one row
               * in the fixture that exists to show the escalation, and a
               * fixture where nothing escalates would make the exception
               * invisible in every story and every screenshot.
               */
              {
                id: "session_5h",
                label: "5-hour limit",
                periodHours: 5,
                percentUsed: 88,
                resetsAtMs: Date.now() + 10_800_000,
              },
              {
                id: "weekly_all",
                label: "7-day limit",
                periodHours: 168,
                percentUsed: 54,
                resetsAtMs: Date.now() + 338_400_000,
              },
              {
                id: "weekly_scoped",
                label: "Weekly Fable",
                periodHours: 168,
                percentUsed: 31,
                resetsAtMs: Date.now() + 338_400_000,
              },
            ],
          },
          {
            id: "codex",
            name: "Codex",
            isOk: true,
            planText: "Plus",
            windows: [
              {
                id: "weekly",
                label: "7-day limit",
                periodHours: 168,
                percentUsed: 78,
                resetsAtMs: Date.now() + 432_000_000,
              },
            ],
          },
          {
            id: "grok",
            name: "Grok",
            isOk: true,
            windows: [
              {
                id: "monthly",
                label: "Monthly limit",
                periodHours: 720,
                percentUsed: 93,
                resetsAtMs: Date.now() + 864_000_000,
                usedText: "$18.60 / $20",
              },
            ],
          },
          {
            id: "cursor",
            name: "Cursor",
            isOk: false,
            problemText: "Sign-in expired",
            windows: [
              {
                id: "primary",
                label: "Monthly limit",
                periodHours: 720,
              },
            ],
          },
        ],
      },
    },
  },
}
