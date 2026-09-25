import { describe, expect, test } from "vitest"
import {
  selectPrimaryWindow,
  selectProviderRows,
} from "./aiUsageRows.ts"

const usageWindow = ({
  id,
  periodHours,
  percentUsed,
}: {
  id: string
  periodHours?: number
  percentUsed?: number
}) => ({
  id,
  label: id,
  ...(periodHours === undefined ? {} : { periodHours }),
  ...(percentUsed === undefined ? {} : { percentUsed }),
})

const provider = ({
  id,
  windows,
}: {
  id: string
  windows: ReturnType<typeof usageWindow>[]
}) => ({ id, name: id, isOk: true, windows })

describe("selectPrimaryWindow", () => {
  test("takes the longest window that is not longer than a week", () => {
    const windows = [
      usageWindow({ id: "session", periodHours: 5 }),
      usageWindow({ id: "weekly", periodHours: 168 }),
      usageWindow({ id: "daily", periodHours: 24 }),
    ]
    expect(selectPrimaryWindow(windows)?.id).toBe("weekly")
  })

  test("a monthly allowance never outranks a weekly one", () => {
    const windows = [
      usageWindow({ id: "monthly", periodHours: 720 }),
      usageWindow({ id: "weekly", periodHours: 168 }),
    ]
    expect(selectPrimaryWindow(windows)?.id).toBe("weekly")
  })

  test("with nothing inside a week it takes the shortest window beyond it", () => {
    const windows = [
      usageWindow({ id: "yearly", periodHours: 8760 }),
      usageWindow({ id: "monthly", periodHours: 720 }),
    ]
    expect(selectPrimaryWindow(windows)?.id).toBe("monthly")
  })

  test("two windows of the same length keep the producer's order", () => {
    // Claude publishes an all-models weekly limit and a model-scoped one.
    // The all-models limit comes first because it is the one that stops work.
    const windows = [
      usageWindow({ id: "weekly_all", periodHours: 168 }),
      usageWindow({
        id: "weekly_scoped",
        periodHours: 168,
      }),
    ]
    expect(selectPrimaryWindow(windows)?.id).toBe(
      "weekly_all",
    )
  })

  test("an unclassified window is still shown rather than nothing", () => {
    const windows = [usageWindow({ id: "plan" })]
    expect(selectPrimaryWindow(windows)?.id).toBe("plan")
  })

  test("no windows at all selects nothing", () => {
    expect(selectPrimaryWindow([])).toBeUndefined()
  })
})

describe("selectProviderRows", () => {
  const providers = [
    provider({
      id: "claude",
      windows: [
        usageWindow({
          id: "session_5h",
          periodHours: 5,
          percentUsed: 90,
        }),
        usageWindow({
          id: "weekly_all",
          periodHours: 168,
          percentUsed: 66,
        }),
        usageWindow({
          id: "weekly_scoped",
          periodHours: 168,
          percentUsed: 49,
        }),
      ],
    }),
  ]

  test("the weekly limit leads and a spent session limit follows it", () => {
    const [entry] = selectProviderRows({ providers })
    expect(
      entry.rows.map((row) => [
        row.usageWindow.id,
        row.isEscalated,
      ]),
    ).toStrictEqual([
      ["weekly_all", false],
      ["session_5h", true],
    ])
  })

  test("a quiet session limit is left off entirely", () => {
    const [entry] = selectProviderRows({
      providers: [
        provider({
          id: "claude",
          windows: [
            usageWindow({
              id: "session_5h",
              periodHours: 5,
              percentUsed: 12,
            }),
            usageWindow({
              id: "weekly_all",
              periodHours: 168,
              percentUsed: 66,
            }),
          ],
        }),
      ],
    })
    expect(
      entry.rows.map((row) => row.usageWindow.id),
    ).toStrictEqual(["weekly_all"])
  })

  test("the threshold is the panel's to set", () => {
    const [entry] = selectProviderRows({
      providers,
      alertPercent: 40,
    })
    expect(
      entry.rows.map((row) => row.usageWindow.id),
    ).toStrictEqual([
      "weekly_all",
      "session_5h",
      "weekly_scoped",
    ])
  })

  test("a window with no percentage never escalates", () => {
    // Silence is not the same as being under the threshold, and a provider
    // that reports a window without a number has said nothing about it.
    const [entry] = selectProviderRows({
      providers: [
        provider({
          id: "codex",
          windows: [
            usageWindow({
              id: "weekly",
              periodHours: 168,
              percentUsed: 10,
            }),
            usageWindow({ id: "burst", periodHours: 1 }),
          ],
        }),
      ],
      alertPercent: 0,
    })
    expect(
      entry.rows.map((row) => row.usageWindow.id),
    ).toStrictEqual(["weekly"])
  })

  test("a provider with no windows contributes no rows", () => {
    const [entry] = selectProviderRows({
      providers: [provider({ id: "empty", windows: [] })],
    })
    expect(entry.rows).toStrictEqual([])
  })
})
