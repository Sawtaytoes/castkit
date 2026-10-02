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
