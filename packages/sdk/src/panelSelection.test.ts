import { expect, test } from "vitest"
import { selectPanelData } from "./panelSelection.ts"

const usage = {
  providers: [
    {
      id: "account",
      name: "Account",
      isOk: true,
      windows: [
        {
          id: "session",
          label: "5-hour",
          periodHours: 5,
          percentUsed: 80,
        },
        {
          id: "weekly",
          label: "Weekly",
          periodHours: 168,
          percentUsed: 65,
        },
        {
          id: "scoped",
          label: "Weekly scoped",
          periodHours: 168,
          percentUsed: 55,
        },
      ],
    },
    {
      id: "other",
      name: "Other",
      isOk: true,
      windows: [
        {
          id: "weekly",
          label: "Weekly",
          periodHours: 168,
          percentUsed: 30,
        },
      ],
    },
    {
      id: "zero",
      name: "Zero",
      isOk: true,
      windows: [
        {
          id: "weekly",
          label: "Weekly",
          periodHours: 168,
          percentUsed: 0,
        },
      ],
    },
  ],
}
const settings = {
  isProviderSelectionEnabled: true,
  providerIds: ["account", "zero"],
  isAlertReplacementEnabled: true,
  isPositiveUsageOnly: true,
  alertPercent: 80,
}

test("selection is per view and keeps the aggregate weekly quota at exactly 80 percent", () => {
  const selected = selectPanelData({
    specId: "ai-usage",
    settings,
    data: usage,
  }) as typeof usage
  expect(
    selected.providers.map((provider) => provider.id),
  ).toEqual(["account"])
  expect(
    selected.providers[0]?.windows.map(
      (window) => window.id,
    ),
  ).toEqual(["weekly"])
  expect(usage.providers[0]?.windows).toHaveLength(3)
  expect(
    (
      selectPanelData({
        specId: "ai-usage",
        settings: {},
        data: usage,
      }) as typeof usage
    ).providers,
  ).toHaveLength(3)
})

test("a shorter quota above 80 replaces the weekly quota instead of adding a row", () => {
  const data = {
    providers: usage.providers.map((provider) => ({
      ...provider,
      windows: provider.windows.map((window) =>
        window.id === "session"
          ? { ...window, percentUsed: 81 }
          : window,
      ),
    })),
  }
  const selected = selectPanelData({
    specId: "ai-usage",
    settings,
    data,
  }) as typeof usage
  expect(
    selected.providers[0]?.windows.map(
      (window) => window.id,
    ),
  ).toEqual(["session"])
})

test("an enabled empty selection hides all items while disabled selection includes all", () => {
  const data = { printers: [{ id: "one" }, { id: "two" }] }
  expect(
    selectPanelData({
      specId: "printer-status",
      data,
      settings: {
        isPrinterSelectionEnabled: true,
        printerIds: [],
      },
    }),
  ).toEqual({ printers: [] })
  expect(
    selectPanelData({
      specId: "printer-status",
      data,
      settings: { printerIds: [] },
    }),
  ).toEqual(data)
  expect(
    selectPanelData({
      specId: "printer-status",
      data,
      settings: {
        isPrinterSelectionEnabled: true,
        printerIds: ["two"],
      },
    }),
  ).toEqual({ printers: [{ id: "two" }] })
})

test("usage windows use account-qualified ids", () => {
  const selected = selectPanelData({
    specId: "ai-usage",
    settings: {
      isWindowSelectionEnabled: true,
      windowIds: ["account:weekly"],
      isPositiveUsageOnly: true,
    },
    data: usage,
  }) as typeof usage
  expect(
    selected.providers.map((provider) => provider.id),
  ).toEqual(["account"])
  expect(
    selected.providers[0]?.windows.map(
      (window) => window.id,
    ),
  ).toEqual(["weekly"])
})

test("excluded active bays do not keep the rip panel active", () => {
  const data = {
    isPresent: true,
    activeCount: 1,
    bays: [
      { id: "busy", jobId: "job", actions: ["cancel"] },
      { id: "idle", actions: [] },
    ],
  }
  expect(
    selectPanelData({
      specId: "rip-deck",
      settings: {
        isBaySelectionEnabled: true,
        bayIds: ["idle"],
      },
      data,
    }),
  ).toEqual({
    ...data,
    activeCount: 0,
    bays: [data.bays[1]],
  })
  expect(
    selectPanelData({
      specId: "rip-deck",
      settings: {},
      data,
    }),
  ).toEqual(data)
})
