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

/**
 * Four invented children on one board. Times are relative to the fixture's
 * own clock, which the Storybook freezes under automation, so the scan is
 * always fresh in a screenshot and the running timer always started at the
 * same minute.
 */
export const kidsPointsFixture = ({
  hasScan,
}: {
  hasScan: boolean
}): DisplaySnapshot => ({
  target: { kind: "view", id: "kids-points" },
  canControl: false,
  view: {
    id: "kids-points",
    name: "Tally Marks",
    layout: "single",
    theme: "dark",
    access: "public",
    isControlEnabled: false,
    panels: [
      {
        id: "points",
        specId: "kids-points",
        bindings: { data: "points" },
        settings: {},
      },
    ],
  },
  channels: {
    points: {
      id: "points",
      type: "kids-points.v1",
      status: "ready",
      data: {
        kids: [
          {
            id: "quinn",
            name: "Quinn",
            color: "#E07A5F",
            pointsToday: 0,
            goal: 500,
          },
          {
            id: "robin",
            name: "Robin",
            color: "#81B29A",
            pointsToday: 130,
            goal: 500,
            lastTask: "Feed the Cat",
          },
          {
            id: "sky",
            name: "Sky",
            color: "#F2CC8F",
            pointsToday: 520,
            goal: 500,
            lastTask: "Unload the Dishwasher",
          },
          {
            id: "wren",
            name: "Wren",
            color: "#7A8BD6",
            pointsToday: 240,
            goal: 500,
            activeTask: {
              name: "Reading",
              startedAtMs: Date.now() - 1_200_000,
            },
          },
        ],
        ...(hasScan
          ? {
              lastScan: {
                kidId: "robin",
                result: "awarded",
                points: 10,
                taskName: "Feed the Cat",
                reader: "Hall Reader",
                atMs: Date.now() - 3_000,
              },
            }
          : {}),
      },
    },
  },
})

/** Fixed historical samples with negative entries and separate timed tasks. */
export const pointsHistoryFixture = (
  metric = "daily",
): DisplaySnapshot => ({
  target: { kind: "view", id: "points-history" },
  canControl: false,
  view: {
    id: "points-history",
    name: "Points History",
    layout: "single",
    theme: "dark",
    access: "public",
    isControlEnabled: false,
    panels: [
      {
        id: "history",
        specId: "points-history",
        bindings: { data: "history" },
        settings: { metric },
      },
    ],
  },
  channels: {
    history: {
      id: "history",
      type: "points-history.v1",
      status: "ready",
      data: {
        version: 1,
        generatedAtMs: Date.parse("2026-09-30T20:00:00Z"),
        range: {
          fromDay: "2026-09-28",
          toDay: "2026-09-30",
          dayCount: 3,
          timezone: "America/Chicago",
          isPartial: true,
        },
        source: {
          name: "influxdb",
          isFallback: false,
          message: null,
        },
        children: [
          {
            id: "robin",
            name: "Robin",
            color: "#80B918",
            pointsToday: 150,
            goalToday: 120,
            lifetimeEarned: 3000,
            spendable: 2600,
            totals: {
              net: 200,
              previousNet: 180,
              averagePerCalendarDay: 200 / 3,
              averagePerActiveDay: 200 / 3,
              activeDays: 3,
              qualifyingDays: 1,
              bonusPercent: 0,
              pointsToPenaltyRatio: 5,
            },
            days: [-50, 100, 150].map((net, index) => ({
              day: `2026-09-${28 + index}`,
              goal: 120,
              net,
              chores: index === 0 ? 0 : net,
              bonus: 0,
              penalty: index === 0 ? -50 : 0,
              reversals: 0,
              cumulative: [-50, 50, 200][index],
              minutes: { reading: [0, 30, 45][index] },
            })),
            tasks: [
              {
                key: "reading",
                name: "Reading",
                points: 250,
                minutes: 75,
                averageMinutesPerCalendarDay: 25,
                days: [0, 30, 45].map((minutes, index) => ({
                  day: `2026-09-${28 + index}`,
                  points: [0, 100, 150][index],
                  minutes,
                })),
              },
            ],
          },
        ],
      },
    },
  },
})
