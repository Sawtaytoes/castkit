import { expect, test } from "vitest"
import {
  type CompositionItem,
  chooseCompositionLayout,
} from "./compositionLayout.ts"

const printer = (key: string): CompositionItem => ({
  key,
  priority: 3,
  isPrinter: true,
  aspectRatio: 16 / 9,
  minimumWidth: 280,
  minimumHeight: 260,
})
const ai: CompositionItem = {
  key: "ai",
  priority: 1,
  isPrinter: false,
  minimumWidth: 240,
  minimumHeight: 370,
}
const choose = (
  items: CompositionItem[],
  width = 1920,
  height = 1000,
  mode: "cards" | "rail" | "adaptive" = "adaptive",
) =>
  chooseCompositionLayout({
    items,
    width,
    height,
    gap: 12,
    mode,
    measureFacts: () => 220,
  })
test("one camera receives a large area beside a vertical usage rail", () => {
  const layout = choose([printer("one"), ai])
  expect(layout?.id).toBe("rail")
  expect(layout?.cells.one?.gridColumn).toBe("1 / span 1")
  expect(layout?.cells.ai?.gridColumn).toBe("2 / span 1")
})
test("several cameras can use cards and keep every supporting component", () => {
  const layout = choose(
    [printer("one"), printer("two"), printer("three"), ai],
    1920,
    1000,
    "cards",
  )
  expect(layout?.id).toBe("cards")
  expect(Object.keys(layout?.cells ?? {})).toEqual([
    "one",
    "two",
    "three",
    "ai",
  ])
})
test("the remaining component fills the screen when printers disappear", () => {
  const layout = choose([ai], 1920, 1000, "rail")
  expect(layout?.id).toBe("cards")
  expect(layout?.cells.ai?.gridColumn).toBe("1 / span 1")
  expect(layout?.style.gridTemplateRows).toBe(
    "minmax(0, 1000fr)",
  )
})

const quotas = (
  rowCounts: number[] = [1, 1, 1],
): CompositionItem => ({
  key: "usage",
  priority: 1,
  isPrinter: false,
  minimumWidth: 320,
  minimumHeight: 104,
  insetWidth: 26,
  insetHeight: 26,
  usageRows: rowCounts.map((rowCount, index) => ({
    provider: {
      id: `account-${index}`,
      name: `Account ${index}`,
      isOk: true,
      windows: [],
    },
    rows: Array.from(
      { length: rowCount },
      (_unused, rowIndex) => ({
        usageWindow: {
          id: `quota-${rowIndex}`,
          label: "Weekly",
        },
        isEscalated: false,
      }),
    ),
  })),
})
const cameras = ["one", "two", "three"].map((key) => ({
  ...printer(key),
  aspectRatio: 231 / 142,
  insetWidth: 26,
}))

test("a wide short viewport reclaims camera letterboxing for three full-width quota columns", () => {
  const layout = choose([...cameras, quotas()], 2024, 751)
  expect(layout?.id).toBe("cards")
  expect(layout?.cells.usage?.gridColumn).toBe("1 / span 3")
  expect(layout?.cells.usage?.gridRow).toBe("2 / span 1")
  const rail = choose(
    [...cameras, quotas()],
    2024,
    751,
    "rail",
  )
  const cameraArea = (candidate: typeof layout) =>
    candidate?.sections
      .filter((section) => section.priority === 3)
      .reduce((total, section) => {
        const width = Math.min(
          section.width,
          section.height * (section.aspectRatio ?? 1),
        )
        return (
          total +
          (width * width) / (section.aspectRatio ?? 1)
        )
      }, 0) ?? 0
  expect(cameraArea(layout)).toBeGreaterThan(
    cameraArea(rail),
  )
})

test("the supporting strip uses spare camera height to grow text without shrinking images", () => {
  const layout = choose([...cameras, quotas()], 2024, 1000)
  expect(layout?.cells.usage?.gridRow).toBe("2 / span 1")
  expect(
    layout?.sections.find(
      (section) => section.priority === 1,
    )?.width,
  ).toBeLessThanOrEqual(120)
})

test("quota fit budgets keep an account's multiple rows together", () => {
  const layout = choose(
    [...cameras, quotas([3, 1, 1])],
    2024,
    1000,
    "cards",
  )
  const quotaMinimum =
    layout?.sections.at(-1)?.minimumHeight
  expect(quotaMinimum).toBeCloseTo(184.6)
  expect(
    layout?.sections.at(-1)?.height,
  ).toBeGreaterThanOrEqual(quotaMinimum ?? 0)
})

test("raising usage priority changes the space allocation before camera area", () => {
  const ordinary = choose([...cameras, quotas()], 2024, 751)
  const promoted = choose(
    [...cameras, { ...quotas(), priority: 4 }],
    2024,
    751,
  )
  expect(
    promoted?.sections.find(
      (section) => section.priority === 4,
    )?.width,
  ).toBe(200)
  expect(
    ordinary?.sections.find(
      (section) => section.priority === 1,
    )?.width,
  ).toBeLessThan(200)
})

test("manual rail remains available and one camera prefers its larger side-by-side area", () => {
  expect(
    choose([printer("one"), quotas()], 1920, 1000)?.id,
  ).toBe("rail")
  expect(
    choose([...cameras, quotas()], 2024, 751, "rail")?.id,
  ).toBe("rail")
})
