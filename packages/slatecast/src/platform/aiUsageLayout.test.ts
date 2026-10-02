import { describe, expect, test } from "vitest"
import {
  BASE_PROVIDER_HEADING_HEIGHT,
  BASE_ROW_HEIGHT,
  BASE_VIEW_HEADING_HEIGHT,
  getColumnCount,
  getTypeScale,
  placeSections,
} from "./aiUsageLayout.ts"

const provider = ({
  id,
  rowCount,
}: {
  id: string
  rowCount: number
}) => ({
  provider: { id, name: id, isOk: true, windows: [] },
  rows: Array.from(
    { length: rowCount },
    (_unused, index) => ({
      usageWindow: { id: `${id}-${index}`, label: id },
      isEscalated: false,
    }),
  ),
})

const fiveProviders = [
  provider({ id: "claude", rowCount: 1 }),
  provider({ id: "codex", rowCount: 1 }),
  provider({ id: "codex_2", rowCount: 1 }),
  provider({ id: "grok", rowCount: 1 }),
  provider({ id: "cursor", rowCount: 1 }),
]

describe("getTypeScale", () => {
  test("a short panel stays at scale 1 rather than shrinking", () => {
    expect(getTypeScale(122)).toBe(1)
    expect(getTypeScale(280)).toBe(1)
  })

  test("a taller panel grows its type with the glass", () => {
    expect(getTypeScale(432)).toBeCloseTo(1.54, 2)
    expect(getTypeScale(492)).toBeCloseTo(1.76, 2)
  })

  test("the type stops growing at twice size", () => {
    expect(getTypeScale(1200)).toBe(2)
    expect(getTypeScale(5000)).toBe(2)
  })
})

describe("getColumnCount", () => {
  test("the 1360 x 480 letterbox gets three columns", () => {
    expect(
      getColumnCount({
        width: 1312,
        height: 432,
        scale: 1.54,
      }),
    ).toBe(3)
  })

  test("the 960 x 540 M5Paper gets two", () => {
    expect(
      getColumnCount({
        width: 912,
        height: 492,
        scale: 1.76,
      }),
    ).toBe(2)
  })

  test("the 250 x 122 pHAT is as wide-for-its-height as the letterbox and still gets one", () => {
    /*
     * Its aspect asks for two columns; its width cannot carry them. Width
     * wins, because a column too narrow for a label is not a column.
     */
    expect(
      getColumnCount({ width: 234, height: 106, scale: 1 }),
    ).toBe(1)
  })

  test("a square panel gets one column", () => {
    expect(
      getColumnCount({ width: 700, height: 700, scale: 2 }),
    ).toBe(1)
  })

  test("an unmeasured panel gets one column, not zero", () => {
    expect(
      getColumnCount({ width: 0, height: 0, scale: 1 }),
    ).toBe(1)
  })
})

describe("placeSections", () => {
  test("five providers fill three columns on the letterbox with nothing hidden", () => {
    const layout = placeSections({
      providerRows: fiveProviders,
      width: 1312,
      height: 432,
    })
    expect(layout.columnCount).toBe(3)
    expect(
      layout.columns.map((column) =>
        column.map((section) => section.provider.id),
      ),
    ).toStrictEqual([
      ["claude", "codex"],
      ["codex_2", "grok"],
      ["cursor"],
    ])
    expect(layout.hiddenRowCount).toBe(0)
  })

  test("one column on the same height holds three and counts the rest", () => {
    // What the letterbox looked like before columns: 1360 x 480 as a strip.
    const layout = placeSections({
      providerRows: fiveProviders,
      width: 250,
      height: 432,
    })
    expect(layout.columnCount).toBe(1)
    expect(layout.columns[0]?.length).toBe(2)
    expect(layout.hiddenRowCount).toBe(3)
  })

  test("a section moves whole to the next column rather than losing rows to a break", () => {
    /*
     * Kept under the scale reference height so every length is at scale 1.
     * The column holds 150 px: `first` spends 104 on its heading and one
     * row, leaving 46 — not enough for `second` at all. Without the move,
     * `second` would be dropped and counted; with it, `second` is drawn.
     */
    const height = BASE_VIEW_HEADING_HEIGHT + 150
    expect(getTypeScale(height)).toBe(1)
    const layout = placeSections({
      providerRows: [
        provider({ id: "first", rowCount: 1 }),
        provider({ id: "second", rowCount: 1 }),
      ],
      width: 1200,
      height,
    })
    expect(layout.columnCount).toBeGreaterThan(1)
    expect(
      layout.columns.map((column) =>
        column.map((section) => section.provider.id),
      ),
    ).toStrictEqual([["first"], ["second"]])
    expect(layout.hiddenRowCount).toBe(0)
  })

  test("a section too tall for an empty column is trimmed there, not skipped ahead", () => {
    const height =
      BASE_VIEW_HEADING_HEIGHT +
      BASE_PROVIDER_HEADING_HEIGHT +
      BASE_ROW_HEIGHT * 2
    const layout = placeSections({
      providerRows: [provider({ id: "tall", rowCount: 5 })],
      width: 1200,
      height,
    })
    expect(layout.columns).toHaveLength(1)
    expect(layout.columns[0]?.[0]?.rows).toHaveLength(2)
    expect(layout.hiddenRowCount).toBe(3)
  })

  test("a panel too short for any row places nothing and counts everything", () => {
    const layout = placeSections({
      providerRows: fiveProviders,
      width: 250,
      height: 60,
    })
    expect(layout.columns).toStrictEqual([])
    expect(layout.hiddenRowCount).toBe(5)
  })

  test("a provider with no rows takes no space", () => {
    const layout = placeSections({
      providerRows: [
        provider({ id: "empty", rowCount: 0 }),
        provider({ id: "real", rowCount: 1 }),
      ],
      width: 250,
      height: 200,
    })
    expect(
      layout.columns[0]?.map(
        (section) => section.provider.id,
      ),
    ).toStrictEqual(["real"])
  })
})

test("an adaptive tall rail stacks accounts and a shallow strip rotates them to fit", () => {
  const providerRows = fiveProviders.slice(0, 3)
  const rail = placeSections({
    providerRows,
    width: 420,
    height: 1000,
    isAdaptive: true,
  })
  expect(rail.columnCount).toBe(1)
  expect(rail.hiddenRowCount).toBe(0)
  const strip = placeSections({
    providerRows,
    width: 1100,
    height: 280,
    isAdaptive: true,
  })
  expect(strip.columnCount).toBe(3)
  expect(strip.hiddenRowCount).toBe(0)
})

test("omitting the view heading reclaims its height for another complete account", () => {
  const options = {
    providerRows: fiveProviders.slice(0, 2),
    width: 240,
    height: 220,
  }
  expect(placeSections(options).hiddenRowCount).toBe(1)
  expect(
    placeSections({ ...options, hasViewHeading: false })
      .hiddenRowCount,
  ).toBe(0)
})
